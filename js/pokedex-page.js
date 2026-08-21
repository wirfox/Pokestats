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
   * Assemble la liste à afficher : les espèces du pokédex du jeu, croisées
   * avec les données de sa génération.
   */
  function buildEntries() {
    var data = game.genData();
    if (!data) return [];
    var ordre = game.dexSpecies();

    return ordre.map(function (slug, index) {
      var s = data.species[slug];
      if (!s) return null;   // présente au pokédex mais absente des données
      return {
        slug: slug,
        frName: frenchName(slug),
        dexIndex: index,
        num: s.n,
        stats: s.s,
        bst: s.s.reduce(function (a, b) { return a + b; }, 0),
        types: s.t,
        tier: s.r,
        moves: s.m
      };
    }).filter(Boolean);
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
    $('dex-count').textContent =
      filtered.length + ' Pokémon' + (filtered.length === entries.length ? '' :
        ' sur ' + entries.length) + (jeu ? ' — ' + jeu.label : '');
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
        '<img class="dex-card-img" src="' + escapeHtml(artworkUrl(e.num)) + '" ' +
          'alt="" loading="lazy" width="96" height="96" onerror="this.style.visibility=\'hidden\'">' +
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
  /* Fiche détaillée                                                     */
  /* ------------------------------------------------------------------ */

  function openDetail(slug) {
    var modal = $('dex-modal');
    var body = $('dex-modal-body');
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    body.innerHTML = '<p class="dex-loading">Chargement de la fiche…</p>';

    dex.load(slug).then(
      function (record) {
        var evo = analysis.evaluateEvolution(record);
        body.innerHTML =
          '<div class="dex-detail">' +
            ui.monCard(record, { showStats: true, showAbilities: true }) +
            (record.existsInGame === false
              ? '<p class="dex-warning">Ce Pokémon n’apparaît pas dans le jeu sélectionné.</p>'
              : '') +
            '<div class="dex-detail-evo">' +
              ui.evolutionHtml(record, evo) +
            '</div>' +
          '</div>';
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

    $('dex-search').addEventListener('input', function (e) {
      filters.text = e.target.value;
      applyFilters();
    });
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
      function () {
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
