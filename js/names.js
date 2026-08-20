/*
 * js/names.js — Résolution d'un nom saisi (français ou anglais) vers un
 *               identifiant PokéAPI, et autocomplétion.
 * =====================================================================
 *
 * Ordre de résolution (du plus fiable au moins fiable) :
 *   1. Index complet des noms français construit en direct depuis PokéAPI
 *      (une seule requête GraphQL, puis mise en cache localStorage).
 *   2. Index de secours embarqué (data/names-fr.js).
 *   3. La saisie normalisée utilisée telle quelle comme identifiant PokéAPI
 *      — ce qui couvre nativement l'anglais ("rockruff", "great-tusk"…).
 *   4. Suggestions de correction si rien ne correspond.
 *
 * Le nom AFFICHÉ à l'utilisateur ne vient jamais d'ici : il provient toujours
 * de PokéAPI (voir dex.js). Cet index ne sert qu'à trouver quoi demander.
 */
(function (root) {
  'use strict';

  var PokeStats = (root.PokeStats = root.PokeStats || {});
  var api = PokeStats.api;

  var INDEX_STORAGE_KEY = 'pokestats:v1:names-fr-index';

  /* norm(nom français) → slug PokéAPI */
  var index = Object.create(null);
  /* Liste des libellés d'origine, pour l'autocomplétion et les suggestions. */
  var labels = [];
  var indexSource = 'aucun';

  /**
   * Normalise pour la comparaison : minuscules, sans accents ni ponctuation.
   *
   * Les symboles de genre sont convertis AVANT d'être retirés, sans quoi
   * Nidoran♀ et Nidoran♂ produiraient la même clé et l'un des deux deviendrait
   * inatteignable.
   */
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

  function addEntry(label, slug) {
    var key = normalize(label);
    if (!key || !slug) return;
    if (!(key in index)) labels.push({ label: label, slug: slug, key: key });
    index[key] = slug;
  }

  /** Charge l'index de secours embarqué. Toujours disponible, même hors ligne. */
  function loadSeed() {
    var seed = (root.POKESTATS_NAMES_FR && root.POKESTATS_NAMES_FR.seed) || {};
    Object.keys(seed).forEach(function (label) { addEntry(label, seed[label]); });
    if (indexSource === 'aucun') indexSource = 'secours embarqué';
  }

  function loadCachedIndex() {
    try {
      var raw = root.localStorage && root.localStorage.getItem(INDEX_STORAGE_KEY);
      if (!raw) return false;
      var parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.rows) || !parsed.rows.length) return false;
      parsed.rows.forEach(function (row) { addEntry(row[0], row[1]); });
      indexSource = 'PokéAPI (cache local)';
      return true;
    } catch (e) {
      return false;
    }
  }

  function storeIndex(rows) {
    try {
      if (!root.localStorage) return;
      root.localStorage.setItem(
        INDEX_STORAGE_KEY,
        JSON.stringify({ builtAt: Date.now(), rows: rows })
      );
    } catch (e) { /* quota : sans conséquence */ }
  }

  /**
   * Construit l'index français complet depuis PokéAPI.
   * Échoue silencieusement : l'index de secours prend alors le relais.
   * @returns {Promise<{ok: boolean, count: number, source: string}>}
   */
  function buildFullIndex() {
    if (!api || !api.getAllSpeciesNames) {
      return Promise.resolve({ ok: false, count: labels.length, source: indexSource });
    }
    return api.getAllSpeciesNames('fr').then(
      function (rows) {
        var compact = [];
        rows.forEach(function (row) {
          addEntry(row.name, row.slug);
          compact.push([row.name, row.slug]);
        });
        storeIndex(compact);
        indexSource = 'PokéAPI (index complet)';
        return { ok: true, count: compact.length, source: indexSource };
      },
      function () {
        return { ok: false, count: labels.length, source: indexSource };
      }
    );
  }

  /**
   * Initialise la résolution de noms.
   * L'index de secours est chargé immédiatement (synchrone) pour que
   * l'application soit utilisable tout de suite ; l'index complet est
   * construit en arrière-plan.
   */
  function init(options) {
    loadSeed();
    var hadCache = loadCachedIndex();
    var eager = !options || options.buildFullIndex !== false;
    if (!eager) return Promise.resolve({ ok: hadCache, count: labels.length, source: indexSource });
    if (hadCache) {
      /* Cache déjà présent : on ne rappelle pas le réseau. */
      return Promise.resolve({ ok: true, count: labels.length, source: indexSource });
    }
    return buildFullIndex();
  }

  /**
   * Traduit une saisie utilisateur en identifiant PokéAPI candidat.
   * @param {string} input
   * @returns {{slug: string, via: string}} via ∈ {'index', 'saisie directe'}
   */
  function toCandidateSlug(input) {
    var key = normalize(input);
    if (key && index[key]) return { slug: index[key], via: 'index' };
    return { slug: api.toSlug(input), via: 'saisie directe' };
  }

  /** Distance de Levenshtein bornée, pour proposer des corrections. */
  function editDistance(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    var prev = new Array(b.length + 1);
    var cur = new Array(b.length + 1);
    for (var j = 0; j <= b.length; j++) prev[j] = j;
    for (var i = 1; i <= a.length; i++) {
      cur[0] = i;
      var best = cur[0];
      for (var k = 1; k <= b.length; k++) {
        var cost = a.charCodeAt(i - 1) === b.charCodeAt(k - 1) ? 0 : 1;
        cur[k] = Math.min(cur[k - 1] + 1, prev[k] + 1, prev[k - 1] + cost);
        if (cur[k] < best) best = cur[k];
      }
      if (best > max) return max + 1;
      for (var m = 0; m <= b.length; m++) prev[m] = cur[m];
    }
    return prev[b.length];
  }

  /**
   * Suggestions pour l'autocomplétion (préfixe puis sous-chaîne).
   * @returns {Array<{label: string, slug: string}>}
   */
  function suggest(input, limit) {
    var key = normalize(input);
    var max = limit || 8;
    if (!key) return [];
    var starts = [];
    var contains = [];
    for (var i = 0; i < labels.length; i++) {
      var entry = labels[i];
      if (entry.key.indexOf(key) === 0) starts.push(entry);
      else if (entry.key.indexOf(key) !== -1) contains.push(entry);
      if (starts.length >= max) break;
    }
    return starts.concat(contains).slice(0, max).map(function (e) {
      return { label: e.label, slug: e.slug };
    });
  }

  /** Corrections proposées quand aucun Pokémon ne correspond à la saisie. */
  function didYouMean(input, limit) {
    var key = normalize(input);
    if (!key) return [];
    var tolerance = key.length <= 5 ? 1 : 2;
    var scored = [];
    for (var i = 0; i < labels.length; i++) {
      var d = editDistance(key, labels[i].key, tolerance);
      if (d <= tolerance) scored.push({ label: labels[i].label, slug: labels[i].slug, d: d });
    }
    scored.sort(function (a, b) { return a.d - b.d; });
    return scored.slice(0, limit || 5);
  }

  function status() {
    return { source: indexSource, count: labels.length };
  }

  PokeStats.names = {
    init: init,
    buildFullIndex: buildFullIndex,
    normalize: normalize,
    toCandidateSlug: toCandidateSlug,
    suggest: suggest,
    didYouMean: didYouMean,
    status: status,
    allLabels: function () { return labels.slice(); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
