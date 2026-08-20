#!/usr/bin/env node
/*
 * scripts/build-data.mjs — Régénération des données embarquées.
 * =============================================================
 *
 * L'application lit ses données objectives en direct depuis PokéAPI. Seuls
 * deux fichiers sont embarqués, et ce script sert à les reconstruire à partir
 * de sources lisibles par une machine, plutôt qu'à la main :
 *
 *   data/tiers.js / .json     Viabilité compétitive (tier list)
 *   data/names-fr.js / .json  Index de secours « nom français → identifiant »
 *
 * USAGE
 * -----
 *   node scripts/build-data.mjs --tiers        Régénère la table de viabilité
 *   node scripts/build-data.mjs --names        Régénère l'index des noms français
 *   node scripts/build-data.mjs --all          Les deux
 *   node scripts/build-data.mjs --export-json  Exporte les .js actuels en .json
 *                                              (hors ligne, aucun réseau)
 *   node scripts/build-data.mjs --self-test    Vérifie la logique sans réseau
 *
 * SOURCES
 * -------
 * --tiers : https://play.pokemonshowdown.com/data/formats-data.json
 *           Fichier officiel de Pokémon Showdown, maintenu avec les décisions
 *           de tier de Smogon. C'est la seule source de viabilité à la fois
 *           publique, structurée et mise à jour en continu ; les tier lists
 *           rédactionnelles (Game8, RankedBoost, PropelRC, Rosenberry Rooms)
 *           ne sont pas exploitables automatiquement et servent de
 *           recoupement manuel.
 *
 * --names : https://graphql.pokeapi.co/v1beta2 (repli : REST /pokemon-species)
 *           Noms d'espèces localisés, source officielle du projet PokéAPI.
 *
 * NOTE IMPORTANTE
 * ---------------
 * Les données livrées dans ce dépôt n'ont PAS pu être produites par ce script :
 * l'environnement de build n'avait pas accès au réseau vers ces hôtes. Elles
 * constituent un instantané curé. Lancer ce script remplace cet instantané par
 * des données fraîches et vérifiables — c'est la marche à suivre recommandée
 * avant toute utilisation sérieuse.
 */

import { writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data');

const SHOWDOWN_FORMATS = 'https://play.pokemonshowdown.com/data/formats-data.json';
const POKEAPI_GRAPHQL = 'https://graphql.pokeapi.co/v1beta2';
const POKEAPI_REST = 'https://pokeapi.co/api/v2';

/* ------------------------------------------------------------------ */
/* Correspondance tiers Smogon → échelle SS/S/A/B/C/D de l'application  */
/* ------------------------------------------------------------------ */

/*
 * Lecture de l'échelle Smogon :
 *   AG / Uber        Trop fort pour le jeu standard      → SS
 *   OU / UUBL        Pilier du métagame standard         → S
 *   UU / RUBL        Solide, pleinement viable           → A
 *   RU / NUBL        Correct, tiers inférieurs           → B
 *   NU / PUBL        Faible en compétitif                → C
 *   PU / ZU / NFE /  Très faible ou non évolué           → D
 *   LC / Illegal
 *
 * Les tiers entre parenthèses ("(OU)") désignent un Pokémon indisponible dans
 * le jeu courant : on les traite comme leur tier nu.
 */
const TIER_MAP = {
  AG: 'SS', UBER: 'SS',
  OU: 'S', UUBL: 'S',
  UU: 'A', RUBL: 'A',
  RU: 'B', NUBL: 'B',
  NU: 'C', PUBL: 'C',
  PU: 'D', ZUBL: 'D', ZU: 'D', NFE: 'D', LC: 'D', LCUBER: 'D'
};

/** Normalise un libellé de tier Showdown puis le traduit dans notre échelle. */
export function mapSmogonTier(raw) {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(/[()]/g, '').trim().toUpperCase();
  if (!cleaned || cleaned === 'ILLEGAL' || cleaned === 'UNRELEASED') return null;
  return TIER_MAP[cleaned] || null;
}

/** Identifiant Showdown ("greattusk") → identifiant PokéAPI ("great-tusk"). */
export function showdownIdToPokeApiSlug(id, displayName) {
  if (displayName) {
    return displayName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/['’.:]/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-');
  }
  return id;
}

/* ------------------------------------------------------------------ */
/* Réseau                                                              */
/* ------------------------------------------------------------------ */

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

function explainNetworkFailure(err, host) {
  console.error(`\n✖ Impossible de joindre ${host}.`);
  console.error(`  ${err.message}`);
  console.error('  Les fichiers existants n\'ont pas été modifiés.');
  console.error('  Vérifie ta connexion (ou ta politique de proxy) puis relance.\n');
}

/* ------------------------------------------------------------------ */
/* Génération : tiers                                                  */
/* ------------------------------------------------------------------ */

async function buildTiers() {
  console.log(`→ Téléchargement de ${SHOWDOWN_FORMATS}`);
  let payload;
  try {
    payload = await fetchJson(SHOWDOWN_FORMATS);
  } catch (err) {
    explainNetworkFailure(err, 'play.pokemonshowdown.com');
    process.exitCode = 1;
    return;
  }

  /* Le fichier est soit un objet nu, soit enveloppé dans BattleFormatsData. */
  const table = payload.BattleFormatsData || payload;
  const entries = {};
  let skipped = 0;

  for (const [id, info] of Object.entries(table)) {
    const tier = mapSmogonTier(info && info.tier);
    if (!tier) { skipped += 1; continue; }
    /* Source structurée et faisant autorité → confiance haute. */
    entries[showdownIdToPokeApiSlug(id, null)] = [tier, 2];
  }

  const meta = {
    generation: 9,
    games: 'Pokémon Écarlate / Violet (+ DLC)',
    snapshot: new Date().toISOString().slice(0, 7),
    sources: [
      'Pokémon Showdown / Smogon — formats-data.json (placements de tiers officiels)',
      'Recoupement manuel : Game8, RankedBoost, PropelRC, Rosenberry Rooms, Pikalytics'
    ],
    regenerate: 'node scripts/build-data.mjs --tiers',
    warning:
      'Table générée automatiquement depuis les placements de tiers de Smogon. ' +
      'Un Pokémon absent de la table est traité comme « tier inconnu » et ne peut ' +
      'donner lieu à aucune recommandation de remplacement.'
  };

  await writeTiersFiles(meta, entries);
  console.log(`✔ ${Object.keys(entries).length} entrées écrites (${skipped} ignorées : tier absent ou illégal).`);
}

async function writeTiersFiles(meta, entries) {
  const scaleSource = await readCurrentScale();

  const body = Object.keys(entries).sort().map(
    (slug) => `    ${JSON.stringify(slug)}: ${JSON.stringify(entries[slug])}`
  ).join(',\n');

  const js = `/*
 * data/tiers.js — Table de viabilité compétitive.
 * GÉNÉRÉ AUTOMATIQUEMENT par scripts/build-data.mjs — ne pas éditer à la main.
 *
 * Schéma : "<slug-pokeapi>": ["<TIER>", <confiance>]
 *   confiance 2 = haute (peut justifier une recommandation)
 *   confiance 1 = moyenne (peut seulement bloquer une recommandation)
 *
 * Un Pokémon absent de cette table a un tier inconnu : le moteur d'analyse
 * refuse alors toute recommandation de remplacement le concernant.
 */
(function (root) {
  'use strict';

  var SCALE = ${JSON.stringify(scaleSource, null, 2).split('\n').join('\n  ')};

  var ENTRIES = {
${body}
  };

  root.POKESTATS_TIERS = {
    meta: ${JSON.stringify(meta, null, 2).split('\n').join('\n    ')},
    scale: SCALE,
    entries: ENTRIES
  };
})(typeof window !== 'undefined' ? window : globalThis);
`;

  await writeFile(join(DATA, 'tiers.js'), js, 'utf8');
  await writeFile(
    join(DATA, 'tiers.json'),
    JSON.stringify({ meta, scale: scaleSource, entries }, null, 2) + '\n',
    'utf8'
  );
}

/** Relit l'échelle actuelle pour ne pas la réinventer à chaque génération. */
async function readCurrentScale() {
  const mod = await import(join(DATA, 'tiers.js'));
  void mod;
  return globalThis.POKESTATS_TIERS.scale;
}

/* ------------------------------------------------------------------ */
/* Génération : noms français                                          */
/* ------------------------------------------------------------------ */

async function fetchFrenchNames() {
  const query = `query { pokemonspeciesname(where: {language: {name: {_eq: "fr"}}}) {
    name pokemonspecy { name } } }`;

  try {
    const payload = await fetchJson(POKEAPI_GRAPHQL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });
    const rows = (payload.data?.pokemonspeciesname || [])
      .map((r) => ({ name: r.name, slug: r.pokemonspecy?.name }))
      .filter((r) => r.name && r.slug);
    if (rows.length) return rows;
    throw new Error('réponse GraphQL vide');
  } catch (err) {
    console.log(`  (GraphQL indisponible : ${err.message} — repli sur l'API REST)`);
  }

  /* Repli REST : plus lent (une requête par espèce) mais toujours disponible. */
  const list = await fetchJson(`${POKEAPI_REST}/pokemon-species?limit=2000`);
  const rows = [];
  const CONCURRENCY = 8;
  const queue = [...list.results];

  async function worker() {
    while (queue.length) {
      const item = queue.shift();
      const doc = await fetchJson(item.url);
      const fr = (doc.names || []).find((n) => n.language?.name === 'fr');
      if (fr) rows.push({ name: fr.name, slug: doc.name });
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return rows;
}

async function buildNames() {
  console.log('→ Récupération des noms français depuis PokéAPI');
  let rows;
  try {
    rows = await fetchFrenchNames();
  } catch (err) {
    explainNetworkFailure(err, 'pokeapi.co');
    process.exitCode = 1;
    return;
  }

  rows.sort((a, b) => a.slug.localeCompare(b.slug));
  const seed = {};
  for (const row of rows) seed[row.name] = row.slug;

  const body = rows.map(
    (r) => `    ${JSON.stringify(r.name)}: ${JSON.stringify(r.slug)}`
  ).join(',\n');

  const meta = {
    role: 'index complet — généré depuis PokéAPI',
    generatedAt: new Date().toISOString(),
    regenerate: 'node scripts/build-data.mjs --names',
    note:
      "Le nom français affiché par l'application provient toujours de PokéAPI " +
      '(/pokemon-species → names[fr]), jamais de cet index.'
  };

  const js = `/*
 * data/names-fr.js — Index « nom français → identifiant PokéAPI ».
 * GÉNÉRÉ AUTOMATIQUEMENT par scripts/build-data.mjs — ne pas éditer à la main.
 *
 * Cet index sert à traduire une saisie utilisateur en identifiant PokéAPI.
 * Le nom affiché à l'écran vient toujours de PokéAPI, jamais d'ici.
 */
(function (root) {
  'use strict';

  var SEED = {
${body}
  };

  root.POKESTATS_NAMES_FR = {
    meta: ${JSON.stringify(meta, null, 2).split('\n').join('\n    ')},
    seed: SEED
  };
})(typeof window !== 'undefined' ? window : globalThis);
`;

  await writeFile(join(DATA, 'names-fr.js'), js, 'utf8');
  await writeFile(
    join(DATA, 'names-fr.json'),
    JSON.stringify({ meta, seed }, null, 2) + '\n',
    'utf8'
  );
  console.log(`✔ ${rows.length} noms français écrits.`);
}

/* ------------------------------------------------------------------ */
/* Export JSON hors ligne                                              */
/* ------------------------------------------------------------------ */

/**
 * Exporte les .js embarqués vers leurs équivalents .json, sans réseau.
 * Utile pour outiller les données depuis un autre langage.
 */
async function exportJson() {
  await import(join(DATA, 'tiers.js'));
  await import(join(DATA, 'names-fr.js'));

  const tiers = globalThis.POKESTATS_TIERS;
  const namesFr = globalThis.POKESTATS_NAMES_FR;

  await writeFile(
    join(DATA, 'tiers.json'),
    JSON.stringify({ meta: tiers.meta, scale: tiers.scale, entries: tiers.entries }, null, 2) + '\n',
    'utf8'
  );
  await writeFile(
    join(DATA, 'names-fr.json'),
    JSON.stringify({ meta: namesFr.meta, seed: namesFr.seed }, null, 2) + '\n',
    'utf8'
  );

  console.log(`✔ data/tiers.json      (${Object.keys(tiers.entries).length} entrées)`);
  console.log(`✔ data/names-fr.json   (${Object.keys(namesFr.seed).length} entrées)`);
}

/* ------------------------------------------------------------------ */
/* Auto-test (sans réseau)                                             */
/* ------------------------------------------------------------------ */

function selfTest() {
  const assert = (cond, label) => {
    if (!cond) { console.error('  ✗ ' + label); process.exitCode = 1; }
    else console.log('  ✓ ' + label);
  };

  console.log('Auto-test de la correspondance des tiers :');
  assert(mapSmogonTier('Uber') === 'SS', 'Uber → SS');
  assert(mapSmogonTier('(Uber)') === 'SS', 'tier entre parenthèses traité comme le tier nu');
  assert(mapSmogonTier('OU') === 'S', 'OU → S');
  assert(mapSmogonTier('UUBL') === 'S', 'UUBL → S');
  assert(mapSmogonTier('UU') === 'A', 'UU → A');
  assert(mapSmogonTier('RU') === 'B', 'RU → B');
  assert(mapSmogonTier('NU') === 'C', 'NU → C');
  assert(mapSmogonTier('PU') === 'D', 'PU → D');
  assert(mapSmogonTier('NFE') === 'D', 'NFE → D');
  assert(mapSmogonTier('LC') === 'D', 'LC → D');
  assert(mapSmogonTier('Illegal') === null, 'Illegal → ignoré');
  assert(mapSmogonTier(undefined) === null, 'tier absent → ignoré');
  assert(mapSmogonTier('Inconnu') === null, 'tier non reconnu → ignoré (jamais deviné)');
}

/* ------------------------------------------------------------------ */

async function main() {
  const args = new Set(process.argv.slice(2));
  const all = args.has('--all');

  if (args.has('--self-test')) { selfTest(); return; }
  if (args.has('--export-json')) { await exportJson(); return; }

  if (!args.size) {
    console.log('Usage : node scripts/build-data.mjs [--tiers] [--names] [--all] [--export-json] [--self-test]');
    return;
  }

  if (all || args.has('--tiers')) await buildTiers();
  if (all || args.has('--names')) await buildNames();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
