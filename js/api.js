/*
 * js/api.js — Couche d'accès aux données (PokéAPI).
 * =================================================
 *
 * Responsabilité UNIQUE : récupérer des données brutes et les mettre en cache.
 * Aucun calcul, aucun jugement de valeur, aucun affichage.
 *
 * Toutes les données objectives de l'application transitent par ici :
 *   - statistiques de base, types, talents  → /pokemon/{id}
 *   - noms localisés, chaîne d'évolution    → /pokemon-species/{id}
 *   - évolutions                            → /evolution-chain/{id}
 *   - table d'efficacité des types          → /type/{id}
 *
 * Rien n'est codé en dur : si PokéAPI est injoignable, l'application le dit
 * et refuse d'analyser plutôt que d'inventer.
 */
(function (root) {
  'use strict';

  var PokeStats = (root.PokeStats = root.PokeStats || {});

  var BASE = 'https://pokeapi.co/api/v2';

  /* Endpoints GraphQL de PokéAPI, essayés dans l'ordre. Ils permettent de
   * récupérer TOUS les noms d'espèces localisés en une seule requête, au lieu
   * de ~1025 appels REST. */
  var GRAPHQL_ENDPOINTS = [
    'https://graphql.pokeapi.co/v1beta2',
    'https://beta.pokeapi.co/graphql/v1beta'
  ];

  var REQUEST_TIMEOUT_MS = 15000;

  /* ------------------------------------------------------------------ */
  /* Erreurs typées — l'interface adapte son message selon le type.      */
  /* ------------------------------------------------------------------ */

  function ApiError(message, kind, detail) {
    var err = new Error(message);
    err.name = 'ApiError';
    err.kind = kind;           // 'not-found' | 'network' | 'server' | 'parse'
    err.detail = detail || null;
    return err;
  }

  /* ------------------------------------------------------------------ */
  /* Cache                                                               */
  /* ------------------------------------------------------------------ */

  /* Cache mémoire : évite de refaire un appel dans la même session. */
  var memoryCache = new Map();
  /* Requêtes en vol : deux demandes simultanées de la même URL n'en font qu'une. */
  var inFlight = new Map();

  var STORAGE_PREFIX = 'pokestats:v1:';

  function storageGet(key) {
    try {
      var raw = root.localStorage && root.localStorage.getItem(STORAGE_PREFIX + key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null; // localStorage indisponible (mode privé, file://, quota…)
    }
  }

  function storageSet(key, value) {
    try {
      if (root.localStorage) {
        root.localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
      }
    } catch (e) {
      /* Quota dépassé ou stockage refusé : sans importance, le cache mémoire suffit. */
    }
  }

  function clearCache() {
    memoryCache.clear();
    try {
      if (!root.localStorage) return;
      var doomed = [];
      for (var i = 0; i < root.localStorage.length; i++) {
        var k = root.localStorage.key(i);
        if (k && k.indexOf(STORAGE_PREFIX) === 0) doomed.push(k);
      }
      doomed.forEach(function (k) { root.localStorage.removeItem(k); });
    } catch (e) { /* ignore */ }
  }

  /* ------------------------------------------------------------------ */
  /* Requête HTTP                                                        */
  /* ------------------------------------------------------------------ */

  function fetchWithTimeout(url, options) {
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var opts = Object.assign({}, options || {});
    if (controller) opts.signal = controller.signal;

    var timer = setTimeout(function () {
      if (controller) controller.abort();
    }, REQUEST_TIMEOUT_MS);

    return root.fetch(url, opts).then(
      function (res) { clearTimeout(timer); return res; },
      function (err) { clearTimeout(timer); throw err; }
    );
  }

  /**
   * Récupère une URL JSON, avec cache et déduplication des requêtes.
   * @param {string} url
   * @param {{persist?: boolean}} [opts] persist=true → cache aussi en localStorage
   * @returns {Promise<Object>}
   */
  function getJSON(url, opts) {
    var persist = !!(opts && opts.persist);

    if (memoryCache.has(url)) return Promise.resolve(memoryCache.get(url));
    if (inFlight.has(url)) return inFlight.get(url);

    if (persist) {
      var stored = storageGet(url);
      if (stored) {
        memoryCache.set(url, stored);
        return Promise.resolve(stored);
      }
    }

    var promise = fetchWithTimeout(url)
      .then(function (res) {
        if (res.status === 404) {
          throw ApiError('Ressource introuvable sur PokéAPI.', 'not-found', url);
        }
        if (!res.ok) {
          throw ApiError('PokéAPI a répondu avec le code ' + res.status + '.', 'server', url);
        }
        return res.json().catch(function () {
          throw ApiError('Réponse illisible de PokéAPI.', 'parse', url);
        });
      })
      .then(function (data) {
        memoryCache.set(url, data);
        if (persist) storageSet(url, data);
        inFlight.delete(url);
        return data;
      })
      .catch(function (err) {
        inFlight.delete(url);
        if (err && err.name === 'ApiError') throw err;
        if (err && err.name === 'AbortError') {
          throw ApiError('PokéAPI ne répond pas (délai dépassé).', 'network', url);
        }
        throw ApiError(
          'Impossible de joindre PokéAPI. Vérifie ta connexion Internet.',
          'network',
          url
        );
      });

    inFlight.set(url, promise);
    return promise;
  }

  /* ------------------------------------------------------------------ */
  /* Points d'entrée métier                                              */
  /* ------------------------------------------------------------------ */

  /** Normalise une saisie en identifiant utilisable par PokéAPI. */
  function toSlug(value) {
    return String(value == null ? '' : value)
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')   // retire les accents
      .replace(/\u0153/g, 'oe')          // Nœunœuf → noeunoeuf
      .replace(/\u00e6/g, 'ae')
      .replace(/\u2640/g, '-f')          // Nidoran♀ → nidoran-f
      .replace(/\u2642/g, '-m')          // Nidoran♂ → nidoran-m
      .replace(/['’.:]/g, '')            // Farfetch'd, Mr. Mime…
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /** Données de combat d'une forme précise : stats, types, talents, sprite. */
  function getPokemon(slug) {
    return getJSON(BASE + '/pokemon/' + toSlug(slug), { persist: true });
  }

  /** Données d'espèce : noms localisés, chaîne d'évolution, statut légendaire. */
  function getSpecies(slug) {
    return getJSON(BASE + '/pokemon-species/' + toSlug(slug), { persist: true });
  }

  /** Chaîne d'évolution complète, à partir de l'URL fournie par l'espèce. */
  function getEvolutionChain(url) {
    return getJSON(url, { persist: true });
  }

  /**
   * Métadonnées d'une forme (Lougaroc Diurne / Nocturne / Crépusculaire…).
   * Sert uniquement à récupérer le nom de forme localisé en français.
   */
  function getPokemonForm(slug) {
    return getJSON(BASE + '/pokemon-form/' + toSlug(slug), { persist: true });
  }

  /** Relations de dégâts d'un type (pour construire la table d'efficacité). */
  function getType(name) {
    return getJSON(BASE + '/type/' + toSlug(name), { persist: true });
  }

  /**
   * Récupère en une requête tous les noms d'espèces d'une langue donnée.
   * Utilisé pour construire l'index de noms français complet.
   *
   * @param {string} [languageIso] code langue PokéAPI ('fr' par défaut)
   * @returns {Promise<Array<{name: string, slug: string}>>}
   */
  function getAllSpeciesNames(languageIso) {
    var iso = languageIso || 'fr';

    /* Deux dialectes de schéma coexistent selon l'endpoint GraphQL. */
    var queries = [
      {
        endpoint: GRAPHQL_ENDPOINTS[0],
        query:
          'query Names($iso: String!) {' +
          '  pokemonspeciesname(where: {language: {name: {_eq: $iso}}}) {' +
          '    name pokemonspecy { name }' +
          '  }' +
          '}',
        extract: function (data) {
          return (data.pokemonspeciesname || []).map(function (row) {
            return { name: row.name, slug: row.pokemonspecy && row.pokemonspecy.name };
          });
        }
      },
      {
        endpoint: GRAPHQL_ENDPOINTS[1],
        query:
          'query Names($iso: String!) {' +
          '  pokemon_v2_pokemonspeciesname(where: {pokemon_v2_language: {name: {_eq: $iso}}}) {' +
          '    name pokemon_v2_pokemonspecy { name }' +
          '  }' +
          '}',
        extract: function (data) {
          return (data.pokemon_v2_pokemonspeciesname || []).map(function (row) {
            return { name: row.name, slug: row.pokemon_v2_pokemonspecy && row.pokemon_v2_pokemonspecy.name };
          });
        }
      }
    ];

    function attempt(index) {
      if (index >= queries.length) {
        throw ApiError(
          "Impossible de construire l'index des noms français depuis PokéAPI.",
          'network',
          'graphql'
        );
      }
      var q = queries[index];
      return fetchWithTimeout(q.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q.query, variables: { iso: iso } })
      })
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        })
        .then(function (payload) {
          if (payload.errors) throw new Error('GraphQL error');
          var rows = q.extract(payload.data || {}).filter(function (r) {
            return r.name && r.slug;
          });
          if (!rows.length) throw new Error('empty');
          return rows;
        })
        .catch(function () {
          return attempt(index + 1);
        });
    }

    return attempt(0);
  }

  PokeStats.api = {
    BASE: BASE,
    toSlug: toSlug,
    getJSON: getJSON,
    getPokemon: getPokemon,
    getSpecies: getSpecies,
    getEvolutionChain: getEvolutionChain,
    getPokemonForm: getPokemonForm,
    getType: getType,
    getAllSpeciesNames: getAllSpeciesNames,
    clearCache: clearCache,
    ApiError: ApiError
  };
})(typeof window !== 'undefined' ? window : globalThis);
