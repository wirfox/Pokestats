/*
 * js/forms.js — Formes multiples d'une même espèce.
 * =================================================
 *
 * Lougaroc n'est pas un Pokémon, c'en est trois : Diurne (115 Att / 112 Vit),
 * Nocturne (115 / 82) et Crépusculaire (117 / 110). Elles n'ont ni le même
 * tier ni le même profil de rôle. Analyser « Lougaroc » sans savoir laquelle
 * le joueur possède reviendrait à deviner.
 *
 * Ce module ne décide rien : il dit seulement quelles formes existent pour une
 * espèce DANS LE JEU CHOISI, comment elles s'appellent en français, et
 * laquelle correspond à une fiche déjà chargée.
 *
 * Les libellés viennent de data/forms.js, généré depuis PokéAPI. Aucune
 * traduction maison.
 */
(function (root) {
  'use strict';

  var PokeStats = (root.PokeStats = root.PokeStats || {});

  function table() {
    return root.POKESTATS_FORMS || { species: {}, bySlug: {} };
  }

  /** Espèce à laquelle appartient un identifiant de forme, ou `null`. */
  function speciesOf(slug) {
    var t = table();
    if (!slug) return null;
    if (t.species[slug]) return slug;
    return t.bySlug[slug] || null;
  }

  /**
   * Formes proposables pour une espèce, dans le jeu sélectionné.
   *
   * Une forme n'est retenue que si la génération du jeu la connaît : proposer
   * un Tauros de Paldéa à un joueur de Rouge Feu serait une erreur factuelle.
   * Si moins de deux formes subsistent, il n'y a pas de choix à faire et la
   * liste renvoyée est vide — l'interface n'affiche alors aucun sélecteur.
   *
   * @returns {Array<{slug: string, label: string, id: number}>}
   */
  function optionsFor(slug) {
    var species = speciesOf(slug);
    if (!species) return [];
    var liste = table().species[species] || [];

    var gameState = PokeStats.game;
    var data = gameState && gameState.genData && gameState.genData();
    var generation = data && data.generation;

    var retenues = liste.filter(function (f) {
      if (!generation) return true;                       // aucun jeu choisi
      if (f.g.indexOf(generation) === -1) return false;
      /* Double vérification contre les données de jeu elles-mêmes : c'est
       * elles qui font foi pour les statistiques affichées. */
      return !data.species || !!data.species[f.s] || f.s === species;
    });

    if (retenues.length < 2) return [];
    return retenues.map(function (f) {
      return { slug: f.s, label: f.l, id: f.i };
    });
  }

  /**
   * Identifiant de forme correspondant à une fiche chargée.
   *
   * PokéAPI nomme la forme par défaut de Lougaroc « lycanroc-midday », alors
   * que les données de jeu la nomment « lycanroc ». On retombe donc sur
   * l'identifiant d'espèce quand la forme exacte n'est pas répertoriée.
   */
  function currentSlug(record) {
    if (!record) return null;
    var t = table();
    if (t.bySlug[record.slug]) return record.slug;
    if (t.species[record.speciesSlug]) return record.speciesSlug;
    return null;
  }

  /** Libellé français d'une forme, ou `null` si elle n'en a pas. */
  function labelOf(slug) {
    var species = speciesOf(slug);
    if (!species) return null;
    var found = (table().species[species] || []).filter(function (f) {
      return f.s === slug;
    })[0];
    return found ? found.label || found.l : null;
  }

  /**
   * Texte à écrire dans un champ de saisie pour désigner cette forme
   * précisément — c'est exactement le libellé indexé par js/names.js, donc il
   * se résout sans ambiguïté.
   */
  function displayName(slug) {
    var species = speciesOf(slug);
    var names = PokeStats.names;
    if (!species || !names) return slug;
    var fr = names.frOf(species) || species;
    var label = labelOf(slug);
    return label ? names.formLabel(fr, label) : fr;
  }

  PokeStats.forms = {
    displayName: displayName,
    speciesOf: speciesOf,
    optionsFor: optionsFor,
    currentSlug: currentSlug,
    labelOf: labelOf,
    meta: function () { return table().meta || null; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
