/*
 * scripts/verify-data.mjs — Audit des données embarquées contre PokéAPI.
 * ======================================================================
 *
 * CE QUE CE SCRIPT VÉRIFIE, ET POURQUOI
 * -------------------------------------
 * Les fichiers data/*.js ne sont plus saisis à la main : ils sont générés par
 * scripts/build-data.mjs depuis deux paquets npm épinglés (@pkmn/dex et
 * pokemon). Leur contenu est donc fiable par construction.
 *
 * Il reste malgré tout un point de jonction fragile : la conversion d'un nom
 * anglais vers un IDENTIFIANT PokéAPI. Elle est mécanique
 * (« Great Tusk » → « great-tusk ») et couvre l'immense majorité des cas, mais
 * PokéAPI nomme certaines formes alternatives autrement que Pokémon Showdown
 * (« Calyrex-Ice » contre « calyrex-ice-rider »). Une table d'alias corrige les
 * divergences connues — ce script est là pour trouver celles qui restent.
 *
 * Il signale donc :
 *   1. tout identifiant de data/tiers.js qui n'existe pas dans PokéAPI ;
 *   2. tout nom français de data/names-fr.js dont l'identifiant est introuvable,
 *      ou dont PokéAPI donne un nom français différent.
 *
 * CONSÉQUENCE D'UN ÉCART
 * ----------------------
 * Aucune, sur la sûreté : un identifiant qui ne correspond à rien n'est jamais
 * consulté, et le Pokémon concerné retombe sur « tier inconnu » — ce qui
 * interdit toute recommandation de remplacement. Un écart dégrade la couverture
 * de l'outil, jamais sa fiabilité.
 *
 * CE QU'IL NE PEUT PAS VÉRIFIER
 * -----------------------------
 * Le TIER lui-même. PokéAPI n'expose aucune notion de viabilité : c'est une
 * donnée communautaire. Sa source est @pkmn/dex, dont la version exacte est
 * inscrite dans data/tiers.js (champ meta.source).
 *
 * USAGE
 * -----
 *   node scripts/verify-data.mjs            # tout
 *   node scripts/verify-data.mjs --names    # noms français uniquement
 *   node scripts/verify-data.mjs --tiers    # identifiants de tiers uniquement
 *   node scripts/verify-data.mjs --json     # sortie machine
 *
 * Code de sortie 1 si au moins un écart est détecté, 2 si PokéAPI est
 * injoignable.
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
    .replace(/\u2640/g, 'f')
    .replace(/\u2642/g, 'm')
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
      '\nRappel : ce script ne peut PAS vérifier les TIERS eux-mêmes — PokéAPI\n' +
      'n\'expose pas cette notion. Leur source est @pkmn/dex, dont la version\n' +
      'exacte figure dans data/tiers.js (meta.source).\n\n' +
      'Un écart signalé ci-dessus dégrade la couverture de l\'outil, jamais sa\n' +
      'fiabilité : un identifiant inconnu retombe sur « tier inconnu », ce qui\n' +
      'interdit toute recommandation.\n'
    );
  }

  const total = Object.values(out).reduce((n, r) => n + r.problems.length, 0);
  if (total) process.exitCode = 1;
}

main().catch((err) => { console.error(err); process.exitCode = 2; });
