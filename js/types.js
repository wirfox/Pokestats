/*
 * js/types.js — Table d'efficacité des types, construite depuis PokéAPI.
 * ======================================================================
 *
 * La table n'est PAS codée en dur : elle est reconstruite à partir des
 * relations de dégâts officielles exposées par PokéAPI (/type/{nom} →
 * damage_relations). C'est la garantie qu'elle correspond à la génération
 * courante et qu'aucune valeur n'a été saisie de mémoire.
 *
 * Les types non utilisables en combat classique ("unknown", "shadow") et le
 * type Stellar (mécanique de Téracristal, pas un type défensif standard) sont
 * exclus de l'analyse.
 */
(function (root) {
  'use strict';

  var PokeStats = (root.PokeStats = root.PokeStats || {});
  var api = PokeStats.api;

  var EXCLUDED = { unknown: true, shadow: true, stellar: true };

  var chart = null;      // chart[typeAttaquant][typeDefenseur] = multiplicateur
  var typeList = [];     // les 18 types de combat
  var iconList = {};     // type → URL de l'icône officielle (Écarlate / Violet)
  var loading = null;

  /** Traductions françaises des types (affichage uniquement). */
  var FR_TYPES = {
    normal: 'Normal', fighting: 'Combat', flying: 'Vol', poison: 'Poison',
    ground: 'Sol', rock: 'Roche', bug: 'Insecte', ghost: 'Spectre',
    steel: 'Acier', fire: 'Feu', water: 'Eau', grass: 'Plante',
    electric: 'Électrik', psychic: 'Psy', ice: 'Glace', dragon: 'Dragon',
    dark: 'Ténèbres', fairy: 'Fée'
  };

  function frType(name) {
    return FR_TYPES[name] || name;
  }

  /** Provenance de la table effectivement en usage. */
  var source = null;   // 'pokeapi' | 'repli-hors-ligne'

  /**
   * Repli hors ligne : table vérifiée, générée depuis @pkmn/dex
   * (voir data/type-chart.js). Sans elle, une panne de PokéAPI bloquerait
   * toute l'analyse de couverture ; avec elle, l'outil reste utilisable.
   */
  function loadFallback() {
    var table = root.POKESTATS_TYPE_CHART;
    if (!table || !table.chart || !table.types) return false;
    chart = table.chart;
    typeList = table.types.slice();
    if (table.icons) iconList = table.icons;
    source = 'repli-hors-ligne';
    return true;
  }

  /**
   * Charge la table d'efficacité. Idempotent : les appels suivants
   * réutilisent la même promesse.
   *
   * PokéAPI est la source prioritaire (toujours à jour). En cas d'échec, on
   * bascule sur le repli embarqué plutôt que de renoncer à analyser.
   *
   * @returns {Promise<{chart: Object, types: string[], source: string}>}
   */
  function load() {
    if (chart) return Promise.resolve({ chart: chart, types: typeList, source: source });
    if (loading) return loading;

    loading = api
      .getJSON(api.BASE + '/type?limit=100', { persist: true })
      .then(function (list) {
        var names = (list.results || [])
          .map(function (r) { return r.name; })
          .filter(function (n) { return !EXCLUDED[n]; });

        return Promise.all(names.map(function (n) { return api.getType(n); }));
      })
      .then(function (typeDocs) {
        var built = Object.create(null);
        var names = typeDocs.map(function (d) { return d.name; });

        /* Base neutre : tout à 1×. */
        names.forEach(function (attacker) {
          built[attacker] = Object.create(null);
          names.forEach(function (defender) { built[attacker][defender] = 1; });
        });

        /* Icônes officielles Écarlate / Violet. On prend `symbol_icon`
         * (le glyphe seul) et non `name_icon`, qui contient le nom du type
         * écrit en anglais. */
        typeDocs.forEach(function (doc) {
          var sv = doc.sprites &&
            doc.sprites['generation-ix'] &&
            doc.sprites['generation-ix']['scarlet-violet'];
          if (sv && sv.symbol_icon) iconList[doc.name] = sv.symbol_icon;
        });

        /* Application des relations officielles. */
        typeDocs.forEach(function (doc) {
          var rel = doc.damage_relations || {};
          (rel.double_damage_to || []).forEach(function (t) {
            if (built[doc.name] && t.name in built[doc.name]) built[doc.name][t.name] = 2;
          });
          (rel.half_damage_to || []).forEach(function (t) {
            if (built[doc.name] && t.name in built[doc.name]) built[doc.name][t.name] = 0.5;
          });
          (rel.no_damage_to || []).forEach(function (t) {
            if (built[doc.name] && t.name in built[doc.name]) built[doc.name][t.name] = 0;
          });
        });

        chart = built;
        typeList = names;
        source = 'pokeapi';
        return { chart: chart, types: typeList, source: source };
      })
      .catch(function (err) {
        loading = null;   // permet une nouvelle tentative auprès de PokéAPI
        if (loadFallback()) {
          return { chart: chart, types: typeList, source: source, apiError: err };
        }
        throw err;
      });

    return loading;
  }

  function isLoaded() { return !!chart; }

  /**
   * Multiplicateur d'un type attaquant contre un Pokémon défenseur.
   * @param {string} attacking
   * @param {string[]} defendingTypes 1 ou 2 types
   * @returns {number} 0, 0.25, 0.5, 1, 2 ou 4
   */
  function effectiveness(attacking, defendingTypes) {
    if (!chart || !chart[attacking]) return 1;
    return (defendingTypes || []).reduce(function (acc, def) {
      var row = chart[attacking];
      return acc * (def in row ? row[def] : 1);
    }, 1);
  }

  /**
   * Profil défensif complet d'un Pokémon : pour chaque type attaquant,
   * le multiplicateur subi.
   * @returns {Object<string, number>}
   */
  function defensiveProfile(defendingTypes) {
    var out = Object.create(null);
    typeList.forEach(function (t) {
      out[t] = effectiveness(t, defendingTypes);
    });
    return out;
  }

  /** Types contre lesquels ce Pokémon est faible (×2 ou ×4). */
  function weaknesses(defendingTypes) {
    var profile = defensiveProfile(defendingTypes);
    return typeList.filter(function (t) { return profile[t] > 1; });
  }

  /** Types contre lesquels ce Pokémon résiste ou est immunisé (<1). */
  function resistances(defendingTypes) {
    var profile = defensiveProfile(defendingTypes);
    return typeList.filter(function (t) { return profile[t] < 1; });
  }

  PokeStats.types = {
    load: load,
    isLoaded: isLoaded,
    source: function () { return source; },
    effectiveness: effectiveness,
    defensiveProfile: defensiveProfile,
    weaknesses: weaknesses,
    resistances: resistances,
    frType: frType,
    /** URL de l'icône officielle d'un type, ou null si indisponible. */
    iconOf: function (name) { return iconList[name] || null; },
    allTypes: function () { return typeList.slice(); },
    /* Injection directe — utilisé uniquement par les tests hors navigateur. */
    _setChart: function (c, names) { chart = c; typeList = names; source = 'test'; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
