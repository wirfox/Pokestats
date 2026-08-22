/*
 * js/movedex.js — Catalogue des capacités.
 * ========================================
 *
 * Traduit ce que le joueur tape (« Lance-Flammes ») en capacité connue, et
 * donne ses valeurs de combat POUR LA GÉNÉRATION DU JEU CHOISI.
 *
 * Ce dernier point n'est pas un détail : Lance-Flammes valait 95 de puissance
 * jusqu'à la 5G et 90 depuis, Morsure était de type Normal en 1G, et la
 * répartition physique / spécial ne dépendait pas de la capacité mais de son
 * type avant la 4G. Conseiller un échange d'attaques sur les valeurs
 * d'aujourd'hui à un joueur de Rouge Feu serait faux.
 *
 * Aucune décision ici : ce module ne fait que lire data/move-index.js.
 */
(function (root) {
  'use strict';

  var PokeStats = (root.PokeStats = root.PokeStats || {});

  /* Index « nom normalisé → identifiant », construit à la première demande. */
  var byName = null;
  var labels = [];

  function table() {
    return root.POKESTATS_MOVE_INDEX || { moves: {}, parGeneration: {}, effets: {} };
  }

  function normalize(value) {
    var names = PokeStats.names;
    if (names && names.normalize) return names.normalize(value);
    return String(value == null ? '' : value)
      .trim().toLowerCase().normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '');
  }

  function buildIndex() {
    if (byName) return;
    byName = Object.create(null);
    labels = [];
    var moves = table().moves;
    Object.keys(moves).forEach(function (slug) {
      var fr = moves[slug][0];
      [fr, slug].forEach(function (label) {
        var key = normalize(label);
        if (!key || byName[key]) return;
        byName[key] = slug;
      });
      labels.push({ slug: slug, label: fr, key: normalize(fr) });
    });
    labels.sort(function (a, b) { return a.label.localeCompare(b.label, 'fr'); });
  }

  /** Génération du jeu sélectionné, ou `null` si aucun jeu n'est choisi. */
  function generation() {
    var game = PokeStats.game;
    var data = game && game.genData && game.genData();
    return (data && data.generation) || null;
  }

  /**
   * Fiche d'une capacité, ajustée à la génération demandée.
   *
   * @param {string} slug identifiant PokéAPI (« flamethrower »)
   * @param {number} [gen] génération ; par défaut celle du jeu choisi
   * @returns {Object|null} `null` si la capacité est inconnue, ou si elle
   *          n'existait pas encore à cette génération.
   */
  function get(slug, gen) {
    var t = table();
    var row = t.moves[slug];
    if (!row) return null;

    var g = gen === undefined ? generation() : gen;
    var type = row[1], category = row[2], power = row[3], accuracy = row[4], pp = row[5];

    if (g) {
      if (row[7] > g) return null;             // capacité pas encore inventée
      var patch = (t.parGeneration[g] || {})[slug];
      if (patch) {
        type = patch[0]; category = patch[1];
        power = patch[2]; accuracy = patch[3]; pp = patch[4];
      }
    }

    return {
      slug: slug,
      frName: row[0],
      type: type,
      category: category,
      power: power,
      accuracy: accuracy,
      pp: pp,
      priority: row[6],
      firstGeneration: row[7],
      isStatus: category === 'sta',
      effect: t.effets[slug] || null,
      generation: g || null
    };
  }

  /**
   * Traduit une saisie en identifiant de capacité.
   * @returns {string|null}
   */
  function resolve(input) {
    buildIndex();
    var key = normalize(input);
    if (!key) return null;
    return byName[key] || null;
  }

  /**
   * Propositions pour l'autocomplétion.
   *
   * @param {string} input
   * @param {{limit?: number, only?: Object, generation?: number}} [opts]
   *        `only` : ensemble d'identifiants autorisés (les capacités que CE
   *        Pokémon peut apprendre). Sans lui, on propose tout le catalogue.
   */
  function suggest(input, opts) {
    buildIndex();
    var o = opts || {};
    var key = normalize(input);
    if (!key) return [];
    var max = o.limit || 8;
    var gen = o.generation === undefined ? generation() : o.generation;

    var debut = [];
    var ailleurs = [];
    for (var i = 0; i < labels.length; i++) {
      var entry = labels[i];
      if (o.only && !o.only[entry.slug]) continue;
      var move = get(entry.slug, gen);
      if (!move) continue;                    // inexistante à cette génération
      if (entry.key.indexOf(key) === 0) debut.push(move);
      else if (entry.key.indexOf(key) !== -1) ailleurs.push(move);
      if (debut.length >= max) break;
    }
    return debut.concat(ailleurs).slice(0, max);
  }

  function meta() { return table().meta || null; }

  PokeStats.movedex = {
    get: get,
    resolve: resolve,
    suggest: suggest,
    meta: meta,
    /* Exposé pour les tests : vide l'index quand les données changent. */
    reset: function () { byName = null; labels = []; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
