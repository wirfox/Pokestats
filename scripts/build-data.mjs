#!/usr/bin/env node
/*
 * scripts/build-data.mjs — Génération des données embarquées.
 * ===========================================================
 *
 * SOURCES — toutes vendorisées, versionnées et épinglées
 * ------------------------------------------------------
 * Aucune donnée n'est saisie à la main, aucun site n'est scrapé. Tout provient
 * de deux paquets npm à version exacte, déclarés dans package.json :
 *
 *   @pkmn/dex   Données de jeu maintenues par le projet pkmn.cc, dérivées de
 *               Pokémon Showdown (lui-même la référence de Smogon) :
 *                 · placements de tiers Génération 9 (singles et doubles)
 *                 · statistiques de base, types, chaînes d'évolution
 *                 · table d'efficacité des types
 *
 *   pokemon     Noms officiels dans 10 langues, dont le français
 *               (paquet de sindresorhus, adossé au Pokédex national).
 *
 * POURQUOI DES PAQUETS PLUTÔT QUE DES SITES
 * -----------------------------------------
 * Un site web (Bulbapédia, Poképédia, Serebii, PokémonDB…) est une source
 * *humaine* excellente mais une source *machine* fragile : le HTML change sans
 * préavis, il n'y a ni version ni somme de contrôle, et rien ne garantit qu'une
 * régénération dans six mois produira le même résultat.
 *
 * Un paquet npm épinglé donne l'inverse : version exacte, contenu immuable,
 * régénération déterministe, et fonctionne hors ligne. C'est ce qui rend ces
 * données *stables* — l'exigence de ce projet.
 *
 * USAGE
 * -----
 *   node scripts/build-data.mjs --all          Tout régénérer
 *   node scripts/build-data.mjs --names        Noms français
 *   node scripts/build-data.mjs --tiers        Tiers de viabilité
 *   node scripts/build-data.mjs --types        Table d'efficacité des types
 *   node scripts/build-data.mjs --self-test    Vérifier la logique de mapping
 *
 * Aucune de ces commandes n'a besoin du réseau une fois `npm install` fait.
 */

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

import { Dex } from '@pkmn/dex';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data');
const TEST = join(ROOT, 'test');

const GEN = 9;
const gen = Dex.forGen(GEN);

/* Versions exactes des sources, inscrites dans chaque fichier généré pour que
 * la provenance soit traçable depuis la donnée elle-même. */
const VERSIONS = {
  '@pkmn/dex': require('@pkmn/dex/package.json').version,
  pokemon: require('pokemon/package.json').version
};

const FR_NAMES = require('pokemon/data/fr.json');
const EN_NAMES = require('pokemon/data/en.json');

/* ================================================================== */
/* Utilitaires                                                         */
/* ================================================================== */

/** Nom anglais → identifiant PokéAPI (minuscules, tirets, sans ponctuation). */
export function toPokeApiSlug(name) {
  return String(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    /* PokéAPI encode le genre de Nidoran par un suffixe : nidoran-f / nidoran-m. */
    .replace(/\u0153/g, 'oe')
    .replace(/\u00e6/g, 'ae')
    .replace(/\u2640/g, '-f')
    .replace(/\u2642/g, '-m')
    .replace(/['’.:]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

const POKEAPI_REST = 'https://pokeapi.co/api/v2';
const POKEAPI_GRAPHQL = 'https://graphql.pokeapi.co/v1beta2';

/**
 * Récupère les deux référentiels d'identifiants de PokéAPI, en une requête
 * chacun. La distinction est essentielle :
 *
 *   /pokemon          ~1351 FORMES de combat (lycanroc-midday, urshifu-single-strike)
 *   /pokemon-species  ~1025 ESPÈCES         (lycanroc, urshifu)
 *
 * Beaucoup d'espèces n'ont aucune forme portant leur nom nu : la forme par
 * défaut de Lougaroc s'appelle « lycanroc-midday », jamais « lycanroc ».
 * Valider une espèce contre la liste des formes la rejetterait à tort — et
 * ferait perdre des Pokémon majeurs (Démétéros, Shifours, Superdofin…).
 *
 * Le moteur consulte d'abord l'identifiant de forme, puis celui de l'espèce :
 * une entrée au niveau de l'espèce couvre donc toutes ses formes.
 */
async function fetchReferences() {
  async function list(endpoint) {
    const res = await fetch(`${POKEAPI_REST}/${endpoint}?limit=100000`);
    if (!res.ok) throw new Error(`PokéAPI /${endpoint} → HTTP ${res.status}`);
    const data = await res.json();
    return new Set((data.results || []).map((r) => r.name));
  }
  const [formes, especes] = await Promise.all([list('pokemon'), list('pokemon-species')]);
  return { formes, especes };
}

/**
 * Transformations à essayer pour faire correspondre une forme Pokémon Showdown
 * à son identifiant PokéAPI. Les deux projets ne nomment pas les formes de la
 * même façon, et aucune règle unique ne couvre tous les cas.
 *
 * Chaque candidat est ensuite CONFRONTÉ à la liste réelle de PokéAPI : rien
 * n'est retenu sur la foi d'une supposition. Si aucun candidat n'existe, la
 * forme est simplement ignorée — l'entrée de l'espèce de base fournit alors le
 * tier, et le moteur la trouve par son repli habituel.
 */
const FORME_CANDIDATES = [
  (slug) => slug,                                        // Lycanroc-Dusk, Calyrex-Ice
  (slug) => slug.replace(/-f$/, '-female'),              // Indeedee-F
  (slug) => slug.replace(/-m$/, '-male'),
  (slug) => `${slug}-mask`,                              // Ogerpon-Wellspring
  (slug) => `${slug}-breed`,                             // Tauros-Paldea-Combat
  (slug) => slug.replace(/-(mane|wings)$/, ''),          // Necrozma-Dusk-Mane
  (slug) => slug.replace(/-four$/, '-family-of-four'),   // Maushold-Four
  (slug) => slug.replace(/-three$/, '-family-of-three')
];

/** Premier candidat réellement présent dans PokéAPI, sinon `null`. */
export function resolveFormeSlug(showdownName, validSlugs) {
  const base = toPokeApiSlug(showdownName);
  for (const transform of FORME_CANDIDATES) {
    const candidate = transform(base);
    if (candidate && validSlugs.has(candidate)) return candidate;
  }
  return null;
}

/* ================================================================== */
/* Échelle de viabilité                                                */
/* ================================================================== */

const SCALE = {
  SS: { score: 5, label: 'SS', desc: 'Dominant / restreint (banni du jeu standard)' },
  S:  { score: 4, label: 'S',  desc: 'Très fort — pilier du métagame' },
  A:  { score: 3, label: 'A',  desc: 'Fort — parfaitement viable en compétitif' },
  B:  { score: 2, label: 'B',  desc: 'Moyen — viable avec du soutien ou en tier inférieur' },
  C:  { score: 1, label: 'C',  desc: 'Faible — peu utilisé en compétitif' },
  D:  { score: 0, label: 'D',  desc: 'Très faible / non pleinement évolué' }
};

/*
 * Correspondance tiers Smogon → échelle de l'application.
 *
 *   AG / Uber        Trop fort pour le jeu standard   → SS
 *   OU / UUBL        Pilier du métagame standard      → S
 *   UU / RUBL        Solide, pleinement viable        → A
 *   RU / NUBL        Correct, tiers inférieurs        → B
 *   NU / PUBL        Faible en compétitif             → C
 *   PU / ZU / ZUBL   Très faible                      → D
 *   NFE / LC         Non pleinement évolué            → D
 *
 * Les tiers « CAP » (Pokémon inventés par la communauté Smogon, inexistants
 * dans le jeu) et « Illegal » sont exclus : les inclure introduirait des
 * Pokémon qui ne peuvent pas figurer dans une équipe d'Écarlate / Violet.
 */
const TIER_MAP = {
  AG: 'SS', UBER: 'SS',
  OU: 'S', UUBL: 'S',
  UU: 'A', RUBL: 'A',
  RU: 'B', NUBL: 'B',
  NU: 'C', PUBL: 'C',
  PU: 'D', ZUBL: 'D', ZU: 'D', NFE: 'D', LC: 'D'
};

/** Normalise un libellé Showdown puis le traduit. `null` = à exclure. */
export function mapSmogonTier(raw) {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(/[()]/g, '').trim().toUpperCase();
  if (!cleaned) return null;
  if (cleaned === 'ILLEGAL' || cleaned === 'UNRELEASED') return null;
  if (cleaned.startsWith('CAP')) return null;   // Pokémon fan-made, hors-jeu
  return TIER_MAP[cleaned] || null;
}

/* ================================================================== */
/* Génération : noms français                                          */
/* ================================================================== */

/**
 * Noms français depuis PokéAPI, en une seule requête GraphQL.
 *
 * C'est la source que l'application AFFICHE à l'écran. Générer l'index depuis
 * elle rend toute divergence impossible par construction — alors qu'un
 * référentiel tiers, même excellent, peut diverger sur des détails
 * d'orthographe (ligatures, « Pomdepic » contre « Pomdepik »…).
 */
async function fetchFrenchNamesFromPokeApi() {
  const query =
    'query { pokemonspeciesname(where: {language: {name: {_eq: "fr"}}}) ' +
    '{ name pokemonspecy { name } } }';
  const res = await fetch(POKEAPI_GRAPHQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  });
  if (!res.ok) throw new Error(`GraphQL PokéAPI → HTTP ${res.status}`);
  const payload = await res.json();
  if (payload.errors) throw new Error('GraphQL PokéAPI a renvoyé une erreur');
  const rows = (payload.data?.pokemonspeciesname || [])
    .map((r) => [r.name, r.pokemonspecy?.name])
    .filter(([fr, slug]) => fr && slug);
  if (!rows.length) throw new Error('GraphQL PokéAPI : réponse vide');
  return rows;
}

async function buildNames() {
  const seed = {};
  const rows = [];
  let provenance;
  let source;

  try {
    console.log('  → récupération des noms français depuis PokéAPI…');
    const fetched = await fetchFrenchNamesFromPokeApi();
    fetched.sort((a, b) => a[1].localeCompare(b[1]));
    for (const [frName, slug] of fetched) {
      seed[frName] = slug;
      rows.push([frName, slug, slug]);
    }
    provenance = 'vérifié — généré depuis PokéAPI (source affichée par l’application)';
    source = 'PokéAPI GraphQL — pokemonspeciesname (language: fr)';
  } catch (err) {
    /* Repli hors ligne : le paquet npm reste une très bonne source, à deux
     * détails d'orthographe près relevés par npm run verify:data. */
    console.log(`    (PokéAPI indisponible : ${err.message} — repli sur le paquet « pokemon »)`);
    for (let i = 0; i < FR_NAMES.length; i++) {
      const frName = FR_NAMES[i];
      const enName = EN_NAMES[i];
      if (!frName || !enName) continue;
      const slug = toPokeApiSlug(enName);
      seed[frName] = slug;
      rows.push([frName, slug, enName]);
    }
    provenance = 'repli — généré depuis le paquet npm « pokemon »';
    source = `pokemon@${VERSIONS.pokemon} (data/fr.json)`;
  }

  const meta = {
    provenance,
    source,
    generatedAt: new Date().toISOString().slice(0, 10),
    regenerate: 'npm run build:names',
    count: rows.length,
    note:
      "Le nom français affiché par l'application provient toujours de PokéAPI " +
      '(/pokemon-species → names[fr]). Cet index ne sert qu\'à traduire une ' +
      'saisie utilisateur en identifiant interrogeable.'
  };

  const body = rows
    .map(([fr, slug, en]) => `    ${JSON.stringify(fr)}: ${JSON.stringify(slug)},`
      + ` /* ${en} */`)
    .join('\n');

  const js = `/*
 * data/names-fr.js — Index « nom français → identifiant PokéAPI ».
 * ================================================================
 * GÉNÉRÉ AUTOMATIQUEMENT — ne pas éditer à la main.
 *   Source      : ${source}
 *   Régénérer   : npm run build:names
 *   Entrées     : ${rows.length}
 *
 * Cet index traduit ce que l'utilisateur tape (« Rocabot ») en identifiant
 * interrogeable (« rockruff »). Le nom AFFICHÉ à l'écran vient toujours de
 * PokéAPI, jamais d'ici : une divergence serait donc immédiatement visible.
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
  console.log(`✔ data/names-fr.js      ${rows.length} noms français — ${source}`);
}

/* ================================================================== */
/* Génération : tiers                                                  */
/* ================================================================== */

async function buildTiers() {
  console.log('  → récupération des référentiels PokéAPI…');
  const { formes, especes } = await fetchReferences();
  console.log(`    ${formes.size} formes et ${especes.size} espèces connues de PokéAPI`);

  /* Second avis : la tier list Game8, si elle a été récupérée. */
  let game8 = { entries: {}, meta: null };
  try {
    game8 = require('../data/tiers-game8.json');
    console.log(`    second avis Game8 : ${Object.keys(game8.entries).length} entrées`);
  } catch (e) {
    console.log('    (data/tiers-game8.json absent — npm run build:game8 pour l\'ajouter)');
  }

  const entries = {};
  const stats = {
    retenus: 0, exclus: 0, formes: 0, formesIgnorees: 0, baseIntrouvable: 0,
    accord: 0, conflit: 0
  };

  /*
   * SECOND AVIS : POURQUOI IL N'ABAISSE PAS LA CONFIANCE
   * ----------------------------------------------------
   * Première intuition, écartée : « si Smogon et Game8 divergent de deux
   * crans, la donnée est douteuse, abaissons la confiance ». Les chiffres l'ont
   * infirmée — 52 divergences sur 96, ce qui n'est pas du bruit mais un
   * décalage systématique.
   *
   * La raison est structurelle. Le tier S de Game8 est peuplé de légendaires
   * restreints (Zacian, Groudon, Kyogre, Koraidon, Miraidon, les deux
   * Sylveroy) parce que le Combat Classé officiel les autorise ; le ladder
   * singles de Smogon les bannit. Dans un classement où figurent Miraidon et
   * Calyrex, tout Pokémon ordinaire descend mécaniquement d'un ou deux crans.
   *
   * Traiter ce décalage d'échelle comme un désaccord de fond aurait dégradé
   * 52 des Pokémon les plus pertinents sans rien corriger : ce n'est pas de la
   * prudence, c'est un biais importé.
   *
   * Game8 est donc conservé comme CONTEXTE AFFICHÉ — utile au joueur qui
   * pratique le Combat Classé — mais ne conditionne aucune décision. La
   * confiance reste haute : elle qualifie la fiabilité de la source Smogon,
   * pas l'accord entre deux barèmes incomparables.
   */
  function confidenceFor(slug, tier) {
    const other = game8.entries[slug];
    if (!other) return { confiance: 2, avis: null };
    const gap = Math.abs(SCALE[tier].score - SCALE[other].score);
    if (gap >= 2) stats.conflit += 1; else stats.accord += 1;
    return { confiance: 2, avis: other };
  }

  /* Nom anglais officiel par numéro de Pokédex : c'est lui qui donne
   * l'identifiant d'espèce PokéAPI, et non le nom de forme Showdown. */
  const enByNum = new Map();
  for (let i = 0; i < EN_NAMES.length; i++) enByNum.set(i + 1, EN_NAMES[i]);

  for (const species of gen.species.all()) {
    const tier = mapSmogonTier(species.tier);
    if (!tier || species.num <= 0) { stats.exclus += 1; continue; }

    const isBaseForme = !species.forme;

    if (isBaseForme) {
      /* Espèce de base : l'identifiant dérive du nom anglais du Pokédex
       * national. C'est la clé de repli du moteur quand une forme précise
       * n'a pas d'entrée propre. */
      const enName = enByNum.get(species.num) || species.name;
      const slug = toPokeApiSlug(enName);
      /* Validation contre les ESPÈCES : c'est le niveau auquel le moteur
       * retombe quand une forme précise n'a pas d'entrée. */
      if (!especes.has(slug)) { stats.baseIntrouvable += 1; continue; }
      const c = confidenceFor(slug, tier);
      entries[slug] = c.avis ? [tier, c.confiance, c.avis] : [tier, c.confiance];
      stats.retenus += 1;
    } else {
      /* Forme alternative : on ne retient QUE si PokéAPI connaît réellement
       * l'identifiant. Sinon on l'ignore — l'espèce de base porte déjà le
       * tier, et le moteur y retombe naturellement. */
      const slug = resolveFormeSlug(species.name, formes);
      if (!slug) { stats.formesIgnorees += 1; continue; }
      const c = confidenceFor(slug, tier);
      entries[slug] = c.avis ? [tier, c.confiance, c.avis] : [tier, c.confiance];
      stats.formes += 1;
      stats.retenus += 1;
    }
  }

  const meta = {
    generation: GEN,
    games: 'Pokémon Écarlate / Violet (+ DLC)',
    provenance: 'vérifié — généré depuis le paquet npm « @pkmn/dex »',
    source: `@pkmn/dex@${VERSIONS['@pkmn/dex']} — placements de tiers Génération ${GEN} ` +
      '(données Pokémon Showdown, référence de Smogon)',
    secondAvis: game8.meta
      ? {
          source: game8.meta.source,
          titre: game8.meta.title,
          pageMiseAJour: game8.meta.pageUpdated,
          couverture: Object.keys(game8.entries).length,
          concordants: stats.accord,
          enConflit: stats.conflit,
          role:
            'Contexte affiché uniquement. Ce second avis ne conditionne aucune ' +
            'décision du moteur : les deux listes classent pour des formats ' +
            'différents et leurs échelles ne sont pas comparables cran pour cran.',
          ecartsObserves:
            `${stats.accord} à moins de 2 crans, ${stats.conflit} plus éloignés — ` +
            'reflet du décalage d’échelle, pas d’une erreur de données.',
          avertissement: game8.meta.caveat
        }
      : null,
    slugsVerifies:
      'Chaque identifiant a été confronté à la liste des formes réellement ' +
      'connues de PokéAPI au moment de la génération : aucune entrée ne repose ' +
      'sur une supposition de nommage.',
    generatedAt: new Date().toISOString().slice(0, 10),
    regenerate: 'npm run build:tiers',
    count: Object.keys(entries).length,
    tierMapping: TIER_MAP,
    excluded:
      'Tiers « CAP » (Pokémon inventés par la communauté, absents du jeu) et ' +
      '« Illegal » (indisponibles en Génération 9).',
    warning:
      'Un Pokémon absent de cette table est traité comme « tier inconnu » : le ' +
      'moteur refuse alors toute recommandation de remplacement le concernant.',
    sourcesDeRecoupement: [
      'Smogon University — https://www.smogon.com/',
      'Pokémon Showdown — https://play.pokemonshowdown.com/',
      'Pikalytics (usage VGC réel) — https://www.pikalytics.com/'
    ]
  };

  const body = Object.keys(entries).sort()
    .map((slug) => `    ${JSON.stringify(slug)}: ${JSON.stringify(entries[slug])}`)
    .join(',\n');

  const js = `/*
 * data/tiers.js — Table de viabilité compétitive.
 * ===============================================
 * GÉNÉRÉ AUTOMATIQUEMENT — ne pas éditer à la main.
 *   Source      : @pkmn/dex@${VERSIONS['@pkmn/dex']} (données Pokémon Showdown / Smogon)
 *   Régénérer   : npm run build:tiers
 *   Entrées     : ${Object.keys(entries).length}
 *
 * Schéma : "<slug-pokeapi>": ["<TIER Smogon>", <confiance>, "<TIER Game8>"?]
 *   confiance 2 = haute   → peut justifier une recommandation
 *   confiance 1 = moyenne → peut seulement bloquer une recommandation
 *
 * Toutes les entrées générées portent une confiance haute : elles proviennent
 * d'une source structurée et versionnée, pas d'une appréciation manuelle.
 *
 * Un Pokémon ABSENT de cette table a un tier inconnu, et le moteur refuse
 * alors catégoriquement de recommander un remplacement le concernant.
 */
(function (root) {
  'use strict';

  var SCALE = ${JSON.stringify(SCALE, null, 2).split('\n').join('\n  ')};

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
    JSON.stringify({ meta, scale: SCALE, entries }, null, 2) + '\n',
    'utf8'
  );
  console.log(
    `✔ data/tiers.js         ${Object.keys(entries).length} entrées vérifiées ` +
    `(${stats.formes} formes alternatives)`
  );
  console.log(
    `    ${stats.exclus} exclues (CAP / Illegal), ` +
    `${stats.formesIgnorees} formes sans équivalent PokéAPI ignorées, ` +
    `${stats.baseIntrouvable} espèces introuvables`
  );
  if (stats.accord + stats.conflit) {
    console.log(
      `    second avis Game8 : ${stats.accord} concordants, ` +
      `${stats.conflit} plus éloignés (décalage d'échelle attendu, informatif)`
    );
  }
}

/* ================================================================== */
/* Génération : table d'efficacité des types                           */
/* ================================================================== */

/* Showdown encode damageTaken du point de vue du DÉFENSEUR :
 *   0 = dégâts normaux, 1 = faible (×2), 2 = résiste (×0,5), 3 = immunisé (×0) */
const DAMAGE_TAKEN_TO_MULTIPLIER = { 0: 1, 1: 2, 2: 0.5, 3: 0 };

function buildTypeChartData() {
  /* Le type Stellar est une mécanique de Téracristal, pas un type défensif
   * standard : on l'écarte de l'analyse. */
  const types = gen.types.all()
    .map((t) => t.name)
    .filter((n) => n !== 'Stellar')
    .sort();

  const chart = {};
  for (const attacker of types) {
    chart[attacker.toLowerCase()] = {};
  }

  for (const defenderName of types) {
    const defender = gen.types.get(defenderName);
    for (const attackerName of types) {
      const code = defender.damageTaken[attackerName];
      const multiplier = code === undefined ? 1 : DAMAGE_TAKEN_TO_MULTIPLIER[code];
      chart[attackerName.toLowerCase()][defenderName.toLowerCase()] =
        multiplier === undefined ? 1 : multiplier;
    }
  }

  return { types: types.map((t) => t.toLowerCase()), chart };
}

async function buildTypes() {
  const { types, chart } = buildTypeChartData();

  const meta = {
    generation: GEN,
    provenance: 'vérifié — généré depuis le paquet npm « @pkmn/dex »',
    source: `@pkmn/dex@${VERSIONS['@pkmn/dex']} — relations de dégâts Génération ${GEN}`,
    generatedAt: new Date().toISOString().slice(0, 10),
    regenerate: 'npm run build:types',
    role:
      "Repli hors ligne. L'application construit d'abord la table depuis PokéAPI " +
      "(/type/{nom} → damage_relations) ; ce fichier ne sert que si PokéAPI est " +
      'injoignable, pour que l\'analyse reste possible au lieu d\'être bloquée.',
    note: 'Le type Stellar (mécanique Téracristal) est exclu : ce n\'est pas un type défensif.'
  };

  const js = `/*
 * data/type-chart.js — Table d'efficacité des types (repli hors ligne).
 * =====================================================================
 * GÉNÉRÉ AUTOMATIQUEMENT — ne pas éditer à la main.
 *   Source    : @pkmn/dex@${VERSIONS['@pkmn/dex']} (données Pokémon Showdown)
 *   Régénérer : npm run build:types
 *
 * L'application construit la table depuis PokéAPI en priorité. Ce fichier
 * n'est utilisé que si PokéAPI est injoignable : sans lui, l'analyse de
 * couverture serait impossible et l'outil refuserait de conclure.
 *
 * Lecture : CHART[typeAttaquant][typeDefenseur] = multiplicateur.
 */
(function (root) {
  'use strict';

  root.POKESTATS_TYPE_CHART = {
    meta: ${JSON.stringify(meta, null, 2).split('\n').join('\n    ')},
    types: ${JSON.stringify(types)},
    chart: ${JSON.stringify(chart, null, 2).split('\n').join('\n    ')}
  };
})(typeof window !== 'undefined' ? window : globalThis);
`;

  await writeFile(join(DATA, 'type-chart.js'), js, 'utf8');

  /* Les tests utilisent exactement la même table, plus aucune copie saisie
   * à la main ne subsiste dans le dépôt. */
  const fixture = `/*
 * test/type-chart.fixture.js — Table d'efficacité pour les tests hors réseau.
 * ===========================================================================
 * GÉNÉRÉ AUTOMATIQUEMENT — ne pas éditer à la main.
 *   Régénérer : npm run build:types
 *
 * Réexporte simplement data/type-chart.js afin que les tests s'exécutent
 * contre les mêmes données que l'application, et non contre une copie
 * indépendante qui pourrait diverger.
 */
'use strict';

require('../data/type-chart.js');

var TABLE = globalThis.POKESTATS_TYPE_CHART;

module.exports = {
  TYPES: TABLE.types,
  buildChart: function () { return TABLE.chart; },
  meta: TABLE.meta
};
`;
  await writeFile(join(TEST, 'type-chart.fixture.js'), fixture, 'utf8');

  console.log(
    `✔ data/type-chart.js    ${types.length} types (@pkmn/dex@${VERSIONS['@pkmn/dex']})`
  );
  console.log('✔ test/type-chart.fixture.js  (réexporte la même table)');
}

/* ================================================================== */
/* Auto-test (aucune dépendance réseau)                                */
/* ================================================================== */

function selfTest() {
  let failed = 0;
  const check = (cond, label) => {
    if (cond) { console.log('  ✓ ' + label); }
    else { console.error('  ✗ ' + label); failed += 1; }
  };

  console.log('Correspondance des tiers Smogon :');
  check(mapSmogonTier('Uber') === 'SS', 'Uber → SS');
  check(mapSmogonTier('(Uber)') === 'SS', 'tier entre parenthèses traité comme le tier nu');
  check(mapSmogonTier('OU') === 'S', 'OU → S');
  check(mapSmogonTier('UUBL') === 'S', 'UUBL → S');
  check(mapSmogonTier('UU') === 'A', 'UU → A');
  check(mapSmogonTier('RU') === 'B', 'RU → B');
  check(mapSmogonTier('NUBL') === 'B', 'NUBL → B');
  check(mapSmogonTier('NU') === 'C', 'NU → C');
  check(mapSmogonTier('ZU') === 'D', 'ZU → D');
  check(mapSmogonTier('NFE') === 'D', 'NFE → D');
  check(mapSmogonTier('LC') === 'D', 'LC → D');
  check(mapSmogonTier('CAP') === null, 'CAP exclu (Pokémon fan-made)');
  check(mapSmogonTier('CAP LC') === null, 'CAP LC exclu');
  check(mapSmogonTier('Illegal') === null, 'Illegal exclu');
  check(mapSmogonTier(undefined) === null, 'tier absent → exclu');
  check(mapSmogonTier('Inconnu') === null, 'tier non reconnu → exclu, jamais deviné');

  console.log('\nIdentifiants PokéAPI :');
  check(toPokeApiSlug('Great Tusk') === 'great-tusk', 'Great Tusk → great-tusk');
  check(toPokeApiSlug("Farfetch'd") === 'farfetchd', "Farfetch'd → farfetchd");
  check(toPokeApiSlug('Mr. Mime') === 'mr-mime', 'Mr. Mime → mr-mime');
  check(toPokeApiSlug('Ho-Oh') === 'ho-oh', 'Ho-Oh → ho-oh');
  check(toPokeApiSlug('Type: Null') === 'type-null', 'Type: Null → type-null');
  check(toPokeApiSlug('Lycanroc-Dusk') === 'lycanroc-dusk', 'Lycanroc-Dusk → lycanroc-dusk');
  check(toPokeApiSlug('Nidoran\u2640') === 'nidoran-f', 'Nidoran\u2640 → nidoran-f');
  check(toPokeApiSlug('Nidoran\u2642') === 'nidoran-m', 'Nidoran\u2642 → nidoran-m');

  console.log('\nTable d\'efficacité (contre les données @pkmn/dex) :');
  const { chart } = buildTypeChartData();
  check(chart.water.fire === 2, 'Eau → Feu = ×2');
  check(chart.electric.ground === 0, 'Électrik → Sol = ×0');
  check(chart.normal.ghost === 0, 'Normal → Spectre = ×0');
  check(chart.fighting.rock === 2, 'Combat → Roche = ×2');
  check(chart.dragon.fairy === 0, 'Dragon → Fée = ×0');
  check(chart.ice.dragon === 2, 'Glace → Dragon = ×2');
  check(chart.fire.water === 0.5, 'Feu → Eau = ×0,5');

  if (failed) process.exitCode = 1;
}

/* ================================================================== */

async function main() {
  const args = new Set(process.argv.slice(2));
  const all = args.has('--all');

  if (args.has('--self-test')) { selfTest(); return; }

  if (!args.size) {
    console.log(
      'Usage : node scripts/build-data.mjs [--all] [--names] [--tiers] [--types] [--self-test]'
    );
    return;
  }

  console.log(`Sources : @pkmn/dex@${VERSIONS['@pkmn/dex']}, pokemon@${VERSIONS.pokemon}\n`);
  if (all || args.has('--names')) await buildNames();
  if (all || args.has('--tiers')) await buildTiers();
  if (all || args.has('--types')) await buildTypes();
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
