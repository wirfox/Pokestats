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

  /*
   * Le cache disque a son propre préfixe, distinct de tout ce que
   * l'utilisateur a saisi.
   *
   * Ce n'est pas cosmétique. localStorage est un espace COMMUN d'environ
   * 5 Mo : une fiche PokéAPI pèse 200 à 280 Ko (elle embarque la liste
   * complète des capacités et tous les sprites), et une vingtaine de Pokémon
   * consultés suffisaient à le saturer. Une fois plein, TOUTE écriture échoue
   * — y compris celle de l'équipe. L'utilisateur perdait ses attaques et la
   * forme de ses Pokémon sans le moindre message : son travail était sacrifié
   * pour garder en mémoire des données que le réseau peut toujours redonner.
   *
   * Séparer les préfixes permet de vider le cache SANS toucher aux équipes,
   * et de le faire automatiquement quand la place vient à manquer.
   */
  var STORAGE_PREFIX = 'pokestats:v1:cache:';
  var LEGACY_PREFIX = 'pokestats:v1:http';   // ancien emplacement, à purger

  /* Au-delà, l'entrée n'est pas écrite sur disque : le cache mémoire suffit
   * pour la session, et une entrée géante coûte plus qu'elle ne rapporte. */
  var MAX_ENTRY_BYTES = 64 * 1024;

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
      if (!root.localStorage) return;
      var payload = JSON.stringify(value);
      if (payload.length > MAX_ENTRY_BYTES) return;
      root.localStorage.setItem(STORAGE_PREFIX + key, payload);
    } catch (e) {
      /* Quota dépassé : on fait de la place en sacrifiant le cache, jamais
       * les données de l'utilisateur. Si cela ne suffit pas, tant pis — le
       * cache mémoire assure la session. */
      purge();
      try {
        root.localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
      } catch (e2) { /* on renonce silencieusement, sans rien perdre d'utile */ }
    }
  }

  /** Supprime les entrées de cache. Ne touche à rien d'autre. */
  function purge() {
    try {
      if (!root.localStorage) return 0;
      var doomed = [];
      for (var i = 0; i < root.localStorage.length; i++) {
        var k = root.localStorage.key(i);
        if (!k) continue;
        if (k.indexOf(STORAGE_PREFIX) === 0 || k.indexOf(LEGACY_PREFIX) === 0) doomed.push(k);
      }
      doomed.forEach(function (k) { root.localStorage.removeItem(k); });
      return doomed.length;
    } catch (e) { return 0; }
  }

  function clearCache() {
    memoryCache.clear();
    return purge();
  }

  /*
   * Les fiches mises en cache par les versions antérieures occupent l'espace
   * sans que rien ne les relise : elles sont écrites sous l'ancien préfixe. On
   * les supprime au démarrage, une fois pour toutes. C'est ce qui rend la
   * place aux équipes des utilisateurs déjà touchés par la saturation.
   */
  function purgeLegacy() {
    try {
      if (!root.localStorage) return 0;
      var doomed = [];
      for (var i = 0; i < root.localStorage.length; i++) {
        var k = root.localStorage.key(i);
        if (k && k.indexOf(LEGACY_PREFIX) === 0) doomed.push(k);
      }
      doomed.forEach(function (k) { root.localStorage.removeItem(k); });
      return doomed.length;
    } catch (e) { return 0; }
  }

  purgeLegacy();

  /* ------------------------------------------------------------------ */
  /* Allègement des fiches avant mise en cache                           */
  /* ------------------------------------------------------------------ */

  /*
   * Une fiche /pokemon fait 200 Ko et plus. L'application n'en lit qu'une
   * poignée de champs : le reste (URL de chaque capacité, méthode et niveau
   * d'apprentissage, quinze jeux de sprites) ne sert à rien et remplit le
   * disque de l'utilisateur.
   *
   * On n'allège que la COPIE mise en cache ; la réponse rendue à l'appelant
   * est celle de PokéAPI, intacte. Les deux se lisent de la même façon.
   */
  function compactPokemon(doc) {
    var s = doc.sprites || {};
    var autres = s.other || {};
    return {
      id: doc.id,
      name: doc.name,
      species: doc.species,
      stats: (doc.stats || []).map(function (e) {
        return { base_stat: e.base_stat, stat: { name: e.stat && e.stat.name } };
      }),
      types: (doc.types || []).map(function (e) {
        return { slot: e.slot, type: { name: e.type && e.type.name } };
      }),
      abilities: (doc.abilities || []).map(function (a) {
        return { is_hidden: a.is_hidden, slot: a.slot,
                 ability: { name: a.ability && a.ability.name } };
      }),
      sprites: {
        front_default: s.front_default || null,
        other: {
          'official-artwork': {
            front_default: (autres['official-artwork'] || {}).front_default || null
          },
          home: { front_default: (autres.home || {}).front_default || null }
        }
      },
      moves: (doc.moves || []).map(function (m) {
        return {
          move: { name: m.move && m.move.name },
          version_group_details: (m.version_group_details || []).map(function (d) {
            return { version_group: { name: d.version_group && d.version_group.name } };
          })
        };
      })
    };
  }

  /* Une fiche d'espèce est surtout faite de textes d'encyclopédie, dans toutes
   * les langues et toutes les versions. On n'en garde que l'utile. */
  function compactSpecies(doc) {
    return {
      id: doc.id,
      name: doc.name,
      names: (doc.names || []).filter(function (n) {
        return n.language && (n.language.name === 'fr' || n.language.name === 'en');
      }),
      varieties: (doc.varieties || []).map(function (v) {
        return { is_default: v.is_default, pokemon: { name: v.pokemon && v.pokemon.name } };
      }),
      evolution_chain: doc.evolution_chain || null,
      is_legendary: !!doc.is_legendary,
      is_mythical: !!doc.is_mythical
    };
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
    var shrink = (opts && opts.shrink) || null;

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
        if (persist) storageSet(url, shrink ? shrink(data) : data);
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
    return getJSON(BASE + '/pokemon/' + toSlug(slug),
      { persist: true, shrink: compactPokemon });
  }

  /** Données d'espèce : noms localisés, chaîne d'évolution, statut légendaire. */
  function getSpecies(slug) {
    return getJSON(BASE + '/pokemon-species/' + toSlug(slug),
      { persist: true, shrink: compactSpecies });
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
    purgeCache: purge,
    /* Exposés pour les tests : ce sont eux qui décident de ce qui atterrit
     * sur le disque de l'utilisateur. */
    _compactPokemon: compactPokemon,
    _compactSpecies: compactSpecies,
    MAX_ENTRY_BYTES: MAX_ENTRY_BYTES,
    getSpecies: getSpecies,
    getEvolutionChain: getEvolutionChain,
    getPokemonForm: getPokemonForm,
    getType: getType,
    getAllSpeciesNames: getAllSpeciesNames,
    clearCache: clearCache,
    ApiError: ApiError
  };
})(typeof window !== 'undefined' ? window : globalThis);
