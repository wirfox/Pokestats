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

/* ------------------------------------------------------------------ */

console.log('\n' + '-'.repeat(60));
if (failures.length) {
  console.log(passed + ' test(s) réussi(s), ' + failures.length + ' échec(s).');
  process.exitCode = 1;
} else {
  console.log('Tous les tests sont passés (' + passed + ').');
}
