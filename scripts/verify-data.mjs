#!/usr/bin/env node
/*
 * scripts/verify-data.mjs — Audit des données embarquées contre PokéAPI.
 * ======================================================================
 *
 * POURQUOI CE SCRIPT EXISTE
 * -------------------------
 * Deux fichiers de ce dépôt ne sont pas récupérés à l'exécution :
 *   data/tiers.js      (viabilité compétitive)
 *   data/names-fr.js   (index de secours des noms français)
 *
 * Ils ont été saisis à la main. Plutôt que de demander de leur faire
 * confiance, ce script les confronte à PokéAPI et signale chaque écart.
 *
 * CE QU'IL VÉRIFIE
 * ----------------
 *   1. Chaque identifiant de data/tiers.js existe bien dans PokéAPI.
 *      → détecte les identifiants inventés, mal orthographiés ou obsolètes.
 *   2. Chaque nom français de data/names-fr.js correspond bien, dans PokéAPI,
 *      au nom français officiel de l'espèce visée.
 *      → détecte les traductions erronées.
 *
 * CE QU'IL NE PEUT PAS VÉRIFIER
 * -----------------------------
 *   Le TIER lui-même. PokéAPI n'expose aucune notion de viabilité : c'est une
 *   donnée communautaire. Pour la vérifier, il faut la régénérer depuis une
 *   source structurée :  npm run build:tiers
 *
 * USAGE
 * -----
 *   node scripts/verify-data.mjs            # tout
 *   node scripts/verify-data.mjs --names    # noms français uniquement
 *   node scripts/verify-data.mjs --tiers    # identifiants de tiers uniquement
 *   node scripts/verify-data.mjs --json     # sortie machine
 *
 * Code de sortie 1 si au moins un écart est détecté.
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data');
const BASE = 'https://pokeapi.co/api/v2';

const CONCURRENCY = 6;

/** Normalise pour comparer deux noms sans se soucier des accents/ponctuation. */
function normalize(value) {
  return String(value == null ? '' : value)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

const cache = new Map();

async function getJson(url) {
  if (cache.has(url)) return cache.get(url);
  const res = await fetch(url);
  if (res.status === 404) { cache.set(url, null); return null; }
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  const data = await res.json();
  cache.set(url, data);
  return data;
}

/** Exécute `task` sur chaque élément, avec un parallélisme borné. */
async function mapLimit(items, limit, task) {
  const queue = [...items];
  const out = [];
  async function worker() {
    while (queue.length) {
      const item = queue.shift();
      out.push(await task(item));
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return out;
}

/* ------------------------------------------------------------------ */
/* 1. Identifiants de tiers                                            */
/* ------------------------------------------------------------------ */

async function verifyTiers() {
  await import(join(DATA, 'tiers.js'));
  const entries = globalThis.POKESTATS_TIERS.entries;
  const slugs = Object.keys(entries);

  process.stderr.write(`Vérification de ${slugs.length} identifiants de tiers…\n`);

  const problems = [];
  await mapLimit(slugs, CONCURRENCY, async (slug) => {
    /* Un identifiant peut désigner une forme (/pokemon) ou une espèce
     * (/pokemon-species). Les deux sont acceptables. */
    const asForm = await getJson(`${BASE}/pokemon/${slug}`);
    if (asForm) return;
    const asSpecies = await getJson(`${BASE}/pokemon-species/${slug}`);
    if (asSpecies) return;
    problems.push({
      kind: 'identifiant-inconnu',
      slug,
      tier: entries[slug][0],
      message: `« ${slug} » n'existe ni comme forme ni comme espèce dans PokéAPI.`
    });
  });

  return { checked: slugs.length, problems };
}

/* ------------------------------------------------------------------ */
/* 2. Noms français                                                    */
/* ------------------------------------------------------------------ */

async function verifyNames() {
  await import(join(DATA, 'names-fr.js'));
  const seed = globalThis.POKESTATS_NAMES_FR.seed;
  const labels = Object.keys(seed);

  process.stderr.write(`Vérification de ${labels.length} noms français…\n`);

  const problems = [];
  await mapLimit(labels, CONCURRENCY, async (label) => {
    const slug = seed[label];

    /* On remonte à l'espèce : c'est elle qui porte les noms localisés. */
    let species = await getJson(`${BASE}/pokemon-species/${slug}`);
    if (!species) {
      const form = await getJson(`${BASE}/pokemon/${slug}`);
      if (form && form.species) {
        species = await getJson(`${BASE}/pokemon-species/${form.species.name}`);
      }
    }

    if (!species) {
      problems.push({
        kind: 'identifiant-inconnu',
        label, slug,
        message: `« ${label} » pointe vers « ${slug} », introuvable dans PokéAPI.`
      });
      return;
    }

    const official = (species.names || []).find((n) => n.language?.name === 'fr');
    if (!official) {
      problems.push({
        kind: 'nom-fr-absent',
        label, slug,
        message: `PokéAPI n'expose aucun nom français pour « ${slug} ».`
      });
      return;
    }

    if (normalize(official.name) !== normalize(label)) {
      problems.push({
        kind: 'nom-fr-errone',
        label, slug,
        expected: official.name,
        message: `« ${label} » → « ${slug} » : PokéAPI l'appelle « ${official.name} ».`
      });
    }
  });

  return { checked: labels.length, problems };
}

/* ------------------------------------------------------------------ */

function report(title, result) {
  console.log(`\n${title}`);
  console.log('-'.repeat(title.length));
  console.log(`  Vérifiés : ${result.checked}`);
  console.log(`  Écarts   : ${result.problems.length}`);
  for (const p of result.problems) console.log(`    ✖ ${p.message}`);
  if (!result.problems.length) console.log('    ✓ aucun écart détecté');
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const wantNames = args.has('--names') || (!args.has('--tiers'));
  const wantTiers = args.has('--tiers') || (!args.has('--names'));
  const asJson = args.has('--json');

  const out = {};
  try {
    if (wantTiers) out.tiers = await verifyTiers();
    if (wantNames) out.names = await verifyNames();
  } catch (err) {
    console.error(`\n✖ Vérification impossible : ${err.message}`);
    console.error('  PokéAPI doit être joignable pour auditer ces fichiers.\n');
    process.exitCode = 2;
    return;
  }

  if (asJson) {
    console.log(JSON.stringify(out, null, 2));
  } else {
    if (out.tiers) report('Identifiants de data/tiers.js', out.tiers);
    if (out.names) report('Noms français de data/names-fr.js', out.names);
    console.log(
      '\nRappel : ce script ne peut PAS vérifier les TIERS eux-mêmes ' +
      '(PokéAPI n\'expose pas cette notion).\n' +
      'Pour cela : npm run build:tiers\n'
    );
  }

  const total = Object.values(out).reduce((n, r) => n + r.problems.length, 0);
  if (total) process.exitCode = 1;
}

main().catch((err) => { console.error(err); process.exitCode = 2; });
