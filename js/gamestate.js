/*
 * js/gamestate.js — Jeu sélectionné et données de sa génération.
 * ==============================================================
 *
 * POURQUOI CE MODULE
 * ------------------
 * Les statistiques, les types, la table d'efficacité et les tiers dépendent de
 * la génération du jeu auquel on joue. Servir les valeurs actuelles à un joueur
 * de Rouge/Bleu serait faux : Mélodelfe y est Normal, pas Fée, et le Spectre
 * n'y touche pas le Psy.
 *
 * Ce module est la source de vérité du jeu choisi. Il :
 *   - retient le choix dans localStorage d'une visite à l'autre ;
 *   - charge à la demande le fichier de la génération concernée, un seul à la
 *     fois (195 Ko pour la 9G — inutile de charger les neuf) ;
 *   - prévient les autres modules quand le jeu change.
 */
(function (root, document) {
  'use strict';

  var PokeStats = (root.PokeStats = root.PokeStats || {});

  var STORAGE_KEY = 'pokestats:v2:game';
  var DEFAULT_GAME = 'scarlet-violet';

  var currentId = null;
  var listeners = [];
  var genPromises = {};   // génération → promesse de chargement

  /* ------------------------------------------------------------------ */
  /* Catalogue des jeux                                                  */
  /* ------------------------------------------------------------------ */

  function catalogue() {
    var table = root.POKESTATS_GAMES;
    return (table && table.games) || [];
  }

  function byId(id) {
    return catalogue().filter(function (g) { return g.id === id; })[0] || null;
  }

  /** Jeux regroupés par génération, pour un menu lisible. */
  function grouped() {
    var groups = {};
    catalogue().forEach(function (g) {
      (groups[g.generation] = groups[g.generation] || []).push(g);
    });
    return Object.keys(groups)
      .map(Number)
      .sort(function (a, b) { return b - a; })   // les plus récents d'abord
      .map(function (gen) { return { generation: gen, games: groups[gen] }; });
  }

  /* ------------------------------------------------------------------ */
  /* Persistance                                                         */
  /* ------------------------------------------------------------------ */

  function readStored() {
    try {
      var raw = root.localStorage && root.localStorage.getItem(STORAGE_KEY);
      return raw && byId(raw) ? raw : null;
    } catch (e) {
      return null;   // stockage refusé : on repart du jeu par défaut
    }
  }

  function persist(id) {
    try {
      if (root.localStorage) root.localStorage.setItem(STORAGE_KEY, id);
    } catch (e) { /* sans conséquence */ }
  }

  /* ------------------------------------------------------------------ */
  /* Chargement des données de génération                                */
  /* ------------------------------------------------------------------ */

  /**
   * Injecte data/gen/gen{N}.js. On passe par une balise <script> et non par
   * fetch : c'est la seule voie qui fonctionne aussi lorsque la page est
   * ouverte directement depuis le disque (file://).
   */
  function loadGeneration(generation) {
    if (root.POKESTATS_GEN && root.POKESTATS_GEN[generation]) {
      return Promise.resolve(root.POKESTATS_GEN[generation]);
    }
    if (genPromises[generation]) return genPromises[generation];

    genPromises[generation] = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = 'data/gen/gen' + generation + '.js';
      script.async = true;
      script.onload = function () {
        var payload = root.POKESTATS_GEN && root.POKESTATS_GEN[generation];
        if (payload) resolve(payload);
        else reject(new Error('Fichier de génération ' + generation + ' illisible.'));
      };
      script.onerror = function () {
        genPromises[generation] = null;   // permet une nouvelle tentative
        reject(new Error('Données de la génération ' + generation + ' introuvables.'));
      };
      document.head.appendChild(script);
    });

    return genPromises[generation];
  }

  /** Données de la génération du jeu courant, ou null si pas encore chargées. */
  function genData() {
    var game = current();
    if (!game) return null;
    return (root.POKESTATS_GEN && root.POKESTATS_GEN[game.generation]) || null;
  }

  /* ------------------------------------------------------------------ */
  /* Sélection                                                           */
  /* ------------------------------------------------------------------ */

  function current() {
    return byId(currentId) || byId(DEFAULT_GAME) || catalogue()[0] || null;
  }

  function onChange(callback) {
    listeners.push(callback);
  }

  function notify() {
    var game = current();
    listeners.forEach(function (cb) {
      try { cb(game); } catch (e) { /* un abonné fautif n'en bloque pas d'autres */ }
    });
  }

  /**
   * Choisit un jeu, charge sa génération, puis prévient les abonnés.
   * @returns {Promise<Object>} le jeu sélectionné
   */
  function select(id) {
    var game = byId(id);
    if (!game) return Promise.reject(new Error('Jeu inconnu : ' + id));
    currentId = game.id;
    persist(game.id);
    return loadGeneration(game.generation).then(function () {
      notify();
      return game;
    });
  }

  /** Initialise depuis le choix mémorisé, ou le jeu par défaut. */
  function init() {
    var stored = readStored();
    return select(stored || DEFAULT_GAME);
  }

  /* ------------------------------------------------------------------ */
  /* Pokédex du jeu                                                      */
  /* ------------------------------------------------------------------ */

  /**
   * Espèces figurant dans le jeu courant, dans l'ordre du Pokédex.
   * Les jeux à plusieurs pokédex (Écarlate/Violet et ses DLC, X/Y et ses trois
   * zones) sont concaténés sans doublon, dans l'ordre déclaré.
   */
  function dexSpecies() {
    var game = current();
    var table = root.POKESTATS_POKEDEX;
    if (!game || !table || !table.dexes) return [];
    var seen = Object.create(null);
    var out = [];
    game.pokedexes.forEach(function (name) {
      (table.dexes[name] || []).forEach(function (slug) {
        if (seen[slug]) return;
        seen[slug] = true;
        out.push(slug);
      });
    });
    return out;
  }

  var membershipCache = { gameId: null, set: null };

  /** Ce Pokémon figure-t-il dans le jeu courant ? */
  function isInGame(speciesSlug) {
    var game = current();
    if (!game) return false;
    if (membershipCache.gameId !== game.id) {
      var set = Object.create(null);
      dexSpecies().forEach(function (s) { set[s] = true; });
      membershipCache = { gameId: game.id, set: set };
    }
    return !!membershipCache.set[speciesSlug];
  }

  PokeStats.game = {
    list: catalogue,
    grouped: grouped,
    byId: byId,
    current: current,
    select: select,
    init: init,
    onChange: onChange,
    genData: genData,
    loadGeneration: loadGeneration,
    dexSpecies: dexSpecies,
    isInGame: isInGame,
    STORAGE_KEY: STORAGE_KEY
  };
})(typeof window !== 'undefined' ? window : globalThis,
   typeof document !== 'undefined' ? document : null);
