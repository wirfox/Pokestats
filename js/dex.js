/*
 * js/dex.js — Construction d'une « fiche Pokémon » normalisée.
 * ============================================================
 *
 * Assemble, à partir de PokéAPI uniquement :
 *   - la forme de combat (stats de base, types, talents, sprites) ;
 *   - l'espèce (nom français officiel, statut légendaire) ;
 *   - la chaîne d'évolution, y compris les formes alternatives jouables
 *     (ex : Lougaroc Diurne / Nocturne / Crépusculaire).
 *
 * Toute la suite de l'application (analyse, affichage) ne travaille que sur
 * cette fiche : elle ne rappelle jamais l'API directement.
 */
(function (root) {
  'use strict';

  var PokeStats = (root.PokeStats = root.PokeStats || {});
  var api = PokeStats.api;
  var names = PokeStats.names;

  var STAT_KEYS = ['hp', 'attack', 'defense', 'special-attack', 'special-defense', 'speed'];

  var STAT_FR = {
    hp: 'PV',
    attack: 'Attaque',
    defense: 'Défense',
    'special-attack': 'Att. Spé.',
    'special-defense': 'Déf. Spé.',
    speed: 'Vitesse'
  };

  /* Formes non obtenables en jeu (Méga-Évolutions, Dynamax, formes de raid) :
   * les inclure fausserait l'analyse pour un joueur d'Écarlate / Violet. */
  var UNPLAYABLE_FORM = /-(mega|mega-x|mega-y|gmax|totem|primal|starter|eternamax)$/;

  function localizedName(entries, iso, fallback) {
    var found = (entries || []).filter(function (n) {
      return n.language && n.language.name === iso;
    })[0];
    return (found && found.name) || fallback;
  }

  function statsFrom(pokemonDoc) {
    var out = Object.create(null);
    STAT_KEYS.forEach(function (k) { out[k] = 0; });
    (pokemonDoc.stats || []).forEach(function (entry) {
      var key = entry.stat && entry.stat.name;
      if (key in out) out[key] = entry.base_stat;
    });
    return out;
  }

  function bstOf(stats) {
    return STAT_KEYS.reduce(function (sum, k) { return sum + (stats[k] || 0); }, 0);
  }

  function spriteFrom(pokemonDoc) {
    var s = pokemonDoc.sprites || {};
    var official =
      s.other &&
      s.other['official-artwork'] &&
      s.other['official-artwork'].front_default;
    var home = s.other && s.other.home && s.other.home.front_default;
    return official || home || s.front_default || null;
  }

  /**
   * Récupère la forme de combat correspondant à un identifiant.
   * Si l'identifiant désigne une espèce sans forme du même nom
   * (ex : "deoxys"), on retombe sur sa variété par défaut.
   */
  function fetchBattleForm(slug) {
    return api.getPokemon(slug).catch(function (err) {
      if (!err || err.kind !== 'not-found') throw err;
      return api.getSpecies(slug).then(function (species) {
        var def = (species.varieties || []).filter(function (v) { return v.is_default; })[0] ||
                  (species.varieties || [])[0];
        if (!def) throw err;
        return api.getPokemon(def.pokemon.name);
      });
    });
  }

  /** Fiche minimale d'une forme : ce qu'il faut pour comparer et afficher. */
  function buildForm(pokemonDoc, speciesDoc) {
    var stats = statsFrom(pokemonDoc);
    return {
      id: pokemonDoc.id,
      slug: pokemonDoc.name,
      speciesSlug: speciesDoc ? speciesDoc.name : (pokemonDoc.species && pokemonDoc.species.name),
      frName: speciesDoc
        ? localizedName(speciesDoc.names, 'fr', pokemonDoc.name)
        : pokemonDoc.name,
      enName: speciesDoc
        ? localizedName(speciesDoc.names, 'en', pokemonDoc.name)
        : pokemonDoc.name,
      /* Suffixe de forme (ex : "midday") pour distinguer Lougaroc Diurne. */
      formSuffix: (function () {
        var sp = speciesDoc ? speciesDoc.name : '';
        return sp && pokemonDoc.name.indexOf(sp + '-') === 0
          ? pokemonDoc.name.slice(sp.length + 1)
          : '';
      })(),
      types: (pokemonDoc.types || [])
        .sort(function (a, b) { return a.slot - b.slot; })
        .map(function (t) { return t.type.name; }),
      stats: stats,
      bst: bstOf(stats),
      abilities: (pokemonDoc.abilities || []).map(function (a) {
        return { slug: a.ability.name, hidden: !!a.is_hidden, slot: a.slot };
      }),
      sprite: spriteFrom(pokemonDoc),
      isLegendary: speciesDoc ? !!speciesDoc.is_legendary : false,
      isMythical: speciesDoc ? !!speciesDoc.is_mythical : false
    };
  }

  /* ------------------------------------------------------------------ */
  /* Chaîne d'évolution                                                  */
  /* ------------------------------------------------------------------ */

  function findChainNode(node, speciesSlug) {
    if (!node) return null;
    if (node.species && node.species.name === speciesSlug) return node;
    var children = node.evolves_to || [];
    for (var i = 0; i < children.length; i++) {
      var hit = findChainNode(children[i], speciesSlug);
      if (hit) return hit;
    }
    return null;
  }

  /** Aplatit la chaîne complète en étapes numérotées, pour l'affichage. */
  function flattenChain(node, depth, acc) {
    if (!node) return acc;
    acc.push({ speciesSlug: node.species.name, depth: depth, details: node.evolution_details || [] });
    (node.evolves_to || []).forEach(function (child) {
      flattenChain(child, depth + 1, acc);
    });
    return acc;
  }

  /** Descendants directs et indirects d'un nœud de la chaîne. */
  function collectDescendants(node, acc, depth) {
    (node.evolves_to || []).forEach(function (child) {
      acc.push({
        speciesSlug: child.species.name,
        details: child.evolution_details || [],
        depth: depth,
        /* Forme terminale = plus rien après elle dans la chaîne. C'est elle qui
         * représente le vrai potentiel du Pokémon : Griknot doit être jugé sur
         * Carchacrok, pas sur Carmache. */
        isTerminal: (child.evolves_to || []).length === 0
      });
      collectDescendants(child, acc, depth + 1);
    });
    return acc;
  }

  /**
   * Une condition d'évolution correspond-elle à une forme précise ?
   *
   * PokéAPI attache les conditions d'évolution à l'ESPÈCE, pas à la forme :
   * la chaîne de Rocabot porte les trois conditions de Lougaroc (jour, nuit,
   * crépuscule) sur un unique nœud. Les afficher toutes sur chaque forme est
   * trompeur — Lougaroc Diurne n'apparaît pas la nuit.
   *
   * On rapproche donc chaque condition de la forme qu'elle produit, à partir
   * des seuls champs qui les distinguent (moment de la journée, genre). En cas
   * d'ambiguïté, on retombe sur l'affichage de toutes les conditions : mieux
   * vaut trop d'information qu'une information fausse.
   */
  function detailMatchesForm(detail, formSuffix) {
    var suffix = String(formSuffix || '').toLowerCase();
    if (!suffix) return false;

    var tod = detail.time_of_day;
    if (tod) {
      /* « midnight » contient « night », « midday » contient « day » : on teste
       * du plus spécifique au moins spécifique pour éviter les faux positifs. */
      if (tod === 'dusk') return suffix.indexOf('dusk') !== -1;
      if (tod === 'night') return suffix.indexOf('night') !== -1;
      if (tod === 'day') {
        return suffix.indexOf('day') !== -1 && suffix.indexOf('night') === -1;
      }
    }
    if (detail.gender === 1) return suffix.indexOf('female') !== -1;
    if (detail.gender === 2) {
      return suffix.indexOf('male') !== -1 && suffix.indexOf('female') === -1;
    }
    return false;
  }

  /**
   * Conditions à afficher pour une forme donnée.
   * @returns {Array} le sous-ensemble pertinent, ou tout si indécidable
   */
  function detailsForForm(details, formSuffix) {
    if (!details || details.length <= 1) return details || [];
    var matching = details.filter(function (d) {
      return detailMatchesForm(d, formSuffix);
    });
    return matching.length === 1 ? matching : details;
  }

  /** Traduit en français la condition d'évolution renvoyée par PokéAPI. */
  function conditionToFrench(details) {
    if (!details || !details.length) return 'Condition inconnue';
    return details
      .map(function (d) {
        var parts = [];
        var trigger = d.trigger && d.trigger.name;

        if (d.min_level) parts.push('niveau ' + d.min_level);
        else if (trigger === 'level-up') parts.push('montée de niveau');

        if (trigger === 'use-item' && d.item) parts.push('utiliser ' + d.item.name.replace(/-/g, ' '));
        if (trigger === 'trade') parts.push('échange');
        if (d.held_item) parts.push('en tenant ' + d.held_item.name.replace(/-/g, ' '));
        if (d.time_of_day) {
          parts.push(d.time_of_day === 'day' ? 'le jour'
            : d.time_of_day === 'night' ? 'la nuit'
            : d.time_of_day === 'dusk' ? 'au crépuscule (17 h–17 h 59)'
            : d.time_of_day);
        }
        if (d.min_happiness) parts.push('bonheur ≥ ' + d.min_happiness);
        if (d.min_affection) parts.push('affection ≥ ' + d.min_affection);
        if (d.known_move) parts.push('connaît ' + d.known_move.name.replace(/-/g, ' '));
        if (d.known_move_type) parts.push('connaît une capacité ' + d.known_move_type.name);
        if (d.location) parts.push('à ' + d.location.name.replace(/-/g, ' '));
        if (d.needs_overworld_rain) parts.push('sous la pluie');
        if (d.gender === 1) parts.push('femelle');
        if (d.gender === 2) parts.push('mâle');
        if (d.relative_physical_stats === 1) parts.push('Attaque > Défense');
        if (d.relative_physical_stats === -1) parts.push('Attaque < Défense');
        if (d.relative_physical_stats === 0) parts.push('Attaque = Défense');

        return parts.length ? parts.join(', ') : (trigger || 'condition spéciale');
      })
      .join(' ou ');
  }

  /**
   * Nom de forme localisé (« Diurne », « Crépusculaire »…).
   * Récupéré auprès de PokéAPI plutôt que traduit à la main : c'est la seule
   * façon d'être sûr du libellé officiel français.
   */
  function attachFormName(record) {
    if (!record.formSuffix) return Promise.resolve(record);

    return api.getPokemonForm(record.slug).then(
      function (formDoc) {
        var fromFormNames = localizedName(formDoc.form_names, 'fr', null);
        var fromNames = localizedName(formDoc.names, 'fr', null);
        record.frFormName = fromFormNames || fromNames || null;
        return record;
      },
      function () {
        /* Sans réponse, l'affichage retombe sur le suffixe brut. */
        return record;
      }
    );
  }

  /** Formes de combat jouables d'une espèce. */
  function formsOfSpecies(speciesDoc) {
    var varieties = (speciesDoc.varieties || [])
      .map(function (v) { return v.pokemon.name; })
      .filter(function (slug) { return !UNPLAYABLE_FORM.test(slug); });

    /* Garde-fou : certaines espèces (Motisma, Pikachu…) ont beaucoup de formes.
     * On en limite le nombre pour ne pas saturer PokéAPI de requêtes. */
    varieties = varieties.slice(0, 8);

    return Promise.all(
      varieties.map(function (slug) {
        return api.getPokemon(slug)
          .then(function (doc) { return buildForm(doc, speciesDoc); })
          .then(attachFormName);
      })
    );
  }

  /**
   * Complète les étapes de la chaîne d'évolution avec leur nom français.
   * Les identifiants bruts ("rockruff") ne doivent jamais être montrés tels
   * quels à un utilisateur francophone.
   */
  function attachStageNames(stages) {
    return Promise.all(
      stages.map(function (stage) {
        return api.getSpecies(stage.speciesSlug).then(
          function (speciesDoc) {
            stage.frName = localizedName(speciesDoc.names, 'fr', stage.speciesSlug);
            return stage;
          },
          function () {
            stage.frName = stage.speciesSlug;
            return stage;
          }
        );
      })
    );
  }

  /**
   * Charge une fiche complète à partir d'une saisie utilisateur.
   * @param {string} input nom français, anglais ou identifiant PokéAPI
   * @param {{withEvolutions?: boolean}} [opts]
   * @returns {Promise<Object>} fiche normalisée
   */
  function load(input, opts) {
    var wantEvolutions = !opts || opts.withEvolutions !== false;
    var candidate = names.toCandidateSlug(input);

    return fetchBattleForm(candidate.slug)
      .then(function (pokemonDoc) {
        return api.getSpecies(pokemonDoc.species.name).then(function (speciesDoc) {
          return { pokemonDoc: pokemonDoc, speciesDoc: speciesDoc };
        });
      })
      .then(function (pair) {
        var record = buildForm(pair.pokemonDoc, pair.speciesDoc);
        record.query = input;
        record.resolvedVia = candidate.via;

        /* Nom de forme localisé : on l'attend, sinon l'affichage montrerait
         * brièvement le suffixe brut de l'identifiant. */
        return attachFormName(record).then(function () {
          return { record: record, speciesDoc: pair.speciesDoc };
        });
      })
      .then(function (ctx) {
        var record = ctx.record;
        var speciesDoc = ctx.speciesDoc;

        if (!wantEvolutions || !speciesDoc.evolution_chain) {
          record.evolution = { canEvolve: false, stages: [], nextForms: [], loaded: false };
          return record;
        }

        return api
          .getEvolutionChain(speciesDoc.evolution_chain.url)
          .then(function (chainDoc) {
            var node = findChainNode(chainDoc.chain, speciesDoc.name);
            var descendants = node ? collectDescendants(node, [], 1) : [];
            var stages = flattenChain(chainDoc.chain, 0, []);

            record.evolution = {
              chainId: chainDoc.id,
              canEvolve: descendants.length > 0,
              stages: stages,
              nextForms: [],
              loaded: true
            };

            if (!descendants.length) {
              return attachStageNames(stages).then(function () { return record; });
            }

            /* Limite dure : une chaîne ne dépasse jamais raisonnablement
             * ce nombre de descendants (Évoli en compte 8). */
            var targets = descendants.slice(0, 12);

            return Promise.all(
              targets.map(function (desc) {
                return api.getSpecies(desc.speciesSlug).then(function (descSpecies) {
                  return formsOfSpecies(descSpecies).then(function (forms) {
                    return forms.map(function (f) {
                      /* Condition propre à CETTE forme quand on peut la
                       * distinguer (Lougaroc Diurne / Nocturne / Crépusculaire). */
                      f.evolutionCondition = conditionToFrench(
                        detailsForForm(desc.details, f.formSuffix)
                      );
                      f.evolutionDepth = desc.depth;
                      f.isTerminal = desc.isTerminal;
                      return f;
                    });
                  });
                });
              })
            )
              .then(function (groups) {
                record.evolution.nextForms = groups.reduce(function (acc, g) {
                  return acc.concat(g);
                }, []);
                return attachStageNames(stages);
              })
              .then(function () { return record; });
          })
          .catch(function () {
            /* La chaîne d'évolution est un bonus : son échec ne doit pas
             * empêcher l'affichage du Pokémon. L'analyse traitera l'évolution
             * comme « donnée indisponible » et restera donc prudente. */
            record.evolution = { canEvolve: false, stages: [], nextForms: [], loaded: false };
            return record;
          });
      });
  }

  PokeStats.dex = {
    load: load,
    STAT_KEYS: STAT_KEYS,
    STAT_FR: STAT_FR,
    bstOf: bstOf,
    conditionToFrench: conditionToFrench,
    detailsForForm: detailsForForm
  };
})(typeof window !== 'undefined' ? window : globalThis);
