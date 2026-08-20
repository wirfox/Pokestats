#!/usr/bin/env node
/*
 * scripts/fetch-game8.mjs — Récupération de la tier list Game8 (Écarlate/Violet).
 * ==============================================================================
 *
 * POURQUOI UNE DEUXIÈME TIER LIST
 * -------------------------------
 * `data/tiers.js` s'appuie sur les placements Smogon (via @pkmn/dex). Game8
 * classe pour un AUTRE format : le Combat Classé officiel, où les légendaires
 * restreints sont autorisés. Les deux listes ne mesurent donc pas la même
 * chose et ne peuvent pas être fusionnées en un seul chiffre — ce serait
 * inventer une donnée qui n'existe nulle part.
 *
 * Game8 sert donc de SECOND AVIS :
 *   · les deux sources s'accordent      → confiance haute maintenue ;
 *   · elles divergent d'au moins 2 crans → confiance abaissée, et le tier ne
 *     peut plus JUSTIFIER une recommandation (il peut encore la bloquer).
 *
 * C'est la règle « en cas de conflit entre sources, sois prudent » appliquée
 * littéralement.
 *
 * USAGE :  node scripts/fetch-game8.mjs
 * SORTIE : data/tiers-game8.json
 */

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data');

const SOURCE_URL = 'https://game8.co/games/Pokemon-Scarlet-Violet/archives/397587';
const POKEAPI = 'https://pokeapi.co/api/v2';

/* `fetch` de Node ignore HTTPS_PROXY : on se relance avec le support activé. */
const PROXY = process.env.HTTPS_PROXY || process.env.https_proxy;
if (PROXY && !process.env.NODE_USE_ENV_PROXY) {
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...process.argv.slice(2)],
    { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1' } });
  process.exit(r.status === null ? 1 : r.status);
}

function toSlug(name) {
  return String(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’.:()]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Identifiants PokéAPI possibles pour un libellé Game8.
 *
 * Les libellés viennent du texte alternatif des images et portent des
 * artefacts (« Grey », « Icon ») ainsi que des conventions maison
 * (« Landorus-T », « Wash Rotom », « Calyrex (Shadow Rider) »).
 *
 * IMPORTANT : aucun repli sur l'espèce de base. Rabattre « Calyrex (Shadow
 * Rider) » sur « calyrex » attribuerait à la monture le tier de la forme nue
 * et fabriquerait un désaccord qui n'existe pas. Un libellé non résolu est
 * signalé, jamais deviné.
 */
function candidateSlugs(label) {
  const cleaned = label
    .replace(/\s+(Grey|Icon)$/i, '')
    .replace(/\s+Style$/i, '')
    .trim();

  const out = [];
  const push = (v) => { if (v && !out.includes(v)) out.push(v); };

  push(toSlug(cleaned));
  push(toSlug(cleaned).replace(/-t$/, '-therian'));
  push(toSlug(cleaned).replace(/-m$/, '-male'));
  push(toSlug(cleaned).replace(/-f$/, '-female'));

  const paren = cleaned.match(/^(.+?)\s*\((.+)\)$/);          // Calyrex (Shadow Rider)
  if (paren) {
    push(toSlug(`${paren[1]}-${paren[2]}`));
    push(toSlug(`${paren[1]}-${paren[2].split(/\s+/)[0]}`));  // → calyrex-shadow
  }

  /* Les suffixes régionaux de PokéAPI ne se déduisent pas de l'adjectif
   * anglais : « Alolan » donne « alola », pas « alol ». */
  const REGIONS = { alolan: 'alola', galarian: 'galar', hisuian: 'hisui', paldean: 'paldea' };
  const regional = cleaned.match(/^(Alolan|Galarian|Hisuian|Paldean)\s+(.+)$/i);
  if (regional) {
    push(toSlug(`${regional[2]}-${REGIONS[regional[1].toLowerCase()]}`));
  }

  const rotom = cleaned.match(/^(Wash|Heat|Frost|Fan|Mow)\s+Rotom$/i);
  if (rotom) push(`rotom-${rotom[1].toLowerCase()}`);

  const ogerpon = cleaned.match(/^Ogerpon\s+(Hearthflame|Wellspring|Cornerstone)$/i);
  if (ogerpon) push(`ogerpon-${ogerpon[1].toLowerCase()}-mask`);

  const urshifu = cleaned.match(/^Urshifu\s+(Rapid|Single)\s+Strike$/i);
  if (urshifu) {
    push(urshifu[1].toLowerCase() === 'rapid' ? 'urshifu-rapid-strike' : 'urshifu-single-strike');
  }

  return out;
}

/**
 * Identifiants acceptables : les FORMES de combat et les ESPÈCES.
 *
 * Certains libellés Game8 désignent l'espèce sans préciser la forme
 * (« Mimikyu »), or PokéAPI n'expose que « mimikyu-disguised » côté formes.
 * L'identifiant d'espèce reste valide — le moteur le consulte en repli — et
 * ne risque pas de désigner un autre Pokémon.
 */
async function fetchValidSlugs() {
  async function list(endpoint) {
    const res = await fetch(`${POKEAPI}/${endpoint}?limit=100000`);
    if (!res.ok) throw new Error(`PokéAPI /${endpoint} → HTTP ${res.status}`);
    return (await res.json()).results.map((r) => r.name);
  }
  const [formes, especes] = await Promise.all([list('pokemon'), list('pokemon-species')]);
  return new Set([...formes, ...especes]);
}

/** Extrait les tiers depuis le HTML : Game8 encode tout en texte alternatif. */
export function parseGame8(htmlText) {
  const tables = htmlText.match(/<table[\s\S]*?<\/table>/g) || [];
  let best = {};

  for (const table of tables) {
    const found = {};
    for (const row of table.match(/<tr>[\s\S]*?<\/tr>/g) || []) {
      const head = row.match(/<th>([\s\S]*?)<\/th>/);
      if (!head) continue;
      const tier = head[1].match(/alt='(SS|S|A|B|C|D)\s*Tier(?:\.png)?'/);
      if (!tier) continue;
      const names = [...row.matchAll(/alt='Pokemon Scarlet and Violet SV - ([^']+)'/g)]
        .map((m) => m[1].trim());
      found[tier[1]] = [...new Set(names)];
    }
    const size = Object.values(found).reduce((n, v) => n + v.length, 0);
    if (size > Object.values(best).reduce((n, v) => n + v.length, 0)) best = found;
  }
  return best;
}

async function main() {
  console.log(`→ ${SOURCE_URL}`);
  const res = await fetch(SOURCE_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PokeStats/1.0; +recherche de tier list)' }
  });
  if (!res.ok) throw new Error(`Game8 → HTTP ${res.status}`);
  const htmlText = await res.text();

  const updated = (htmlText.match(/Last updated on:\s*([^<]{5,40})/) || [])[1] || 'inconnu';
  const parsed = parseGame8(htmlText);
  const total = Object.values(parsed).reduce((n, v) => n + v.length, 0);
  if (!total) throw new Error('aucun tier extrait — la structure de la page a probablement changé');

  console.log(`  ${total} Pokémon extraits (page mise à jour le ${updated.trim()})`);
  console.log('  → appariement avec les identifiants PokéAPI…');
  const valid = await fetchValidSlugs();

  const entries = {};
  const unresolved = [];
  for (const [tier, names] of Object.entries(parsed)) {
    for (const name of names) {
      const slug = candidateSlugs(name).find((c) => valid.has(c));
      if (!slug) { unresolved.push({ tier, name }); continue; }
      entries[slug] = tier;
    }
  }

  const payload = {
    meta: {
      provenance: 'vérifié — extrait de Game8, identifiants confrontés à PokéAPI',
      source: SOURCE_URL,
      title: 'Game8 — Best Pokemon Tier List (Pokémon Écarlate / Violet), Combat Classé',
      pageUpdated: updated.trim(),
      fetchedAt: new Date().toISOString().slice(0, 10),
      regenerate: 'npm run build:game8',
      count: Object.keys(entries).length,
      unresolved,
      caveat:
        'Game8 classe pour le Combat Classé officiel, où les légendaires ' +
        'restreints sont autorisés. Smogon classe pour son propre ladder ' +
        'singles, où ils sont bannis. Les deux listes ne mesurent pas la même ' +
        'chose : elles ne doivent jamais être fusionnées, seulement comparées.'
    },
    entries
  };

  await writeFile(join(DATA, 'tiers-game8.json'), JSON.stringify(payload, null, 2) + '\n', 'utf8');
  console.log(`✔ data/tiers-game8.json  ${Object.keys(entries).length} entrées` +
    (unresolved.length ? `, ${unresolved.length} libellés non résolus` : ''));
  if (unresolved.length) {
    unresolved.forEach((u) => console.log(`    ? ${u.tier} — ${u.name}`));
  }
}

main().catch((err) => { console.error(`✖ ${err.message}`); process.exitCode = 1; });
