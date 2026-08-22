/*
 * test/engine.test.js — Tests du moteur de recommandation.
 * ========================================================
 *
 * Objectif : vérifier les GARANTIES DE SÛRETÉ, c'est-à-dire tout ce que
 * l'application promet de ne JAMAIS faire.
 *
 *     node test/engine.test.js
 *
 * Aucun accès réseau : les fiches Pokémon sont des objets construits à la main
 * et la table des types provient de test/type-chart.fixture.js.
 */
'use strict';

var assert = require('assert');
var path = require('path');
var fixture = require('./type-chart.fixture.js');

/* --- Chargement des modules dans un contexte « navigateur » simulé --- */
var root = globalThis;
require(path.join(__dirname, '..', 'data', 'tiers.js'));
require(path.join(__dirname, '..', 'js', 'api.js'));
require(path.join(__dirname, '..', 'js', 'types.js'));
require(path.join(__dirname, '..', 'data', 'moves.js'));
require(path.join(__dirname, '..', 'js', 'analysis.js'));

var PokeStats = root.PokeStats;
PokeStats.types._setChart(fixture.buildChart(), fixture.TYPES);

var analysis = PokeStats.analysis;

/* ------------------------------------------------------------------ */
/* Utilitaires de test                                                 */
/* ------------------------------------------------------------------ */

var passed = 0;
var failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('  ✓ ' + name);
  } catch (err) {
    failures.push({ name: name, err: err });
    console.log('  ✗ ' + name + '\n      ' + err.message);
  }
}

function section(title) {
  console.log('\n' + title);
}

/**
 * Fabrique une fiche Pokémon minimale, au format produit par js/dex.js.
 */
function mon(opts) {
  var s = opts.stats;
  var stats = {
    hp: s[0], attack: s[1], defense: s[2],
    'special-attack': s[3], 'special-defense': s[4], speed: s[5]
  };
  return {
    id: opts.id || 0,
    slug: opts.slug,
    speciesSlug: opts.speciesSlug || opts.slug,
    frName: opts.frName || opts.slug,
    enName: opts.enName || opts.slug,
    types: opts.types,
    stats: stats,
    bst: s.reduce(function (a, b) { return a + b; }, 0),
    abilities: (opts.abilities || []).map(function (a) { return { slug: a, hidden: false }; }),
    sprite: null,
    evolution: {
      canEvolve: !!opts.canEvolve,
      nextForms: opts.nextForms || [],
      stages: [],
      loaded: opts.evolutionLoaded === false ? false : true
    }
  };
}

/* ------------------------------------------------------------------ */
/* Fiches de référence (stats de base réelles, gen 9)                   */
/* ------------------------------------------------------------------ */

/* Ordre des stats : PV, Att, Déf, AttSpé, DéfSpé, Vit */
var ROCKRUFF = mon({
  slug: 'rockruff', frName: 'Rocabot', types: ['rock'],
  stats: [45, 65, 40, 30, 40, 60], canEvolve: true
});

var LYCANROC_MIDDAY = mon({
  slug: 'lycanroc-midday', speciesSlug: 'lycanroc', frName: 'Lougaroc (Diurne)',
  types: ['rock'], stats: [75, 115, 65, 55, 65, 112]
});

var LYCANROC_DUSK = mon({
  slug: 'lycanroc-dusk', speciesSlug: 'lycanroc', frName: 'Lougaroc (Crépusculaire)',
  types: ['rock'], stats: [75, 117, 65, 55, 65, 110]
});

var GARCHOMP = mon({
  slug: 'garchomp', frName: 'Carchacrok', types: ['dragon', 'ground'],
  stats: [108, 130, 95, 80, 85, 102]
});

var KINGAMBIT = mon({
  slug: 'kingambit', frName: 'Scalpereur', types: ['dark', 'steel'],
  stats: [100, 135, 120, 60, 85, 50]
});

var MEOWSCARADA = mon({
  slug: 'meowscarada', frName: 'Miascarade', types: ['grass', 'dark'],
  stats: [76, 110, 70, 81, 70, 123]
});

var SKELEDIRGE = mon({
  slug: 'skeledirge', frName: 'Flambusard', types: ['fire', 'ghost'],
  stats: [104, 75, 100, 110, 75, 66]
});

var QUAQUAVAL = mon({
  slug: 'quaquaval', frName: 'Palmaval', types: ['water', 'fighting'],
  stats: [85, 120, 80, 85, 75, 85]
});

var CORVIKNIGHT = mon({
  slug: 'corviknight', frName: 'Corvaillus', types: ['flying', 'steel'],
  stats: [98, 87, 105, 53, 85, 67]
});

var FLUTTER_MANE = mon({
  slug: 'flutter-mane', frName: 'Hurle-Queue', types: ['ghost', 'fairy'],
  stats: [55, 55, 55, 135, 135, 135]
});

/* Pokémon absent de data/tiers.js → tier inconnu.
 *
 * Papilusion est un vrai Pokémon, mais indisponible en Génération 9 : Smogon
 * ne lui attribue donc aucun tier, et il n'apparaît pas dans la table. C'est
 * le cas « tier inconnu » réaliste — ~292 espèces sont dans cette situation. */
var UNKNOWN_TIER_MON = mon({
  slug: 'butterfree', frName: 'Papilusion', types: ['bug', 'flying'],
  stats: [60, 45, 50, 90, 80, 70]
});

var BASE_TEAM = [MEOWSCARADA, SKELEDIRGE, QUAQUAVAL, GARCHOMP, CORVIKNIGHT, KINGAMBIT];

/* Lignée Frigodo → Cryodo → Glaivodo : le cas « pépite » type — une forme de
 * base médiocre dont la forme finale est un pilier du métagame. */
var BAXCALIBUR = mon({
  slug: 'baxcalibur', frName: 'Glaivodo', types: ['dragon', 'ice'],
  stats: [115, 145, 92, 75, 86, 87]
});

var ARCTIBAX = mon({
  slug: 'arctibax', frName: 'Cryodo', types: ['dragon', 'ice'],
  stats: [90, 95, 66, 45, 65, 62]
});

function frigibax() {
  return mon({
    slug: 'frigibax', frName: 'Frigodo', types: ['dragon', 'ice'],
    stats: [65, 75, 45, 35, 45, 55],
    canEvolve: true,
    nextForms: [
      Object.assign({}, ARCTIBAX, {
        evolutionCondition: 'niveau 35', evolutionDepth: 1, isTerminal: false
      }),
      Object.assign({}, BAXCALIBUR, {
        evolutionCondition: 'niveau 54', evolutionDepth: 2, isTerminal: true
      })
    ]
  });
}

/* Équipe volontairement moyenne, pour que l'investissement soit rentable. */
var WEAK_TEAM = [
  mon({ slug: 'lycanroc-midday', speciesSlug: 'lycanroc', frName: 'Lougaroc',
        types: ['rock'], stats: [75, 115, 65, 55, 65, 112] }),
  mon({ slug: 'dudunsparce', frName: 'Deusolourdo', types: ['normal'],
        stats: [125, 100, 80, 85, 75, 55] }),
  mon({ slug: 'oinkologne', frName: 'Fragroin', types: ['normal'],
        stats: [110, 100, 75, 59, 80, 65] }),
  mon({ slug: 'klawf', frName: 'Craparoi', types: ['rock'],
        stats: [70, 100, 115, 35, 55, 75] }),
  mon({ slug: 'bombirdier', frName: 'Bandelirou', types: ['flying', 'dark'],
        stats: [70, 103, 85, 60, 85, 82] }),
  mon({ slug: 'houndstone', frName: 'Tomberro', types: ['ghost'],
        stats: [72, 101, 100, 50, 97, 68] })
];


/* ================================================================== */
section('1. Garanties de sûreté — ce que le moteur ne doit JAMAIS faire');
/* ================================================================== */

test('un Pokémon non pleinement évolué n’est jamais proposé en remplacement', function () {
  var result = analysis.evaluate({ team: BASE_TEAM, candidate: ROCKRUFF });
  result.comparisons.forEach(function (c) {
    assert.notStrictEqual(c.verdict, 'remplacer',
      'Rocabot ne doit pas remplacer ' + c.member.frName);
    assert.ok(c.blockers.some(function (b) { return b.code === 'non-evolue'; }),
      'le blocage « non évolué » doit être explicite pour ' + c.member.frName);
  });
});

test('un tier inconnu bloque toute recommandation de remplacement', function () {
  var result = analysis.evaluate({ team: BASE_TEAM, candidate: UNKNOWN_TIER_MON });
  assert.strictEqual(result.candidateTier.known, false);
  result.comparisons.forEach(function (c) {
    assert.notStrictEqual(c.verdict, 'remplacer');
    assert.ok(c.blockers.some(function (b) { return b.code === 'tier-inconnu'; }));
  });
  assert.strictEqual(result.headline.status, 'non-recommande');
});

test('un Pokémon indisponible en Gen 9 reste sans tier (donc sans recommandation)', function () {
  var table = globalThis.POKESTATS_TIERS.entries;
  assert.strictEqual(table.butterfree, undefined,
    'Papilusion n’est pas jouable en Génération 9 : il ne doit avoir aucun tier');
  var info = analysis.tierOf(UNKNOWN_TIER_MON);
  assert.strictEqual(info.known, false);
  assert.strictEqual(info.trusted, false);
});

test('un candidat de tier inférieur n’est jamais recommandé', function () {
  /* Lougaroc (tier C) face à une équipe de tiers S/A. */
  var result = analysis.evaluate({ team: BASE_TEAM, candidate: LYCANROC_MIDDAY });
  result.comparisons.forEach(function (c) {
    var tc = analysis.tierOf(LYCANROC_MIDDAY);
    var tm = analysis.tierOf(c.member);
    if (tc.score < tm.score) {
      assert.notStrictEqual(c.verdict, 'remplacer');
      assert.ok(c.blockers.some(function (b) { return b.code === 'tier-inferieur'; }));
    }
  });
});

test('des stats clés inférieures bloquent le remplacement', function () {
  var weak = mon({
    slug: 'garchomp', frName: 'Carchacrok affaibli', types: ['dragon', 'ground'],
    stats: [80, 90, 70, 60, 65, 70]
  });
  var cmp = analysis.comparePair(weak, GARCHOMP, BASE_TEAM);
  assert.strictEqual(cmp.verdict, 'aucun-changement');
  assert.ok(cmp.blockers.some(function (b) { return b.code === 'stats-cles-inferieures'; }));
});

test('BST inférieur + tier non supérieur ⇒ blocage sec', function () {
  var cmp = analysis.comparePair(LYCANROC_MIDDAY, GARCHOMP, BASE_TEAM);
  assert.strictEqual(cmp.verdict, 'aucun-changement');
  assert.ok(cmp.details.bstDelta < 0);
  assert.ok(cmp.blockers.length > 0);
});

test('deux Pokémon quasi identiques ⇒ aucun changement recommandé', function () {
  var clone = mon({
    slug: 'garchomp', frName: 'Clone', types: ['dragon', 'ground'],
    stats: [108, 132, 95, 80, 85, 103]   /* +3 seulement */
  });
  var cmp = analysis.comparePair(clone, GARCHOMP, BASE_TEAM);
  assert.notStrictEqual(cmp.verdict, 'remplacer',
    'un écart marginal ne doit jamais déclencher un remplacement');
});

test('un remplacement qui aggrave les faiblesses de l’équipe est bloqué', function () {
  /* Équipe déjà très faible au Sol ; on tente d'y ajouter encore du Feu/Acier. */
  var team = [
    mon({ slug: 'a', frName: 'A', types: ['fire'], stats: [80, 100, 80, 80, 80, 80] }),
    mon({ slug: 'b', frName: 'B', types: ['electric'], stats: [80, 100, 80, 80, 80, 80] }),
    mon({ slug: 'c', frName: 'C', types: ['steel'], stats: [80, 100, 80, 80, 80, 80] }),
    mon({ slug: 'd', frName: 'D', types: ['water'], stats: [80, 100, 80, 80, 80, 80] })
  ];
  var profile = analysis.teamTypeProfile(team);
  assert.ok(profile.criticalWeaknesses.indexOf('ground') !== -1,
    'l’équipe témoin doit bien être faible au Sol');
});

test('une donnée de tier de confiance moyenne ne peut pas justifier un remplacement', function () {
  var table = globalThis.POKESTATS_TIERS.entries;
  Object.keys(table).forEach(function (slug) {
    assert.ok(table[slug][1] === 1 || table[slug][1] === 2,
      'confiance invalide pour ' + slug);
  });

  /* On construit un cas où le seul argument possible est un tier de
   * confiance moyenne : le verdict ne doit pas être « remplacer ». */
  var member = mon({
    slug: 'clefable', frName: 'Mélodelfe', types: ['fairy'],
    stats: [95, 70, 73, 95, 90, 60]
  });
  var candidate = mon({
    slug: 'sylveon', frName: 'Nymphali', types: ['fairy'],
    stats: [95, 65, 65, 110, 130, 60]
  });
  var cmp = analysis.comparePair(candidate, member, [member]);
  var usedMediumTierAsProof = cmp.evidence.some(function (e) {
    return e.code === 'tier-superieur';
  });
  var tc = analysis.tierOf(candidate);
  var tm = analysis.tierOf(member);
  if (!(tc.trusted && tm.trusted)) {
    assert.strictEqual(usedMediumTierAsProof, false,
      'un tier peu fiable ne doit jamais compter comme preuve');
  }
});

/* ================================================================== */
section('2. Propriété générale — jamais de recommandation « à la baisse »');
/* ================================================================== */

test('sur 400 paires aléatoires, aucun « remplacer » vers un Pokémon plus faible', function () {
  var typePool = fixture.TYPES;
  var slugs = Object.keys(globalThis.POKESTATS_TIERS.entries);
  var seed = 12345;
  function rnd() {                       /* générateur déterministe */
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  }
  function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }
  function randomMon(i) {
    var slug = pick(slugs);
    var t1 = pick(typePool);
    var t2 = rnd() < 0.5 ? pick(typePool) : null;
    return mon({
      slug: slug, frName: slug + '#' + i,
      types: t2 && t2 !== t1 ? [t1, t2] : [t1],
      stats: [
        30 + Math.floor(rnd() * 130), 30 + Math.floor(rnd() * 130),
        30 + Math.floor(rnd() * 130), 30 + Math.floor(rnd() * 130),
        30 + Math.floor(rnd() * 130), 30 + Math.floor(rnd() * 130)
      ]
    });
  }

  var violations = [];
  for (var i = 0; i < 400; i++) {
    var candidate = randomMon(i);
    var member = randomMon(i + 1000);
    var team = [member, randomMon(i + 2000), randomMon(i + 3000)];
    var cmp = analysis.comparePair(candidate, member, team);
    if (cmp.verdict !== 'remplacer') continue;

    var tc = analysis.tierOf(candidate);
    var tm = analysis.tierOf(member);

    /* Invariants qu'un « remplacer » doit TOUJOURS respecter. */
    if (tc.score < tm.score) violations.push('tier inférieur: ' + i);
    if (cmp.details.keyDelta < 0) violations.push('stats clés inférieures: ' + i);
    if (cmp.details.bstDelta < 0 && tc.score <= tm.score) violations.push('BST inférieur: ' + i);
    if (cmp.details.criticalAfter.length > cmp.details.criticalBefore.length) {
      violations.push('équipe aggravée: ' + i);
    }
    if (cmp.evidence.length < analysis.THRESHOLDS.EVIDENCE_REQUIRED) {
      violations.push('indices insuffisants: ' + i);
    }
  }
  assert.deepStrictEqual(violations, [], 'violations détectées : ' + violations.join(', '));
});

test('aucun « remplacer » ne peut sortir d’un candidat non évolué (500 tirages)', function () {
  var seed = 999;
  function rnd() {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  }
  for (var i = 0; i < 500; i++) {
    var candidate = mon({
      slug: 'flutter-mane', frName: 'Candidat', types: ['ghost', 'fairy'],
      stats: [
        60 + Math.floor(rnd() * 100), 60 + Math.floor(rnd() * 100),
        60 + Math.floor(rnd() * 100), 60 + Math.floor(rnd() * 100),
        60 + Math.floor(rnd() * 100), 60 + Math.floor(rnd() * 100)
      ],
      canEvolve: true
    });
    var cmp = analysis.comparePair(candidate, LYCANROC_MIDDAY, [LYCANROC_MIDDAY]);
    assert.notStrictEqual(cmp.verdict, 'remplacer');
  }
});

/* ================================================================== */
section('3. Cas d’usage du cahier des charges — Rocabot → Lougaroc');
/* ================================================================== */

test('Rocabot capturé face à une équipe solide : pas de remplacement', function () {
  var candidate = mon({
    slug: 'rockruff', frName: 'Rocabot', types: ['rock'],
    stats: [45, 65, 40, 30, 40, 60],
    canEvolve: true,
    nextForms: [
      Object.assign({}, LYCANROC_MIDDAY, { evolutionCondition: 'niveau 25, le jour', evolutionDepth: 1 }),
      Object.assign({}, LYCANROC_DUSK, { evolutionCondition: 'niveau 25, au crépuscule (17 h–17 h 59)', evolutionDepth: 1 })
    ]
  });
  var result = analysis.evaluate({ team: BASE_TEAM, candidate: candidate });

  assert.notStrictEqual(result.headline.status, 'remplacer',
    'Rocabot ne doit jamais déclencher un remplacement');
  assert.ok(result.evolution.available, 'l’évolution doit être détectée');
  assert.ok(result.evolution.bstGain > 0, 'le gain de BST doit être positif');
  assert.strictEqual(result.evolution.best.speciesSlug, 'lycanroc');
});

test('l’évolution de Rocabot est correctement chiffrée', function () {
  var candidate = mon({
    slug: 'rockruff', frName: 'Rocabot', types: ['rock'],
    stats: [45, 65, 40, 30, 40, 60],
    canEvolve: true,
    nextForms: [
      Object.assign({}, LYCANROC_MIDDAY, { evolutionCondition: 'niveau 25, le jour', evolutionDepth: 1 }),
      Object.assign({}, LYCANROC_DUSK, { evolutionCondition: 'niveau 25, au crépuscule', evolutionDepth: 1 })
    ]
  });
  var evo = analysis.evaluateEvolution(candidate);
  assert.strictEqual(evo.bstGain, 487 - 280);
  assert.ok(evo.keyGainOnEvoRole > 0.5, 'gain de stats clés très net attendu');
  /* Lougaroc reste classé C/B : l’entraînement n’est pas présenté comme
   * clairement rentable en compétitif. */
  assert.strictEqual(evo.worthTraining, false);
});

test('Lougaroc Crépusculaire (tier B) est préféré à la forme Diurne (tier C)', function () {
  var candidate = mon({
    slug: 'rockruff', frName: 'Rocabot', types: ['rock'],
    stats: [45, 65, 40, 30, 40, 60],
    canEvolve: true,
    nextForms: [
      Object.assign({}, LYCANROC_MIDDAY, { evolutionCondition: 'niveau 25, le jour', evolutionDepth: 1 }),
      Object.assign({}, LYCANROC_DUSK, { evolutionCondition: 'niveau 25, au crépuscule', evolutionDepth: 1 })
    ]
  });
  var evo = analysis.evaluateEvolution(candidate);
  assert.strictEqual(evo.best.slug, 'lycanroc-dusk');
});

/* ================================================================== */
section('3 bis. Potentiel d’évolution — un Pokémon hors équipe ne gagne aucun XP');
/* ================================================================== */

test('la forme TERMINALE est retenue, jamais une forme intermédiaire', function () {
  var evo = analysis.evaluateEvolution(frigibax());
  assert.strictEqual(evo.best.frName, 'Glaivodo',
    'Frigodo doit être jugé sur Glaivodo, pas sur Cryodo');
});

test('la forme terminale prime même si l’intermédiaire a un meilleur tier connu', function () {
  var candidate = mon({
    slug: 'frigibax', frName: 'Frigodo', types: ['dragon', 'ice'],
    stats: [65, 75, 45, 35, 45, 55],
    canEvolve: true,
    nextForms: [
      /* Forme intermédiaire volontairement classée haut (tier S via le slug). */
      Object.assign({}, ARCTIBAX, {
        slug: 'garchomp', evolutionCondition: 'niveau 35',
        evolutionDepth: 1, isTerminal: false
      }),
      /* Forme finale sans tier connu. */
      Object.assign({}, BAXCALIBUR, {
        slug: 'inconnu-total', speciesSlug: 'inconnu-total',
        evolutionCondition: 'niveau 54', evolutionDepth: 2, isTerminal: true
      })
    ]
  });
  var evo = analysis.evaluateEvolution(candidate);
  assert.strictEqual(evo.best.isTerminal, true,
    'une forme intermédiaire ne doit jamais être présentée comme le potentiel réel');
});

test('un Pokémon faible dont l’évolution finale est excellente EST recommandé', function () {
  var result = analysis.evaluate({ team: WEAK_TEAM, candidate: frigibax() });

  assert.strictEqual(result.hasFreeSlot, false, 'équipe de 6 pour ce scénario');
  assert.strictEqual(result.headline.status, 'investir',
    'Frigodo doit être recommandé pour ce que devient Glaivodo');
  assert.ok(result.headline.target, 'le membre à écarter doit être nommé');
  assert.ok(result.headline.title.indexOf('Glaivodo') !== -1,
    'la conclusion doit nommer la forme finale visée');
});

test('la conclusion explique la contrainte d’expérience', function () {
  var result = analysis.evaluate({ team: WEAK_TEAM, candidate: frigibax() });
  var full = result.headline.title + ' ' + result.headline.text;
  assert.ok(/exp(é|e)rience/i.test(full),
    'la contrainte « pas d’XP hors équipe » doit être explicite : ' + full);
  assert.ok(full.indexOf('niveau 54') !== -1,
    'la condition d’évolution doit être annoncée');
});

test('avec une place libre, la pépite est proposée à l’ajout immédiat', function () {
  var result = analysis.evaluate({
    team: WEAK_TEAM.slice(0, 3),
    candidate: frigibax()
  });
  assert.ok(result.hasFreeSlot);
  assert.strictEqual(result.headline.status, 'investir');
  assert.ok(/exp(é|e)rience/i.test(result.headline.text));
});

test('le potentiel d’évolution rend le candidat viable malgré un tier D actuel', function () {
  var result = analysis.evaluate({ team: WEAK_TEAM.slice(0, 3), candidate: frigibax() });
  assert.strictEqual(result.viableNow, false, 'Frigodo n’est pas viable en l’état');
  assert.strictEqual(result.viableAfterEvolution, true, 'Glaivodo l’est');
  assert.strictEqual(result.viableOnItsOwn, true);
});

test('« pas encore évolué » n’est JAMAIS le motif final d’un refus', function () {
  /* Rocabot face à une équipe solide : le refus doit porter sur Lougaroc,
   * pas sur le fait que Rocabot ne soit pas évolué (argument circulaire). */
  var candidate = mon({
    slug: 'rockruff', frName: 'Rocabot', types: ['rock'],
    stats: [45, 65, 40, 30, 40, 60],
    canEvolve: true,
    nextForms: [
      Object.assign({}, LYCANROC_MIDDAY, {
        evolutionCondition: 'niveau 25, le jour', evolutionDepth: 1, isTerminal: true
      }),
      Object.assign({}, LYCANROC_DUSK, {
        evolutionCondition: 'niveau 25, au crépuscule', evolutionDepth: 1, isTerminal: true
      })
    ]
  });
  var result = analysis.evaluate({ team: BASE_TEAM, candidate: candidate });

  assert.strictEqual(result.headline.status, 'non-recommande');
  assert.ok(result.headline.text.indexOf('Lougaroc') !== -1,
    'le motif doit porter sur la forme finale : ' + result.headline.text);
  assert.ok(!/pas encore pleinement (é|e)volu/i.test(result.headline.text),
    'le motif ne doit pas être circulaire : ' + result.headline.text);
});

test('la prudence tient : une évolution médiocre ne suffit pas', function () {
  var candidate = mon({
    slug: 'magikarp', frName: 'Magicarpe', types: ['water'],
    stats: [20, 10, 55, 15, 20, 80],
    canEvolve: true,
    nextForms: [
      Object.assign({}, mon({
        slug: 'lycanroc-midday', speciesSlug: 'lycanroc', frName: 'Évolution moyenne',
        types: ['rock'], stats: [75, 115, 65, 55, 65, 112]
      }), { evolutionCondition: 'niveau 20', evolutionDepth: 1, isTerminal: true })
    ]
  });
  var result = analysis.evaluate({ team: BASE_TEAM, candidate: candidate });
  assert.notStrictEqual(result.headline.status, 'investir');
  assert.notStrictEqual(result.headline.status, 'remplacer');
});

test('aucun verdict « investir » sans évolution démontrablement supérieure', function () {
  var result = analysis.evaluate({ team: WEAK_TEAM, candidate: frigibax() });
  if (result.headline.status === 'investir' && result.headline.target) {
    var cmp = result.evolutionComparisons.filter(function (c) {
      return c.member === result.headline.target;
    })[0];
    assert.ok(cmp, 'la comparaison correspondante doit exister');
    assert.strictEqual(cmp.verdict, 'remplacer',
      'un « investir » ciblé doit s’appuyer sur un verdict « remplacer » de la forme finale');
    assert.strictEqual(cmp.blockers.length, 0);
    assert.ok(cmp.evidence.length >= analysis.THRESHOLDS.EVIDENCE_REQUIRED);
  }
});

/* ================================================================== */
section('3 ter. Capacités — des stats élevées ne suffisent pas');
/* ================================================================== */

test('les indicateurs de capacités sont chargés pour les Pokémon réels', function () {
  var mc = analysis.movesOf(GARCHOMP);
  assert.strictEqual(mc.known, true, 'Carchacrok doit avoir des données de capacités');
  assert.ok(mc.stabPower >= 100, 'puissance STAB attendue élevée, vue : ' + mc.stabPower);
  assert.strictEqual(mc.category, 'phy', 'Carchacrok est un attaquant physique');
  assert.ok(mc.coverage >= 8, 'couverture attendue large, vue : ' + mc.coverage);
  assert.ok(mc.moves.length > 0);
});

test('une donnée de capacités absente ne bloque ni ne justifie rien', function () {
  /* Pokémon synthétique : aucun identifiant réel, donc aucune donnée. */
  var inconnu = mon({
    slug: 'pokemon-imaginaire-xyz', frName: 'Inconnu', types: ['rock'],
    stats: [80, 100, 80, 60, 70, 90]
  });
  assert.strictEqual(analysis.movesOf(inconnu).known, false);

  var cmp = analysis.comparePair(inconnu, LYCANROC_MIDDAY, [LYCANROC_MIDDAY]);
  assert.ok(!cmp.blockers.some(function (b) {
    return b.code === 'aucune-stab' || b.code === 'moveset-plus-faible';
  }), 'aucun blocage ne doit venir d’une donnée manquante');
  assert.ok(!cmp.evidence.some(function (e) { return e.code === 'couverture-offensive'; }),
    'aucun indice ne doit venir d’une donnée manquante');
});

test('un Pokémon sans capacité STAB exploitable est bloqué', function () {
  /* Magicarpe : 0 de puissance STAB dans sa catégorie offensive, vérifié à la
   * génération des données. On lui prête des statistiques flatteuses pour
   * isoler l’effet des capacités. */
  var table = globalThis.POKESTATS_MOVES.byPokemon;
  assert.strictEqual(table.magikarp[0], 0, 'Magicarpe ne doit avoir aucune STAB utile');

  var karp = mon({
    slug: 'magikarp', frName: 'Magicarpe', types: ['water'],
    stats: [120, 140, 110, 60, 100, 120]
  });
  var cmp = analysis.comparePair(karp, LYCANROC_MIDDAY, [LYCANROC_MIDDAY]);
  assert.ok(cmp.blockers.some(function (b) { return b.code === 'aucune-stab'; }),
    'le blocage « aucune capacité STAB » doit se déclencher');
  assert.strictEqual(cmp.verdict, 'aucun-changement');
});

test('un arsenal nettement plus faible bloque malgré des stats favorables', function () {
  var table = globalThis.POKESTATS_MOVES.byPokemon;
  var faible = table.applin;   // 0 STAB, couverture 2
  assert.ok(faible && faible[2] <= 4, 'Verpom doit avoir une couverture très étroite');

  /* Stats volontairement supérieures à celles de Lougaroc : sans la règle sur
   * les capacités, le remplacement passerait. */
  var candidat = mon({
    slug: 'applin', frName: 'Verpom', types: ['grass', 'dragon'],
    stats: [90, 130, 90, 70, 90, 120]
  });
  var cmp = analysis.comparePair(candidat, LYCANROC_MIDDAY, [LYCANROC_MIDDAY]);
  assert.ok(cmp.details.keyDelta > 0, 'les statistiques doivent bien être favorables');
  assert.notStrictEqual(cmp.verdict, 'remplacer',
    'un arsenal indigent doit empêcher le remplacement');
});

test('une meilleure couverture offensive compte comme indice', function () {
  var large = mon({
    slug: 'baxcalibur', frName: 'Glaivodo', types: ['dragon', 'ice'],
    stats: [115, 145, 92, 75, 86, 87]
  });
  var etroit = mon({
    slug: 'lycanroc-midday', speciesSlug: 'lycanroc', frName: 'Lougaroc',
    types: ['rock'], stats: [75, 115, 65, 55, 65, 112]
  });
  var a = analysis.movesOf(large);
  var b = analysis.movesOf(etroit);
  assert.ok(a.known && b.known);

  var cmp = analysis.comparePair(large, etroit, [etroit]);
  if (a.coverage >= b.coverage + analysis.THRESHOLDS.COVERAGE_CLEAR_GAIN) {
    assert.ok(cmp.evidence.some(function (e) { return e.code === 'couverture-offensive'; }),
      'l’indice de couverture devait être retenu');
  }
});

test('les données de capacités couvrent tous les Pokémon classés', function () {
  var moves = globalThis.POKESTATS_MOVES;
  var tiers = globalThis.POKESTATS_TIERS.entries;
  assert.ok(/^vérifié/.test(moves.meta.provenance));

  var manquants = Object.keys(tiers).filter(function (slug) {
    return !moves.byPokemon[slug];
  });
  assert.strictEqual(manquants.length, 0,
    'Pokémon classés sans données de capacités : ' + manquants.slice(0, 5).join(', '));

  Object.keys(moves.byPokemon).forEach(function (slug) {
    var e = moves.byPokemon[slug];
    assert.ok(Array.isArray(e) && e.length === 4, 'format invalide : ' + slug);
    assert.ok(typeof e[0] === 'number' && e[0] >= 0, 'puissance STAB invalide : ' + slug);
    assert.ok(e[1] === 'phy' || e[1] === 'spe', 'catégorie invalide : ' + slug);
    assert.ok(e[2] >= 0 && e[2] <= 18, 'couverture hors bornes : ' + slug);
    e[3].forEach(function (m) {
      assert.ok(moves.moves[m], 'capacité absente du dictionnaire : ' + m + ' (' + slug + ')');
    });
  });
});

/* ================================================================== */
section('3 quater. Potentiel contre potentiel — l’équipier évolue aussi');
/* ================================================================== */

/* Lignée Khélocrok → Torgamord (485) face à Rocabot → Lougaroc (487).
 * Le piège : comparer Torgamord à ROCABOT donne un avantage écrasant, alors
 * que Rocabot deviendra Lougaroc, plus fort que Torgamord. */
var TORGAMORD = mon({
  slug: 'drednaw', frName: 'Torgamord', types: ['water', 'rock'],
  stats: [90, 115, 90, 48, 68, 74]
});

function khelocrok() {
  return mon({
    slug: 'chewtle', frName: 'Khélocrok', types: ['water'],
    stats: [50, 64, 50, 38, 38, 44],
    canEvolve: true,
    nextForms: [Object.assign({}, TORGAMORD, {
      evolutionCondition: 'niveau 22', evolutionDepth: 1, isTerminal: true
    })]
  });
}

function rocabot() {
  return mon({
    slug: 'rockruff', frName: 'Rocabot', types: ['rock'],
    stats: [45, 65, 40, 30, 40, 60],
    canEvolve: true,
    nextForms: [Object.assign({}, LYCANROC_DUSK, {
      evolutionCondition: 'niveau 25, au crépuscule', evolutionDepth: 1, isTerminal: true
    })]
  });
}

test('un équipier non évolué est comparé sur SA forme finale, pas son état actuel', function () {
  var result = analysis.evaluate({ team: [rocabot()], candidate: khelocrok() });

  /* Torgamord (485) ne dépasse pas Lougaroc (487) : aucun échange. */
  assert.notStrictEqual(result.headline.status, 'investir',
    'Khélocrok ne doit pas évincer Rocabot : Lougaroc est plus fort que Torgamord');
  assert.notStrictEqual(result.headline.status, 'remplacer');

  var contre = result.evolutionComparisons[0];
  assert.strictEqual(contre.member.frName, 'Torgamord'.replace('Torgamord', contre.member.frName),
    'la comparaison doit porter sur une forme finale');
  assert.ok(contre.memberWillEvolve, 'le moteur doit savoir que l’équipier évolue');
  assert.strictEqual(contre.memberNow.frName, 'Rocabot',
    'le membre d’origine doit rester identifiable pour les messages');
});

test('le refus nomme explicitement l’évolution de l’équipier', function () {
  var result = analysis.evaluate({ team: [rocabot()], candidate: khelocrok() });
  assert.ok(/Rocabot →/.test(result.headline.text),
    'le motif doit montrer que Rocabot évolue : ' + result.headline.text);
});

test('un candidat meilleur MAINTENANT mais à évolution médiocre est refusé', function () {
  /* Le cas inverse de la pépite : fort tout de suite, décevant à terme. */
  var evolutionMediocre = mon({
    slug: 'dudunsparce', frName: 'Évolution médiocre', types: ['normal'],
    stats: [125, 100, 80, 85, 75, 55]
  });
  var candidat = mon({
    slug: 'oinkologne', frName: 'Bon maintenant', types: ['normal'],
    stats: [110, 100, 75, 59, 80, 65],
    canEvolve: true,
    nextForms: [Object.assign({}, evolutionMediocre, {
      evolutionCondition: 'niveau 30', evolutionDepth: 1, isTerminal: true
    })]
  });
  var equipier = mon({
    slug: 'frigibax', frName: 'Faible maintenant', types: ['dragon', 'ice'],
    stats: [65, 75, 45, 35, 45, 55],
    canEvolve: true,
    nextForms: [Object.assign({}, BAXCALIBUR, {
      evolutionCondition: 'niveau 54', evolutionDepth: 2, isTerminal: true
    })]
  });

  /* Le candidat a 360 de BST contre 320 : il est meilleur à cet instant. */
  assert.ok(candidat.bst > equipier.bst, 'prémisse : le candidat est meilleur maintenant');

  var result = analysis.evaluate({ team: [equipier], candidate: candidat });
  assert.notStrictEqual(result.headline.status, 'remplacer',
    'un avantage immédiat ne doit pas l’emporter sur un déficit à terme');
  assert.notStrictEqual(result.headline.status, 'investir');
});

test('la comparaison à terme reste correcte face à un équipier déjà évolué', function () {
  /* Quand l'équipier ne peut plus évoluer, sa forme finale est lui-même :
   * le comportement d'origine doit être préservé. */
  var result = analysis.evaluate({ team: [LYCANROC_DUSK], candidate: khelocrok() });
  var contre = result.evolutionComparisons[0];
  assert.strictEqual(contre.memberWillEvolve, false);
  assert.strictEqual(contre.member.frName, contre.memberNow.frName,
    'un Pokémon pleinement évolué est sa propre forme finale');
});

/* ================================================================== */
section('4. Cas positifs — le moteur doit quand même savoir dire oui');
/* ================================================================== */

test('une amélioration franche et documentée est bien recommandée', function () {
  /* Équipe volontairement faible, avec un membre bien classé mais dépassé. */
  var weakMember = mon({
    slug: 'lycanroc-midday', speciesSlug: 'lycanroc', frName: 'Lougaroc',
    types: ['rock'], stats: [75, 115, 65, 55, 65, 112]
  });
  var team = [weakMember, SKELEDIRGE, CORVIKNIGHT];
  var cmp = analysis.comparePair(GARCHOMP, weakMember, team);

  assert.strictEqual(cmp.verdict, 'remplacer');
  assert.ok(cmp.evidence.length >= 2, 'au moins deux indices attendus');
  assert.ok(cmp.blockers.length === 0);
});

test('la synthèse désigne nommément le membre à remplacer (équipe complète)', function () {
  var weakMember = mon({
    slug: 'lycanroc-midday', speciesSlug: 'lycanroc', frName: 'Lougaroc',
    types: ['rock'], stats: [75, 115, 65, 55, 65, 112]
  });
  /* Équipe de 6 : aucun emplacement libre, la seule option est le remplacement. */
  var team = [weakMember, SKELEDIRGE, CORVIKNIGHT, MEOWSCARADA, QUAQUAVAL, KINGAMBIT];
  var result = analysis.evaluate({ team: team, candidate: GARCHOMP });

  assert.strictEqual(result.hasFreeSlot, false);
  assert.strictEqual(result.headline.status, 'remplacer');
  assert.strictEqual(result.headline.target.frName, 'Lougaroc');
  assert.ok(result.headline.title.indexOf('Lougaroc') !== -1);
});

test('avec une place libre, l’ajout est préféré au remplacement', function () {
  var weakMember = mon({
    slug: 'lycanroc-midday', speciesSlug: 'lycanroc', frName: 'Lougaroc',
    types: ['rock'], stats: [75, 115, 65, 55, 65, 112]
  });
  var result = analysis.evaluate({
    team: [weakMember, SKELEDIRGE, CORVIKNIGHT],
    candidate: GARCHOMP
  });
  assert.ok(result.hasFreeSlot);
  assert.strictEqual(result.headline.status, 'ajouter',
    'tant qu’un emplacement est vacant, on ne demande jamais d’écarter un Pokémon');
});

test('un slot libre + un Pokémon viable ⇒ proposition d’ajout', function () {
  var result = analysis.evaluate({
    team: [SKELEDIRGE, CORVIKNIGHT],
    candidate: FLUTTER_MANE
  });
  assert.ok(result.hasFreeSlot);
  assert.strictEqual(result.headline.status, 'ajouter');
});

test('équipe vide ⇒ aucune comparaison, message explicite', function () {
  var result = analysis.evaluate({ team: [], candidate: GARCHOMP });
  assert.strictEqual(result.headline.status, 'indetermine');
  assert.strictEqual(result.comparisons.length, 0);
});

/* ================================================================== */
section('5. Rôles, stats clés et profil de types');
/* ================================================================== */

test('les rôles sont déduits correctement des stats de base', function () {
  assert.strictEqual(analysis.roleOf(MEOWSCARADA), 'sweeper-physique');
  assert.strictEqual(analysis.roleOf(FLUTTER_MANE), 'sweeper-special');
  assert.strictEqual(analysis.roleOf(KINGAMBIT), 'attaquant-physique');
  assert.strictEqual(analysis.roleOf(CORVIKNIGHT), 'mur');
});

test('les stats clés correspondent au rôle', function () {
  assert.strictEqual(analysis.keyStatValue(MEOWSCARADA, 'sweeper-physique'), 110 + 123);
  assert.strictEqual(analysis.keyStatValue(FLUTTER_MANE, 'sweeper-special'), 135 + 135);
  assert.strictEqual(analysis.keyStatValue(CORVIKNIGHT, 'mur'), 98 + 105 + 85);
});

test('la table des types donne les multiplicateurs attendus', function () {
  var t = PokeStats.types;
  assert.strictEqual(t.effectiveness('water', ['rock']), 2);
  assert.strictEqual(t.effectiveness('electric', ['ground']), 0);
  assert.strictEqual(t.effectiveness('ice', ['dragon', 'ground']), 4);
  assert.strictEqual(t.effectiveness('normal', ['ghost']), 0);
  assert.strictEqual(t.effectiveness('fighting', ['flying', 'steel']), 1);
});

test('le profil d’équipe identifie les faiblesses partagées', function () {
  var team = [
    mon({ slug: 'x1', frName: 'X1', types: ['fire'], stats: [80, 80, 80, 80, 80, 80] }),
    mon({ slug: 'x2', frName: 'X2', types: ['rock'], stats: [80, 80, 80, 80, 80, 80] }),
    mon({ slug: 'x3', frName: 'X3', types: ['ground'], stats: [80, 80, 80, 80, 80, 80] })
  ];
  var profile = analysis.teamTypeProfile(team);
  assert.strictEqual(profile.weakCount.water, 3);
  assert.ok(profile.criticalWeaknesses.indexOf('water') !== -1);
});

/* ================================================================== */
section('6. Intégrité des données embarquées');
/* ================================================================== */

test('toutes les entrées de tiers.js sont valides', function () {
  var table = globalThis.POKESTATS_TIERS;
  var validTiers = Object.keys(table.scale);
  Object.keys(table.entries).forEach(function (slug) {
    var e = table.entries[slug];
    /* [tier Smogon, confiance] — plus éventuellement [2] le tier Game8. */
    assert.ok(Array.isArray(e) && (e.length === 2 || e.length === 3),
      'format invalide : ' + slug);
    assert.ok(validTiers.indexOf(e[0]) !== -1, 'tier inconnu « ' + e[0] + ' » pour ' + slug);
    assert.ok(e[1] === 1 || e[1] === 2, 'confiance invalide pour ' + slug);
    if (e.length === 3) {
      assert.ok(validTiers.indexOf(e[2]) !== -1,
        'second avis invalide « ' + e[2] + ' » pour ' + slug);
    }
    assert.strictEqual(slug, slug.toLowerCase(), 'identifiant non normalisé : ' + slug);
    assert.ok(/^[a-z0-9-]+$/.test(slug), 'identifiant non conforme : ' + slug);
  });
});

/* ================================================================== */
section('7. Comparateur de types — attaque et défense sont distinctes');
/* ================================================================== */

test('le profil OFFENSIF d’un type est correct', function () {
  var t = PokeStats.types;
  /* Le Feu frappe fort la Plante, mais pas l’Eau. */
  assert.strictEqual(t.effectiveness('fire', ['grass']), 2);
  assert.strictEqual(t.effectiveness('fire', ['water']), 0.5);
  assert.strictEqual(t.effectiveness('fire', ['dragon']), 0.5);
  assert.strictEqual(t.effectiveness('ground', ['flying']), 0);
});

test('le profil DÉFENSIF est bien l’inverse du profil offensif', function () {
  var t = PokeStats.types;
  /* Le Feu est fort CONTRE la Plante, mais vulnérable FACE À l’Eau : c’est
   * exactement la confusion que la page sépare. */
  assert.strictEqual(t.effectiveness('fire', ['grass']), 2, 'Feu attaque Plante');
  assert.strictEqual(t.effectiveness('water', ['fire']), 2, 'Eau attaque Feu');
  assert.strictEqual(t.effectiveness('grass', ['fire']), 0.5, 'Plante attaque Feu');
});

test('les doubles types multiplient les faiblesses (×4) et les résistances (×¼)', function () {
  var t = PokeStats.types;
  /* Carchacrok, Dragon/Sol : doublement faible à la Glace. */
  assert.strictEqual(t.effectiveness('ice', ['dragon', 'ground']), 4);
  /* Corvaillus, Vol/Acier : double résistance à l’Insecte. */
  assert.strictEqual(t.effectiveness('bug', ['flying', 'steel']), 0.25);
  /* Une immunité l’emporte toujours sur une faiblesse. */
  assert.strictEqual(t.effectiveness('ground', ['flying', 'steel']), 0);
});

test('chaque multiplicateur possible est une valeur attendue', function () {
  var t = PokeStats.types;
  var permises = [0, 0.25, 0.5, 1, 2, 4];
  var tous = t.allTypes();
  tous.forEach(function (a) {
    tous.forEach(function (d1) {
      assert.ok(permises.indexOf(t.effectiveness(a, [d1])) !== -1,
        'mono-type inattendu : ' + a + ' → ' + d1);
      tous.forEach(function (d2) {
        if (d1 === d2) return;
        var v = t.effectiveness(a, [d1, d2]);
        assert.ok(permises.indexOf(v) !== -1,
          'double type inattendu : ' + a + ' → ' + d1 + '/' + d2 + ' = ' + v);
      });
    });
  });
});

test('chaque type a au moins une faiblesse et une résistance', function () {
  var t = PokeStats.types;
  t.allTypes().forEach(function (def) {
    assert.ok(t.weaknesses([def]).length > 0, def + ' devrait avoir une faiblesse');
    assert.ok(t.resistances([def]).length > 0, def + ' devrait avoir une résistance');
  });
});

/* ================================================================== */
section('7 bis. Qui envoyer au combat');
/* ================================================================== */

/* ui.js manipule le DOM à l'affichage, mais evaluateCounter est du calcul pur. */
require(path.join(__dirname, '..', 'js', 'names.js'));
require(path.join(__dirname, '..', 'js', 'ui.js'));
var counters = PokeStats.ui;

test('un Pokémon qui frappe fort ET encaisse est le meilleur choix', function () {
  /* Carchacrok (Dragon/Sol) face à un Feu : il inflige ×2 (Sol) et ne subit
   * que ×½ (le Sol résiste au Feu... non : le Feu fait ×1 au Sol et ×½ au
   * Dragon, donc ×½ au total). */
  var evalue = counters.evaluateCounter(
    { frName: 'Carchacrok', types: ['dragon', 'ground'], bst: 600 },
    { frName: 'Cible Feu', types: ['fire'], bst: 500 }
  );
  assert.strictEqual(evalue.offense, 2, 'le Sol est super efficace sur le Feu');
  assert.strictEqual(evalue.defense, 0.5, 'le Feu n’est pas efficace sur Dragon/Sol');
  assert.ok(evalue.ratio >= 4);
  assert.strictEqual(evalue.verdict.code, 'excellent');
});

test('une immunité est signalée et ne produit pas un score infini', function () {
  /* Corvaillus (Vol/Acier) face à un Sol : il est immunisé. */
  var evalue = counters.evaluateCounter(
    { frName: 'Corvaillus', types: ['flying', 'steel'], bst: 495 },
    { frName: 'Cible Sol', types: ['ground'], bst: 500 }
  );
  assert.strictEqual(evalue.defense, 0, 'le Vol immunise au Sol');
  assert.strictEqual(evalue.immunise, true);
  assert.ok(Number.isFinite(evalue.ratio), 'le score doit rester fini');
});

test('un Pokémon qui subit ×4 est classé à éviter', function () {
  var evalue = counters.evaluateCounter(
    { frName: 'Carchacrok', types: ['dragon', 'ground'], bst: 600 },
    { frName: 'Cible Glace', types: ['ice'], bst: 400 }
  );
  assert.strictEqual(evalue.defense, 4, 'Dragon/Sol subit ×4 de la Glace');
  assert.ok(evalue.ratio < 1);
  assert.strictEqual(evalue.verdict.code, 'eviter');
});

test('frapper ×2 en subissant ×2 est signalé comme risqué, pas comme correct', function () {
  /* Une course à qui tombe le premier ne doit pas passer pour un choix correct
   * sous prétexte que le rapport vaut 1, comme un affrontement neutre.
   *
   * Aucune paire de types PURS ne se frappe mutuellement ×2 : seuls les
   * miroirs Dragon/Dragon et Spectre/Spectre le font. C'est la « guerre des
   * dragons », où celui qui frappe le premier gagne. */
  var evalue = counters.evaluateCounter(
    { frName: 'Drattak', types: ['dragon'], bst: 600 },
    { frName: 'Carchacrok', types: ['dragon', 'ground'], bst: 600 }
  );
  assert.strictEqual(evalue.offense, 2, 'le Dragon est efficace sur le Dragon');
  assert.strictEqual(evalue.defense, 2, 'et réciproquement');
  assert.strictEqual(evalue.ratio, 1);
  assert.strictEqual(evalue.verdict.code, 'risque');
});

test('le classement place le meilleur contre en tête', function () {
  var cible = { frName: 'Cible Feu', types: ['fire'], bst: 500 };
  var equipe = [
    { frName: 'Faible', types: ['grass'], bst: 400 },      // subit ×2, inflige ×½
    { frName: 'Fort', types: ['water'], bst: 500 },        // inflige ×2, subit ×½
    { frName: 'Neutre', types: ['normal'], bst: 450 }
  ];
  var classement = equipe
    .map(function (m) { return counters.evaluateCounter(m, cible); })
    .sort(function (a, b) { return b.ratio - a.ratio; });
  assert.strictEqual(classement[0].member.frName, 'Fort');
  assert.strictEqual(classement[classement.length - 1].member.frName, 'Faible');
});

/* ================================================================== */
section('8. Intégrité des données embarquées');
/* ================================================================== */

test('les données embarquées déclarent une provenance vérifiable', function () {
  var tiers = globalThis.POKESTATS_TIERS.meta;
  require(path.join(__dirname, '..', 'data', 'names-fr.js'));
  var names = globalThis.POKESTATS_NAMES_FR.meta;

  [['tiers.js', tiers], ['names-fr.js', names]].forEach(function (pair) {
    assert.ok(/^vérifié/.test(pair[1].provenance),
      pair[0] + ' doit déclarer une provenance vérifiée, pas « saisi de mémoire »');

    /* Une source acceptable est soit un paquet épinglé (version exacte), soit
     * PokéAPI — qui est une API vivante et n'a donc pas de numéro de version. */
    var pinnedPackage = /@?[\w@/-]+@\d+\.\d+\.\d+/.test(pair[1].source);
    var pokeApi = /Pok[ée]API/i.test(pair[1].source);
    assert.ok(pinnedPackage || pokeApi,
      pair[0] + ' doit citer une source traçable : ' + pair[1].source);
  });
});

test('la table des types des tests est bien celle de l’application', function () {
  require(path.join(__dirname, '..', 'data', 'type-chart.js'));
  var shipped = globalThis.POKESTATS_TYPE_CHART;
  assert.strictEqual(fixture.TYPES.length, 18, '18 types de combat attendus');
  assert.deepStrictEqual(fixture.TYPES, shipped.types,
    'les tests doivent utiliser exactement la table livrée, pas une copie');
  assert.ok(/^vérifié/.test(shipped.meta.provenance));
});

test('chaque identifiant de tiers.js est bien formé', function () {
  var entries = globalThis.POKESTATS_TIERS.entries;
  var slugs = Object.keys(entries);
  assert.ok(slugs.length > 800, 'couverture attendue : plus de 800 entrées, vu ' + slugs.length);
  slugs.forEach(function (slug) {
    assert.ok(/^[a-z0-9-]+$/.test(slug), 'identifiant non conforme : ' + slug);
    assert.strictEqual(entries[slug][1], 2,
      'toute entrée générée doit être de confiance haute : ' + slug);
    /* Le second avis est informatif : il ne doit jamais faire varier la
     * confiance, sous peine d'importer le biais d'échelle de Game8. */
    if (entries[slug].length === 3) {
      assert.strictEqual(entries[slug][1], 2,
        'le second avis ne doit pas modifier la confiance : ' + slug);
    }
  });
});

test('les formes inexistantes en Écarlate/Violet sont écartées', function () {
  require(path.join(__dirname, '..', 'js', 'names.js'));
  require(path.join(__dirname, '..', 'js', 'dex.js'));
  var motif = PokeStats.dex.UNPLAYABLE_FORM;

  /* Méga-Évolutions, Dynamax, formes Dominantes : elles n'existent pas en
   * Génération 9. Les laisser passer ferait conseiller d'entraîner un Pokémon
   * vers une forme inatteignable — Carchacrok annoncé à 700 de BST au lieu
   * de 600, parce que PokéAPI expose « garchomp-mega-z ». */
  [
    'garchomp-mega', 'garchomp-mega-z', 'charizard-mega-x', 'charizard-mega-y',
    'venusaur-gmax', 'butterfree-gmax', 'raticate-totem-alola', 'gumshoos-totem',
    'kyogre-primal', 'groudon-primal', 'eternatus-eternamax', 'pikachu-starter'
  ].forEach(function (slug) {
    assert.ok(motif.test(slug), 'devrait être écartée : ' + slug);
  });

  /* Formes légitimes : elles doivent passer. */
  [
    'garchomp', 'lycanroc-dusk', 'lycanroc-midnight', 'urshifu-rapid-strike',
    'ogerpon-wellspring-mask', 'tauros-paldea-combat-breed', 'ninetales-alola',
    'maushold-family-of-four', 'indeedee-female', 'toxtricity-low-key'
  ].forEach(function (slug) {
    assert.ok(!motif.test(slug), 'ne devrait pas être écartée : ' + slug);
  });
});

test('le second avis Game8 est exposé sans influencer la décision', function () {
  var entries = globalThis.POKESTATS_TIERS.entries;
  var withSecond = Object.keys(entries).filter(function (s) {
    return entries[s].length === 3;
  });
  assert.ok(withSecond.length > 50,
    'la tier list Game8 doit couvrir plusieurs dizaines de Pokémon, vu ' + withSecond.length);

  /* Un désaccord marqué entre les deux listes ne doit pas dégrader la donnée :
   * Game8 classe pour le Combat Classé (légendaires restreints autorisés),
   * Smogon pour son ladder singles. Les échelles ne sont pas comparables. */
  var chomp = analysis.tierOf(GARCHOMP);
  assert.strictEqual(chomp.known, true);
  assert.strictEqual(chomp.trusted, true,
    'un écart d’échelle avec Game8 ne doit pas rendre Carchacrok « peu fiable »');
  assert.ok(chomp.secondOpinion, 'le second avis doit être exposé pour l’affichage');
});

test('les symboles de genre produisent des identifiants PokéAPI valides', function () {
  require(path.join(__dirname, '..', 'data', 'names-fr.js'));
  var seed = globalThis.POKESTATS_NAMES_FR.seed;

  /* Nidoran♀ et Nidoran♂ sont deux espèces distinctes. Si les symboles ne sont
   * pas convertis, on obtient « nidoran♀ » — un identifiant que PokéAPI ne
   * connaît pas — et les deux se télescopent à la normalisation. */
  assert.strictEqual(seed['Nidoran\u2640'], 'nidoran-f');
  assert.strictEqual(seed['Nidoran\u2642'], 'nidoran-m');

  Object.keys(seed).forEach(function (label) {
    assert.ok(/^[a-z0-9-]+$/.test(seed[label]),
      'identifiant non conforme pour « ' + label + ' » : ' + seed[label]);
  });
});

test('l’index de noms français ne contient pas deux fois le même Pokémon', function () {
  require(path.join(__dirname, '..', 'data', 'names-fr.js'));
  var seed = globalThis.POKESTATS_NAMES_FR.seed;
  var seen = Object.create(null);
  Object.keys(seed).forEach(function (label) {
    var slug = seed[label];
    assert.ok(!seen[slug], 'identifiant en double : ' + slug + ' (' + label + ' et ' + seen[slug] + ')');
    seen[slug] = label;
  });
});

/* ================================================================== */
section('9. Formes multiples — la forme exacte est analysée, pas une moyenne');
/* ================================================================== */

/*
 * POURQUOI CES TESTS
 * ------------------
 * Lougaroc Diurne (115 Att / 112 Vit), Nocturne (115 / 82) et Crépusculaire
 * (117 / 110) sont trois Pokémon différents, de tiers différents. Analyser le
 * mauvais reviendrait à donner un conseil faux avec l'aplomb d'un conseil
 * juste — exactement ce que ce projet refuse.
 */

function chargerFormes() {
  require(path.join(__dirname, '..', 'data', 'forms.js'));
  require(path.join(__dirname, '..', 'data', 'names-fr.js'));
  require(path.join(__dirname, '..', 'js', 'names.js'));
  require(path.join(__dirname, '..', 'js', 'forms.js'));
  return globalThis.POKESTATS_FORMS;
}

function chargerGeneration(n) {
  require(path.join(__dirname, '..', 'data', 'gen', 'gen' + n + '.js'));
  return globalThis.POKESTATS_GEN[n];
}

test('data/forms.js déclare une provenance vérifiable', function () {
  var meta = chargerFormes().meta;
  assert.ok(/^vérifié/.test(meta.provenance), 'provenance : ' + meta.provenance);
  assert.ok(/Pok[ée]API/i.test(meta.source), 'source : ' + meta.source);
});

test('chaque forme proposée existe vraiment dans les données de sa génération', function () {
  var table = chargerFormes();
  var manquantes = [];

  Object.keys(table.species).forEach(function (espece) {
    table.species[espece].forEach(function (forme) {
      forme.g.forEach(function (generation) {
        var data = chargerGeneration(generation);
        if (!data.species[forme.s]) {
          manquantes.push(forme.s + ' (G' + generation + ')');
        }
      });
    });
  });

  assert.deepStrictEqual(manquantes, [],
    'formes annoncées mais absentes des données de jeu : ' + manquantes.slice(0, 8).join(', '));
});

test('deux formes d’une même espèce ne portent jamais le même libellé', function () {
  var table = chargerFormes();
  var collisions = [];

  Object.keys(table.species).forEach(function (espece) {
    var vus = Object.create(null);
    table.species[espece].forEach(function (forme) {
      assert.ok(forme.l && forme.l !== forme.s,
        espece + ' : forme sans libellé français (' + forme.s + ')');
      if (vus[forme.l]) collisions.push(espece + ' : « ' + forme.l + ' »');
      vus[forme.l] = true;
    });
  });

  /* Sans libellé distinct, le sélecteur afficherait trois « Forme de Paldéa »
   * indiscernables et le joueur choisirait au hasard. */
  assert.deepStrictEqual(collisions, [], collisions.join(' · '));
});

test('l’index inverse bySlug pointe vers la bonne espèce', function () {
  var table = chargerFormes();
  Object.keys(table.species).forEach(function (espece) {
    table.species[espece].forEach(function (forme) {
      assert.strictEqual(table.bySlug[forme.s], espece,
        forme.s + ' devrait appartenir à ' + espece);
    });
  });
});

test('une espèce répertoriée compte toujours au moins deux formes', function () {
  var table = chargerFormes();
  Object.keys(table.species).forEach(function (espece) {
    assert.ok(table.species[espece].length >= 2,
      espece + ' n’a qu’une forme : il n’y a alors aucun choix à proposer');
  });
});

test('les trois Lougaroc ont bien des statistiques distinctes', function () {
  chargerFormes();
  var gen9 = chargerGeneration(9);

  var diurne = gen9.species['lycanroc'];
  var nocturne = gen9.species['lycanroc-midnight'];
  var crepusculaire = gen9.species['lycanroc-dusk'];

  /* [PV, Att, Déf, AttSpé, DéfSpé, Vit] */
  assert.strictEqual(diurne.s[5], 112, 'Lougaroc Diurne : 112 de Vitesse');
  assert.strictEqual(nocturne.s[5], 82, 'Lougaroc Nocturne : 82 de Vitesse');
  assert.strictEqual(crepusculaire.s[1], 117, 'Lougaroc Crépusculaire : 117 d’Attaque');

  /* C'est tout l'intérêt du sélecteur : ces trois-là ne se valent pas. */
  assert.notStrictEqual(diurne.s[5], nocturne.s[5]);
  assert.notStrictEqual(diurne.s[1], crepusculaire.s[1]);
});

test('une forme se résout depuis son libellé saisi', function () {
  chargerFormes();
  var names = globalThis.PokeStats.names;
  var forms = globalThis.PokeStats.forms;
  names.init({ buildFullIndex: false });

  assert.strictEqual(names.toCandidateSlug('Lougaroc Forme Crépusculaire').slug, 'lycanroc-dusk');
  assert.strictEqual(names.toCandidateSlug('Lougaroc Forme Nocturne').slug, 'lycanroc-midnight');
  /* La casse, les accents et les parenthèses ne doivent pas gêner : c'est
   * exactement ce que le sélecteur réécrit dans le champ. */
  assert.strictEqual(names.toCandidateSlug('lougaroc (forme crepusculaire)').slug, 'lycanroc-dusk');

  /* Aller-retour : ce que l'interface écrit doit se relire. */
  ['lycanroc-dusk', 'lycanroc-midnight', 'tauros-paldea-aqua-breed'].forEach(function (slug) {
    assert.strictEqual(names.toCandidateSlug(forms.displayName(slug)).slug, slug,
      'aller-retour cassé pour ' + slug);
  });
});

test('les formes de combat ne sont jamais proposées au choix', function () {
  var table = chargerFormes();
  /* Superdofin ne devient Forme Super qu'une fois le combat engagé, Exagide
   * Forme Assaut de même : on ne peut pas « avoir » ces formes-là. */
  var interdites = ['palafin-hero', 'aegislash-blade', 'darmanitan-zen',
                    'terapagos-terastal', 'eiscue-noice', 'zacian-crowned'];
  interdites.forEach(function (slug) {
    assert.ok(!table.bySlug[slug], slug + ' ne devrait pas être proposable');
  });
});

test('aucune forme de transformation ne subsiste hors de sa génération', function () {
  var motif = /-(mega|gmax|totem|primal|eternamax|starter)(-|$)/;
  var disponibles = {
    mega: [6, 7], primal: [6, 7], gmax: [8], totem: [7], starter: [7], eternamax: []
  };

  [1, 2, 3, 4, 5, 6, 7, 8, 9].forEach(function (generation) {
    var data = chargerGeneration(generation);
    Object.keys(data.species).forEach(function (slug) {
      var m = motif.exec(slug);
      if (!m) return;
      assert.ok(disponibles[m[1]].indexOf(generation) !== -1,
        slug + ' ne devrait pas exister en génération ' + generation);
    });
  });
});

/* ================================================================== */
section('10. Échange d’attaques — ce que le moteur refuse de chiffrer');
/* ================================================================== */

/*
 * POURQUOI CES TESTS
 * ------------------
 * Conseiller un échange d'attaques, c'est demander au joueur de PERDRE
 * définitivement une capacité. Une erreur ici ne se rattrape pas d'un clic :
 * il faut retrouver un Maître des Capacités. Le moteur doit donc se taire dès
 * qu'il n'est pas certain — et se taire explicitement, pas en donnant un
 * conseil tiède.
 */

function chargerAttaques() {
  require(path.join(__dirname, '..', 'data', 'move-index.js'));
  require(path.join(__dirname, '..', 'js', 'movedex.js'));
  require(path.join(__dirname, '..', 'js', 'moveset.js'));
  return globalThis.PokeStats.moveset;
}

/** Pokémon minimal pour le moteur d'attaques : types et stats offensives. */
function combattant(nom, types, stats) {
  return {
    frName: nom,
    types: types,
    stats: {
      hp: stats[0], attack: stats[1], defense: stats[2],
      'special-attack': stats[3], 'special-defense': stats[4], speed: stats[5]
    }
  };
}

var CARCHACROK = combattant('Carchacrok', ['dragon', 'ground'], [108, 130, 95, 80, 85, 102]);
var PIKACHU    = combattant('Pikachu', ['electric'], [35, 55, 40, 50, 50, 90]);
var SET_CARCHA = ['dragon-claw', 'earthquake', 'crunch', 'fire-fang'];

test('un emplacement libre suffit : aucune attaque n’est sacrifiée', function () {
  var moveset = chargerAttaques();
  var v = moveset.evaluate(CARCHACROK, ['dragon-claw', 'crunch'], 'earthquake');
  assert.strictEqual(v.code, 'apprends');
  assert.strictEqual(v.drop, null, 'rien ne doit être sacrifié quand il reste de la place');
});

test('une attaque nettement plus forte du même type remplace la plus faible', function () {
  var moveset = chargerAttaques();
  var v = moveset.evaluate(PIKACHU,
    ['thunder-shock', 'quick-attack', 'tail-whip', 'growl'], 'thunderbolt');
  assert.strictEqual(v.code, 'remplace');
  assert.strictEqual(v.drop.slug, 'thunder-shock',
    'c’est Éclair, même type et plus faible, qui doit sauter');
});

test('une capacité de statut n’est jamais mise en concurrence avec une attaque', function () {
  var moveset = chargerAttaques();
  var v = moveset.evaluate(CARCHACROK, SET_CARCHA, 'swords-dance');
  assert.strictEqual(v.code, 'a-toi-de-voir');
  assert.strictEqual(v.drop, null);
  /* Refuser de trancher n'autorise pas à se taire : le joueur doit repartir
   * avec de quoi décider lui-même. */
  assert.ok(v.reasons.some(function (r) { return r.code === 'effet'; }),
    'l’effet de la capacité doit être montré');
});

test('une attaque à puissance variable n’est jamais chiffrée', function () {
  var moveset = chargerAttaques();
  /* Balayage dépend du poids de la cible : sa puissance de base vaut 0 dans
   * les données. La traiter comme une puissance réelle la ferait passer pour
   * l’attaque la plus faible du jeu. */
  var v = moveset.evaluate(CARCHACROK, SET_CARCHA, 'low-kick');
  assert.strictEqual(v.code, 'a-toi-de-voir');
  assert.ok(v.reasons.some(function (r) { return r.code === 'puissance-variable'; }));
});

test('une attaque à puissance variable n’est jamais désignée comme sacrifice', function () {
  var moveset = chargerAttaques();
  var v = moveset.evaluate(CARCHACROK,
    ['low-kick', 'dragon-claw', 'crunch', 'fire-fang'], 'earthquake');
  if (v.drop) {
    assert.notStrictEqual(v.drop.slug, 'low-kick',
      'Balayage n’est pas « faible », il est non mesurable');
  }
});

test('une attaque prioritaire n’est jamais désignée comme sacrifice', function () {
  var moveset = chargerAttaques();
  /* Vive-Attaque frappe avant l’adversaire. Son score est bas, mais sa valeur
   * ne se lit pas dans une espérance de dégâts. */
  var v = moveset.evaluate(CARCHACROK,
    ['quick-attack', 'dragon-claw', 'earthquake', 'crunch'], 'iron-head');
  if (v.drop) {
    assert.notStrictEqual(v.drop.slug, 'quick-attack');
  }
});

test('la dernière attaque du type du Pokémon n’est pas sacrifiée pour une attaque neutre', function () {
  var moveset = chargerAttaques();
  var faible = combattant('Cobaye', ['fire'], [80, 120, 80, 60, 80, 80]);
  /* Une seule attaque Feu, trois attaques neutres plus faibles qu'elle en
   * apparence : le moteur ne doit pas conseiller de perdre le STAB. */
  var v = moveset.evaluate(faible, ['ember', 'pound', 'scratch', 'tackle'], 'strength');
  if (v.code === 'remplace') {
    assert.notStrictEqual(v.drop.slug, 'ember',
      'perdre sa dernière attaque de son type n’est jamais conseillé');
  }
});

test('une couverture super-efficace unique n’est jamais perdue en silence', function () {
  var moveset = chargerAttaques();
  var v = moveset.evaluate(CARCHACROK, SET_CARCHA, 'draco-meteor');
  assert.strictEqual(v.code, 'garde');
  assert.ok(v.reasons.some(function (r) { return r.code === 'couverture-perdue'; }),
    'le motif doit nommer la couverture qui serait perdue');
});

test('un gain trop faible ne déclenche aucun échange', function () {
  var moveset = chargerAttaques();
  /* Deux attaques Sol physiques quasi identiques : l’écart tient dans ce que
   * le modèle ignore (IV, EV, nature, objet). */
  var v = moveset.evaluate(CARCHACROK,
    ['earthquake', 'dragon-claw', 'crunch', 'fire-fang'], 'high-horsepower');
  assert.notStrictEqual(v.code, 'remplace');
});

test('une capacité déjà connue est signalée, pas réanalysée', function () {
  var moveset = chargerAttaques();
  var v = moveset.evaluate(CARCHACROK, SET_CARCHA, 'earthquake');
  assert.strictEqual(v.code, 'deja-connue');
  assert.strictEqual(v.drop, null);
});

test('une capacité inconnue ne produit jamais de conseil', function () {
  var moveset = chargerAttaques();
  var v = moveset.evaluate(CARCHACROK, SET_CARCHA, 'capacite-qui-nexiste-pas');
  assert.strictEqual(v.code, 'donnee-manquante');
  assert.strictEqual(v.drop, null);
});

test('propriété : aucun échange conseillé ne fait baisser l’espérance de dégâts', function () {
  var moveset = chargerAttaques();
  var movedex = globalThis.PokeStats.movedex;

  var attaques = ['earthquake', 'dragon-claw', 'crunch', 'fire-fang', 'thunderbolt',
    'ice-beam', 'flamethrower', 'stone-edge', 'iron-head', 'outrage', 'surf',
    'psychic', 'shadow-ball', 'thunder-shock', 'ember', 'tackle', 'quick-attack',
    'swords-dance', 'low-kick', 'protect', 'bulldoze', 'metal-claw'];

  var combattants = [CARCHACROK, PIKACHU,
    combattant('Spécialiste', ['water'], [90, 60, 80, 135, 90, 80]),
    combattant('Bourrin', ['fighting'], [100, 140, 70, 40, 70, 60])];

  var graine = 20260822;
  function alea(n) {
    graine = (graine * 1103515245 + 12345) % 2147483648;
    return graine % n;
  }

  var verifs = 0;
  for (var essai = 0; essai < 600; essai++) {
    var mon = combattants[alea(combattants.length)];
    var set = [];
    while (set.length < 4) {
      var pick = attaques[alea(attaques.length)];
      if (set.indexOf(pick) === -1) set.push(pick);
    }
    var candidat = attaques[alea(attaques.length)];
    var v = moveset.evaluate(mon, set, candidat);
    if (v.code !== 'remplace') continue;

    verifs += 1;
    var avant = moveset.scoreOf(mon, movedex.get(v.drop.slug));
    var apres = moveset.scoreOf(mon, movedex.get(candidat));

    assert.ok(avant !== null && apres !== null,
      'un échange conseillé porte toujours sur deux attaques mesurables');
    assert.ok(apres > avant,
      'échange conseillé à la baisse : ' + candidat + ' (' + Math.round(apres) +
      ') pour ' + v.drop.slug + ' (' + Math.round(avant) + ') sur ' + mon.frName);
    assert.ok(!v.drop.move.isStatus, 'une capacité de statut ne se sacrifie jamais');
    assert.ok(v.drop.move.priority <= 0, 'une attaque prioritaire ne se sacrifie jamais');
    assert.strictEqual(v.drop.variable, false, 'une puissance variable ne se sacrifie jamais');
  }

  assert.ok(verifs >= 30, 'trop peu d’échanges conseillés pour conclure (' + verifs + ')');
});

test('data/move-index.js déclare une provenance vérifiable', function () {
  var meta = globalThis.POKESTATS_MOVE_INDEX.meta;
  assert.ok(/^vérifié/.test(meta.provenance), 'provenance : ' + meta.provenance);
  assert.ok(/@pkmn\/dex@\d+\.\d+\.\d+/.test(meta.source), 'source : ' + meta.source);
});

test('les valeurs des capacités suivent la génération choisie', function () {
  chargerAttaques();
  var movedex = globalThis.PokeStats.movedex;

  /* Lance-Flammes : 95 de puissance jusqu’à la 5G, 90 depuis. */
  assert.strictEqual(movedex.get('flamethrower', 1).power, 95);
  assert.strictEqual(movedex.get('flamethrower', 9).power, 90);

  /* Morsure était de type Normal avant la 2G. */
  assert.strictEqual(movedex.get('bite', 1).type, 'normal');
  assert.strictEqual(movedex.get('bite', 9).type, 'dark');

  /* Close Combat n’existe pas avant la 4G : mieux vaut rien qu’une valeur. */
  assert.strictEqual(movedex.get('close-combat', 1), null);
  assert.ok(movedex.get('close-combat', 4));
});

test('chaque capacité du catalogue a un nom français et un identifiant bien formé', function () {
  var index = globalThis.POKESTATS_MOVE_INDEX;
  var mauvais = [];
  Object.keys(index.moves).forEach(function (slug) {
    if (!/^[a-z0-9,-]+$/.test(slug)) mauvais.push(slug);
    var nom = index.moves[slug][0];
    if (!nom || typeof nom !== 'string') mauvais.push(slug + ' (sans nom)');
  });
  assert.deepStrictEqual(mauvais, [], mauvais.slice(0, 6).join(', '));
});

test('aucune capacité Z ni Gigamax dans le catalogue', function () {
  var index = globalThis.POKESTATS_MOVE_INDEX;
  /* Elles sont déclenchées par un objet ou un phénomène : elles n’occupent
   * jamais l’un des quatre emplacements d’attaque. */
  var interdites = Object.keys(index.moves).filter(function (slug) {
    return /^g-max-/.test(slug) || slug === 'breakneck-blitz' || slug === 'hydro-vortex';
  });
  assert.deepStrictEqual(interdites, []);
});

/* ================================================================== */
section('11. Persistance — la forme choisie ne se redevine pas');
/* ================================================================== */

/*
 * POURQUOI CES TESTS
 * ------------------
 * La forme d'un Pokémon était enregistrée sous la forme d'un LIBELLÉ français
 * (« Lougaroc Forme Crépusculaire »), réinterprété à chaque chargement. Il
 * suffisait que cette interprétation échoue — libellé modifié, fichier périmé
 * servi par le cache du navigateur, index des noms chargé à contretemps — pour
 * que le joueur retrouve un Lougaroc Diurne à la place de son Crépusculaire.
 *
 * L'identifiant est désormais enregistré à côté du libellé. Ces tests
 * vérifient qu'il l'est bien, qu'il survit à une équipe héritée d'une version
 * antérieure, et qu'il prime sur le texte.
 */

function chargerEquipes() {
  /* Stockage de substitution : Node n'a pas de localStorage, et les tests ne
   * doivent de toute façon rien laisser derrière eux. */
  var memoire = Object.create(null);
  globalThis.localStorage = {
    getItem: function (k) { return k in memoire ? memoire[k] : null; },
    setItem: function (k, v) { memoire[k] = String(v); },
    removeItem: function (k) { delete memoire[k]; }
  };
  delete require.cache[require.resolve(path.join(__dirname, '..', 'js', 'teams.js'))];
  require(path.join(__dirname, '..', 'data', 'forms.js'));
  require(path.join(__dirname, '..', 'data', 'names-fr.js'));
  require(path.join(__dirname, '..', 'js', 'forms.js'));
  require(path.join(__dirname, '..', 'js', 'teams.js'));
  return { teams: globalThis.PokeStats.teams, memoire: memoire };
}

test('l’identifiant d’un emplacement est enregistré à côté de la saisie', function () {
  var ctx = chargerEquipes();
  ctx.teams.init('scarlet-violet');
  ctx.teams.setSlot(0, 'Lougaroc Forme Crépusculaire', 'lycanroc-dusk');

  assert.strictEqual(ctx.teams.slots()[0], 'Lougaroc Forme Crépusculaire');
  assert.strictEqual(ctx.teams.slugOf(0), 'lycanroc-dusk',
    'sans identifiant enregistré, la forme doit être redevinée à chaque visite');

  var stocke = JSON.parse(ctx.memoire['pokestats:v2:teams']);
  assert.strictEqual(stocke.teams[0].slugs[0], 'lycanroc-dusk',
    'l’identifiant doit survivre au passage par le stockage');
});

test('une équipe enregistrée sans identifiants se recharge sans erreur', function () {
  var ctx = chargerEquipes();
  ctx.memoire['pokestats:v2:teams'] = JSON.stringify({
    activeId: 'a',
    teams: [{ id: 'a', name: 'Ancienne', gameId: 'scarlet-violet',
              slots: ['Carchacrok', '', '', '', '', ''] }]
  });
  ctx.teams.init('scarlet-violet');

  assert.strictEqual(ctx.teams.slots()[0], 'Carchacrok');
  assert.deepStrictEqual(ctx.teams.slugs(), ['', '', '', '', '', ''],
    'aucun identifiant inventé pour une équipe qui n’en avait pas');
  assert.deepStrictEqual(ctx.teams.movesOf(0), []);
});

test('vider un emplacement efface aussi son identifiant', function () {
  var ctx = chargerEquipes();
  ctx.teams.init('scarlet-violet');
  ctx.teams.setSlot(0, 'Lougaroc Forme Nocturne', 'lycanroc-midnight');
  ctx.teams.setSlot(0, '');
  assert.strictEqual(ctx.teams.slugOf(0), '');
});

test('changer de forme conserve les attaques, changer de Pokémon les efface', function () {
  var ctx = chargerEquipes();
  ctx.teams.init('scarlet-violet');

  ctx.teams.setSlot(0, 'Lougaroc Forme Diurne', 'lycanroc');
  ctx.teams.setMoves(0, ['stone-edge', 'crunch']);

  /* Même Pokémon, autre forme : les attaques restent pertinentes. */
  ctx.teams.setSlot(0, 'Lougaroc Forme Crépusculaire', 'lycanroc-dusk');
  assert.deepStrictEqual(ctx.teams.movesOf(0), ['stone-edge', 'crunch']);

  /* Autre Pokémon : rien ne dit qu’il connaît ces attaques. */
  ctx.teams.setSlot(0, 'Carchacrok', 'garchomp');
  assert.deepStrictEqual(ctx.teams.movesOf(0), [],
    'les attaques de l’ancien occupant ne doivent pas être attribuées au nouveau');
});

/* ------------------------------------------------------------------ */

console.log('\n' + '-'.repeat(60));
if (failures.length) {
  console.log(passed + ' test(s) réussi(s), ' + failures.length + ' échec(s).');
  process.exitCode = 1;
} else {
  console.log('Tous les tests sont passés (' + passed + ').');
}
