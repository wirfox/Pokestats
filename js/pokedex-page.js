/*
 * js/pokedex-page.js — Pokédex du jeu sélectionné.
 * ================================================
 *
 * Affiche les espèces présentes dans le jeu choisi, avec les statistiques et
 * les types DE CE JEU. Les valeurs viennent de data/gen/gen{N}.js, pas de
 * PokéAPI : Ectoplasma doit afficher 555 de total à un joueur de 1G, pas 500.
 *
 * PokéAPI n'est sollicité que pour deux choses : les images, et la fiche
 * détaillée ouverte au clic (évolutions, talents).
 */
(function (root, document) {
  'use strict';

  var PokeStats = root.PokeStats;
  var game = PokeStats.game;
  var types = PokeStats.types;
  var analysis = PokeStats.analysis;
  var ui = PokeStats.ui;
  var dex = PokeStats.dex;
  var names = PokeStats.names;

  /* Le rendu se fait par tranches : afficher 1264 vignettes d'un coup fige
   * la page sur mobile. */
  var PAGE_SIZE = 60;

  var entries = [];          // toutes les entrées du jeu courant
  var filtered = [];
  var shown = 0;
  var filters = { text: '', types: [], sort: 'dex' };

  function $(id) { return document.getElementById(id); }

  function escapeHtml(v) { return ui.escapeHtml(v); }

  /* ------------------------------------------------------------------ */
  /* Construction des entrées                                            */
  /* ------------------------------------------------------------------ */

  /** Nom français d'une espèce, depuis l'index embarqué. */
  var frBySlug = null;
  function frenchName(slug) {
    if (!frBySlug) {
      frBySlug = Object.create(null);
      var seed = (root.POKESTATS_NAMES_FR && root.POKESTATS_NAMES_FR.seed) || {};
      Object.keys(seed).forEach(function (label) { frBySlug[seed[label]] = label; });
    }
    return frBySlug[slug] || slug;
  }

  /**
   * Nom à afficher, forme comprise : « Lougaroc Forme Crépusculaire » plutôt
   * que l'identifiant brut « lycanroc-dusk », qu'aucun joueur ne reconnaît.
   */
  function nomAffichable(slug) {
    var forms = PokeStats.forms;
    if (forms && forms.speciesOf(slug)) return forms.displayName(slug);
    return frenchName(slug);
  }

  /**
   * Assemble la liste à afficher : les espèces du pokédex du jeu, croisées
   * avec les données de sa génération.
   */
  function buildEntries() {
    var data = game.genData();
    if (!data) return [];
    var ordre = game.dexSpecies();
    var forms = PokeStats.forms;

    var liste = [];
    ordre.forEach(function (slug, index) {
      /* Une espèce à formes multiples occupe autant d'entrées que de formes :
       * Lougaroc Diurne, Nocturne et Crépusculaire n'ont ni les mêmes
       * statistiques ni le même tier, les fondre en une seule vignette
       * afficherait des chiffres faux pour deux d'entre elles. */
      var variantes = forms ? forms.optionsFor(slug) : [];
      if (!variantes.length) variantes = [{ slug: slug, label: null, id: null }];

      variantes.forEach(function (variante) {
        var s = data.species[variante.slug] || data.species[slug];
        if (!s) return;   // présente au pokédex mais absente des données
        var nom = frenchName(slug);
        liste.push({
          slug: variante.slug,
          species: slug,
          frName: variante.label ? names.formLabel(nom, variante.label) : nom,
          formLabel: variante.label,
          artId: variante.id || s.n,
          dexIndex: index,
          num: s.n,
          stats: s.s,
          bst: s.s.reduce(function (a, b) { return a + b; }, 0),
          types: s.t,
          tier: s.r,
          moves: s.m
        });
      });
    });
    return liste;
  }

  /* ------------------------------------------------------------------ */
  /* Filtres                                                             */
  /* ------------------------------------------------------------------ */

  var TIER_ORDER = { SS: 0, S: 1, A: 2, B: 3, C: 4, D: 5 };

  function applyFilters() {
    var texte = names.normalize(filters.text);

    filtered = entries.filter(function (e) {
      if (texte && names.normalize(e.frName).indexOf(texte) === -1 &&
          names.normalize(e.slug).indexOf(texte) === -1) return false;
      /* Filtre par type : le Pokémon doit porter TOUS les types cochés —
       * c'est ainsi qu'on cherche un « Dragon/Sol » précis. */
      if (filters.types.length &&
          !filters.types.every(function (t) { return e.types.indexOf(t) !== -1; })) return false;
      return true;
    });

    filtered.sort(function (a, b) {
      if (filters.sort === 'name') return a.frName.localeCompare(b.frName, 'fr');
      if (filters.sort === 'bst') return b.bst - a.bst;
      if (filters.sort === 'tier') {
        var ta = a.tier ? TIER_ORDER[a.tier] : 9;
        var tb = b.tier ? TIER_ORDER[b.tier] : 9;
        return ta - tb || b.bst - a.bst;
      }
      return a.dexIndex - b.dexIndex;
    });

    shown = 0;
    $('dex-grid').innerHTML = '';
    renderMore();
    updateCount();
  }

  function updateCount() {
    var jeu = game.current();

    /* Une espèce à formes multiples occupe plusieurs vignettes : sans cette
     * précision, le total paraîtrait en contradiction avec le nombre d'espèces
     * annoncé par le sélecteur de jeu. */
    var especes = Object.create(null);
    filtered.forEach(function (e) { especes[e.species] = true; });
    var nbEspeces = Object.keys(especes).length;

    $('dex-count').textContent =
      filtered.length + ' Pokémon' +
      (filtered.length === entries.length ? '' : ' sur ' + entries.length) +
      (filtered.length > nbEspeces ? ' (' + nbEspeces + ' espèces, formes comprises)' : '') +
      (jeu ? ' — ' + jeu.label : '');
    $('dex-empty').hidden = filtered.length !== 0;
  }

  /* ------------------------------------------------------------------ */
  /* Rendu de la grille                                                  */
  /* ------------------------------------------------------------------ */

  /** Image officielle, déduite du numéro national — aucun appel API requis. */
  function artworkUrl(num) {
    return 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/' +
      'pokemon/other/official-artwork/' + num + '.png';
  }

  function cardHtml(e) {
    return '' +
      '<button type="button" class="dex-card" data-slug="' + escapeHtml(e.slug) + '">' +
        '<span class="dex-card-num">n°' + e.num + '</span>' +
        '<img class="dex-card-img" src="' + escapeHtml(artworkUrl(e.artId)) + '" ' +
          'alt="" loading="lazy" width="96" height="96" ' +
          'data-repli="' + escapeHtml(artworkUrl(e.num)) + '" ' +
          'onerror="if(this.src!==this.dataset.repli){this.src=this.dataset.repli;}' +
          'else{this.style.visibility=\'hidden\';}">' +
        '<span class="dex-card-name">' + escapeHtml(e.frName) + '</span>' +
        '<span class="dex-card-types">' + ui.typeChips(e.types) + '</span>' +
        '<span class="dex-card-foot">' +
          '<span class="dex-card-bst">BST ' + e.bst + '</span>' +
          (e.tier
            ? '<span class="tier-badge tier-' + escapeHtml(e.tier) + '">' + escapeHtml(e.tier) + '</span>'
            : '<span class="tier-badge tier-unknown">—</span>') +
        '</span>' +
      '</button>';
  }

  function renderMore() {
    var lot = filtered.slice(shown, shown + PAGE_SIZE);
    if (lot.length) {
      $('dex-grid').insertAdjacentHTML('beforeend', lot.map(cardHtml).join(''));
      shown += lot.length;
    }
    $('btn-more').hidden = shown >= filtered.length;
    $('btn-more').textContent =
      'Afficher plus (' + (filtered.length - shown) + ' restants)';
  }

  /* ------------------------------------------------------------------ */
  /* Suggestions de saisie                                               */
  /* ------------------------------------------------------------------ */

  /*
   * Liste déroulante sous le champ de recherche.
   *
   * Elle est rattachée à <body>, pas au panneau : les panneaux portent un
   * `clip-path` qui découpe leurs coins, et il rognerait une liste positionnée
   * à l'intérieur. Même raison que pour le menu du sélecteur de jeu.
   *
   * Les propositions viennent de `entries`, déjà restreint au jeu choisi : on
   * ne propose jamais un Pokémon que le joueur ne peut pas rencontrer.
   */
  var MAX_SUGGESTIONS = 8;
  var boiteSuggestions = null;
  var suggestions = [];
  var indexActif = -1;

  function creerBoite() {
    boiteSuggestions = document.createElement('div');
    boiteSuggestions.className = 'suggest-box';
    boiteSuggestions.id = 'dex-suggest';
    boiteSuggestions.setAttribute('role', 'listbox');
    boiteSuggestions.hidden = true;
    document.body.appendChild(boiteSuggestions);

    boiteSuggestions.addEventListener('mousedown', function (event) {
      /* mousedown plutôt que click : le champ perdrait le focus avant que le
       * clic n'aboutisse, et la liste se refermerait sous le doigt. */
      var item = event.target.closest('[data-slug]');
      if (!item) return;
      event.preventDefault();
      choisir(item.dataset.slug);
    });
  }

  /** Positionne la liste sous le champ, sans jamais sortir de l'écran. */
  function placerBoite() {
    var champ = $('dex-search');
    var rect = champ.getBoundingClientRect();
    boiteSuggestions.style.left = Math.max(8, rect.left) + 'px';
    boiteSuggestions.style.top = (rect.bottom + 6) + 'px';
    boiteSuggestions.style.width = Math.min(rect.width, root.innerWidth - 16) + 'px';
    boiteSuggestions.style.maxHeight =
      Math.max(160, root.innerHeight - rect.bottom - 20) + 'px';
  }

  /**
   * Cherche parmi les Pokémon du jeu, par pertinence décroissante :
   *
   *   1. le NOM FRANÇAIS commence par la saisie      → Arcanin, Archéduc
   *   2. l'identifiant anglais commence par la saisie → Cryodo (arctibax)
   *   3. la saisie apparaît ailleurs dans l'un ou l'autre → Carchacrok (garchomp)
   *
   * L'ordre compte : en tapant « arc », on pense au nom qu'on lit à l'écran.
   * Voir Cryodo arriver avant Archéduc déroute, même si la correspondance est
   * réelle du côté anglais.
   */
  function chercher(saisie) {
    var cle = names.normalize(saisie);
    if (!cle) return [];
    var nomFr = [];
    var idAnglais = [];
    var ailleurs = [];

    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      var nom = names.normalize(e.frName);
      var slug = names.normalize(e.slug);
      if (nom.indexOf(cle) === 0) nomFr.push(e);
      else if (slug.indexOf(cle) === 0) idAnglais.push(e);
      else if (nom.indexOf(cle) !== -1 || slug.indexOf(cle) !== -1) ailleurs.push(e);
      /* On peut s'arrêter dès que les seuls noms français suffisent à remplir
       * la liste : les catégories suivantes ne seraient pas affichées. */
      if (nomFr.length >= MAX_SUGGESTIONS) break;
    }
    return nomFr.concat(idAnglais, ailleurs).slice(0, MAX_SUGGESTIONS);
  }

  function rendreSuggestions() {
    if (!suggestions.length) {
      boiteSuggestions.hidden = true;
      $('dex-search').setAttribute('aria-expanded', 'false');
      return;
    }
    boiteSuggestions.innerHTML = suggestions.map(function (e, i) {
      return '<button type="button" class="suggest-item' +
        (i === indexActif ? ' is-active' : '') + '" data-slug="' +
        escapeHtml(e.slug) + '" role="option" aria-selected="' + (i === indexActif) + '">' +
        '<img class="suggest-img" src="' + escapeHtml(artworkUrl(e.artId)) + '" alt="" ' +
          'loading="lazy" width="34" height="34" onerror="this.style.visibility=\'hidden\'">' +
        '<span class="suggest-text">' +
          '<span class="suggest-name">' + escapeHtml(e.frName) + '</span>' +
          '<span class="suggest-meta">n°' + e.num + ' · BST ' + e.bst + '</span>' +
        '</span>' +
        '<span class="suggest-types">' + ui.typeChips(e.types) + '</span>' +
      '</button>';
    }).join('');
    boiteSuggestions.hidden = false;
    placerBoite();
    $('dex-search').setAttribute('aria-expanded', 'true');
  }

  function fermerSuggestions() {
    suggestions = [];
    indexActif = -1;
    if (boiteSuggestions) boiteSuggestions.hidden = true;
    $('dex-search').setAttribute('aria-expanded', 'false');
  }

  /** Sélectionne un Pokémon proposé : on ouvre directement sa fiche. */
  function choisir(slug) {
    var e = entries.filter(function (x) { return x.slug === slug; })[0];
    if (e) {
      $('dex-search').value = e.frName;
      filters.text = e.frName;
      applyFilters();
    }
    fermerSuggestions();
    openDetail(slug);
  }

  function naviguer(delta) {
    if (!suggestions.length) return;
    indexActif = (indexActif + delta + suggestions.length) % suggestions.length;
    rendreSuggestions();
    var actif = boiteSuggestions.querySelector('.is-active');
    if (actif && actif.scrollIntoView) actif.scrollIntoView({ block: 'nearest' });
  }

  /* ------------------------------------------------------------------ */
  /* Équipe du joueur                                                    */
  /* ------------------------------------------------------------------ */

  /*
   * Les emplacements d'équipe ne stockent que le texte saisi. Pour connaître
   * les types de chaque membre, on le résout via l'index des noms puis on lit
   * les données de la génération — aucun appel réseau, donc un affichage
   * instantané même hors ligne.
   */
  function equipeCourante() {
    var teams = PokeStats.teams;
    var data = game.genData();
    if (!teams || !data || !data.species) return { membres: [], nom: null };

    var equipe = teams.active();
    if (!equipe) return { membres: [], nom: null };

    var membres = [];
    equipe.slots.forEach(function (saisie) {
      if (!saisie) return;
      var slug = names.toCandidateSlug(saisie).slug;
      var s = data.species[slug];
      if (!s) return;   // Pokémon absent de ce jeu : on ne peut rien en dire
      membres.push({
        slug: slug,
        frName: nomAffichable(slug),
        types: s.t,
        bst: s.s.reduce(function (a, b) { return a + b; }, 0),
        tier: s.r
      });
    });
    return { membres: membres, nom: equipe.name };
  }

  /* ------------------------------------------------------------------ */
  /* Fiche détaillée                                                     */
  /* ------------------------------------------------------------------ */

  function openDetail(slug) {
    var modal = $('dex-modal');
    var body = $('dex-modal-body');
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    body.innerHTML = '<p class="dex-loading">Chargement de la fiche…</p>';

    var equipe = equipeCourante();

    dex.load(slug).then(
      function (record) {
        var evo = analysis.evaluateEvolution(record);
        body.innerHTML =
          '<div class="dex-detail">' +
            ui.monCard(record, { showStats: true, showAbilities: true }) +
            ui.formPickerHtml(record) +
            (record.existsInGame === false
              ? '<p class="dex-warning">Ce Pokémon n’apparaît pas dans le jeu sélectionné.</p>'
              : '') +
            '<div class="dex-detail-mu">' +
              ui.matchupsHtml(record.types) +
            '</div>' +
            '<div class="dex-detail-counter">' +
              ui.counterHtml(record, equipe.membres, { teamName: equipe.nom }) +
            '</div>' +
            '<div class="dex-detail-evo">' +
              ui.evolutionHtml(record, evo) +
            '</div>' +
          '</div>';
        ui.wireFormPicker(body, function (formSlug) { openDetail(formSlug); });
      },
      function (err) {
        body.innerHTML = '<p class="dex-warning">Fiche indisponible : ' +
          escapeHtml(err && err.message ? err.message : 'erreur inconnue') + '</p>';
      }
    );
  }

  function closeDetail() {
    $('dex-modal').hidden = true;
    document.body.style.overflow = '';
  }

  /* ------------------------------------------------------------------ */
  /* Filtres de type                                                     */
  /* ------------------------------------------------------------------ */

  function renderTypeFilter() {
    $('dex-types').innerHTML = types.allTypes().map(function (t) {
      var actif = filters.types.indexOf(t) !== -1;
      return '<button type="button" class="type-chip type-' + escapeHtml(t) +
        ' type-button' + (actif ? ' is-selected' : '') + '" data-type="' +
        escapeHtml(t) + '" aria-pressed="' + actif + '">' +
        (types.iconOf(t)
          ? '<img class="type-icon" src="' + escapeHtml(types.iconOf(t)) +
            '" alt="" width="16" height="16" onerror="this.remove()">'
          : '') +
        escapeHtml(types.frType(t)) + '</button>';
    }).join('');
  }

  /* ------------------------------------------------------------------ */
  /* Démarrage                                                           */
  /* ------------------------------------------------------------------ */

  function setStatus(text, state) {
    $('data-status-text').textContent = text;
    $('data-status').classList.toggle('is-ready', state === 'ready');
    $('data-status').classList.toggle('is-error', state === 'error');
  }

  function refresh() {
    entries = buildEntries();
    renderTypeFilter();
    applyFilters();
    var jeu = game.current();
    var data = game.genData();
    setStatus(
      (jeu ? jeu.label : '') + ' · génération ' + (data ? data.meta.generation : '?') +
      ' · ' + entries.length + ' Pokémon · ' +
      (data ? data.types.length : '?') + ' types',
      'ready'
    );
  }

  function init() {
    if (PokeStats.gamebar) PokeStats.gamebar.mount($('game-bar'));
    names.init({ buildFullIndex: false });

    creerBoite();
    var champ = $('dex-search');
    champ.setAttribute('role', 'combobox');
    champ.setAttribute('aria-autocomplete', 'list');
    champ.setAttribute('aria-controls', 'dex-suggest');
    champ.setAttribute('aria-expanded', 'false');

    champ.addEventListener('input', function (e) {
      filters.text = e.target.value;
      applyFilters();
      suggestions = chercher(e.target.value);
      indexActif = -1;
      rendreSuggestions();
    });

    champ.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowDown') { event.preventDefault(); naviguer(1); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); naviguer(-1); }
      else if (event.key === 'Enter') {
        if (indexActif >= 0 && suggestions[indexActif]) {
          event.preventDefault();
          choisir(suggestions[indexActif].slug);
        } else if (suggestions.length === 1) {
          event.preventDefault();
          choisir(suggestions[0].slug);
        }
      } else if (event.key === 'Escape') {
        fermerSuggestions();
      }
    });

    champ.addEventListener('focus', function () {
      if (champ.value) { suggestions = chercher(champ.value); rendreSuggestions(); }
    });
    champ.addEventListener('blur', function () {
      /* Léger délai : sans lui, le clic sur une proposition n'aboutirait pas. */
      setTimeout(fermerSuggestions, 120);
    });
    root.addEventListener('resize', function () {
      if (boiteSuggestions && !boiteSuggestions.hidden) placerBoite();
    });
    root.addEventListener('scroll', function () {
      if (boiteSuggestions && !boiteSuggestions.hidden) placerBoite();
    }, true);
    $('dex-sort').addEventListener('change', function (e) {
      filters.sort = e.target.value;
      applyFilters();
    });
    $('dex-types').addEventListener('click', function (event) {
      var btn = event.target.closest('[data-type]');
      if (!btn) return;
      var t = btn.dataset.type;
      var i = filters.types.indexOf(t);
      if (i === -1) filters.types.push(t); else filters.types.splice(i, 1);
      renderTypeFilter();
      applyFilters();
    });
    $('btn-clear-filters').addEventListener('click', function () {
      filters = { text: '', types: [], sort: filters.sort };
      $('dex-search').value = '';
      fermerSuggestions();
      renderTypeFilter();
      applyFilters();
    });
    $('btn-more').addEventListener('click', renderMore);

    $('dex-grid').addEventListener('click', function (event) {
      var card = event.target.closest('[data-slug]');
      if (card) openDetail(card.dataset.slug);
    });
    $('dex-modal').addEventListener('click', function (event) {
      if (event.target.hasAttribute('data-close')) closeDetail();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !$('dex-modal').hidden) closeDetail();
    });

    game.init().then(
      function (jeu) {
        /* L'équipe est rattachée à un jeu : on l'initialise après lui. */
        if (PokeStats.teams) PokeStats.teams.init(jeu.id);
        game.onChange(function () {
          if (types.reset) types.reset();
          types.load().then(refresh);
        });
        return types.load();
      }
    ).then(refresh, function (err) {
      setStatus('Données indisponibles.', 'error');
      $('global-error').hidden = false;
      $('global-error').innerHTML = '<strong>Impossible de charger le Pokédex.</strong> ' +
        escapeHtml(err && err.message ? err.message : '');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window, document);
