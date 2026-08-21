/*
 * js/typechart-page.js — Comparateur de types.
 * ============================================
 *
 * DEUX QUESTIONS DISTINCTES
 * -------------------------
 * « Contre quoi le Feu est-il fort ? » et « qu'est-ce qui met le Feu en
 * danger ? » n'ont pas la même réponse. Le Feu frappe la Plante ×2, mais subit
 * l'Eau ×2. Confondre les deux sens de lecture est l'erreur la plus fréquente
 * sur les tables d'efficacité, c'est pourquoi cette page les sépare
 * explicitement au lieu de tout mélanger dans une seule liste.
 *
 * La table provient de PokéAPI (/type/{nom} → damage_relations), avec repli sur
 * data/type-chart.js — exactement comme l'analyseur d'équipe.
 */
(function (root, document) {
  'use strict';

  var PokeStats = root.PokeStats;
  var types = PokeStats.types;

  var MAX_SELECTION = 2;   // un Pokémon ne porte jamais plus de deux types

  /** Types actuellement choisis, du plus ancien au plus récent. */
  var selection = [];

  function $(id) { return document.getElementById(id); }

  var elPicker = $('type-picker');
  var elSelection = $('selection');
  var elResults = $('results-panel');
  var elAttack = $('attack-groups');
  var elDefense = $('defense-groups');
  var elAttackSub = $('attack-sub');
  var elDefenseSub = $('defense-sub');
  var elGrid = $('type-grid');
  var elStatus = $('data-status');
  var elStatusText = $('data-status-text');
  var elGlobalError = $('global-error');
  var elMethod = $('method-body');

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** Multiplicateur en écriture lisible : 0,25 devient « ¼ ». */
  function formatMultiplier(value) {
    if (value === 0) return '×0';
    if (value === 0.25) return '×¼';
    if (value === 0.5) return '×½';
    if (value === 1) return '×1';
    return '×' + value;
  }

  function classForMultiplier(value) {
    if (value === 0) return 'cell-0';
    if (value === 0.25) return 'cell-025';
    if (value === 0.5) return 'cell-05';
    if (value === 1) return 'cell-1';
    if (value === 2) return 'cell-2';
    return 'cell-4';
  }


  /**
   * Icône officielle d'un type (jeu Écarlate / Violet), rendue à l'intérieur
   * de la pastille.
   *
   * L'image est décorative : le nom du type reste écrit à côté, donc `alt`
   * est vide et une image qui ne charge pas ne retire aucune information.
   * `onerror` la masque proprement plutôt que de laisser une icône cassée.
   */
  function typeIcon(name) {
    var url = types.iconOf && types.iconOf(name);
    if (!url) return '';
    return '<img class="type-icon" src="' + escapeHtml(url) + '" alt="" ' +
      'loading="lazy" width="16" height="16" ' +
      'onerror="this.remove()">';
  }

  function typeChip(name, extra) {
    return '<span class="type-chip type-' + escapeHtml(name) + (extra || '') + '">' +
      typeIcon(name) + escapeHtml(types.frType(name)) + '</span>';
  }

  /* ------------------------------------------------------------------ */
  /* Sélecteur                                                           */
  /* ------------------------------------------------------------------ */

  function renderPicker() {
    elPicker.innerHTML = types.allTypes().map(function (t) {
      var active = selection.indexOf(t) !== -1;
      return '<button type="button" class="type-chip type-' + escapeHtml(t) +
        ' type-button' + (active ? ' is-selected' : '') + '" data-type="' +
        escapeHtml(t) + '" aria-pressed="' + active + '">' +
        typeIcon(t) + escapeHtml(types.frType(t)) + '</button>';
    }).join('');
  }

  function toggleType(name) {
    var index = selection.indexOf(name);
    if (index !== -1) {
      selection.splice(index, 1);           // déjà choisi : on le retire
    } else {
      selection.push(name);
      /* Au-delà de deux types, on évince le plus ancien : le clic reste
       * toujours utile, sans jamais bloquer l'utilisateur. */
      if (selection.length > MAX_SELECTION) selection.shift();
    }
    render();
  }

  /* ------------------------------------------------------------------ */
  /* Calculs                                                             */
  /* ------------------------------------------------------------------ */

  /* Les calculs de profils et de regroupement vivent dans js/types.js : la
   * page du Pokédex les utilise aussi, et deux copies finiraient par diverger. */
  var offensiveProfile = types.offensiveProfile;
  var defensiveProfile = types.defensiveProfile;
  var groupByMultiplier = types.groupByMultiplier;

  /* ------------------------------------------------------------------ */
  /* Rendu des résultats                                                 */
  /* ------------------------------------------------------------------ */

  var ATTACK_LABEL = {
    4: 'Dégâts quadruplés', 2: 'Très efficace', 1: 'Dégâts normaux',
    0.5: 'Peu efficace', 0.25: 'Très peu efficace', 0: 'Aucun effet'
  };
  var DEFENSE_LABEL = {
    4: 'Faiblesse doublée — très dangereux', 2: 'Faiblesse',
    1: 'Dégâts normaux', 0.5: 'Résistance', 0.25: 'Double résistance',
    0: 'Immunité'
  };

  function renderGroups(container, profile, labels, sens) {
    var groups = groupByMultiplier(profile);
    container.innerHTML = groups.map(function (g) {
      /* Le neutre n'apprend rien : on le replie pour garder l'écran lisible. */
      var neutral = g.value === 1;
      return '' +
        '<div class="matchup-group' + (neutral ? ' is-neutral' : '') + '">' +
          '<div class="matchup-head">' +
            '<span class="matchup-mult ' + classForMultiplier(g.value) + '">' +
              formatMultiplier(g.value) + '</span>' +
            '<span class="matchup-label">' + escapeHtml(labels[g.value] || '') + '</span>' +
            '<span class="matchup-count">' + g.types.length + '</span>' +
          '</div>' +
          '<div class="type-row">' +
            g.types.map(function (t) { return typeChip(t); }).join('') +
          '</div>' +
        '</div>';
    }).join('') || '<p class="matchup-empty">Aucun type dans cette catégorie.</p>';
    container.dataset.sens = sens;
  }

  function renderSelection() {
    if (!selection.length) {
      elSelection.hidden = true;
      return;
    }
    elSelection.hidden = false;
    elSelection.innerHTML =
      '<span class="selection-label">Type analysé&nbsp;:</span> ' +
      selection.map(function (t) { return typeChip(t); }).join('<span class="selection-plus">+</span>');
  }

  function renderMethod() {
    var noms = selection.map(types.frType).join(' / ');
    elMethod.innerHTML =
      '<h4>En attaque</h4>' +
      '<p>Multiplicateur appliqué aux capacités de type <strong>' +
        escapeHtml(noms) + '</strong> contre chaque type défenseur.' +
        (selection.length > 1
          ? ' Avec deux types, on retient le <strong>meilleur</strong> des deux — ' +
            'un joueur choisira naturellement la capacité la plus efficace dont il dispose.'
          : '') +
      '</p>' +
      '<h4>En défense</h4>' +
      '<p>Multiplicateur subi par un Pokémon de type <strong>' +
        escapeHtml(noms) + '</strong>.' +
        (selection.length > 1
          ? ' Les deux types se <strong>multiplient</strong> : c\'est ce qui produit ' +
            'les ×4 (deux faiblesses au même type) et les ×¼ (deux résistances).'
          : '') +
      '</p>' +
      '<h4>Provenance</h4>' +
      '<p>Table reconstruite depuis les relations de dégâts officielles de ' +
        'PokéAPI (<code>/type/{nom}</code> → <code>damage_relations</code>), ' +
        'avec repli hors ligne sur <code>data/type-chart.js</code>. ' +
        'Source actuellement utilisée&nbsp;: <strong>' +
        escapeHtml(types.source() === 'pokeapi' ? 'PokéAPI' : 'repli embarqué') +
        '</strong>.</p>' +
      '<p>Le type Stellaire est exclu&nbsp;: c\'est une mécanique de Téracristal, ' +
        'pas un type défensif ordinaire.</p>';
  }

  function render() {
    renderPicker();
    renderSelection();

    if (!selection.length) {
      elResults.hidden = true;
      return;
    }

    elResults.hidden = false;
    var noms = selection.map(types.frType).join(' / ');
    elAttackSub.textContent = 'ce que ' + noms + ' inflige';
    elDefenseSub.textContent = 'ce que ' + noms + ' subit';

    renderGroups(elAttack, offensiveProfile(selection), ATTACK_LABEL, 'attaque');
    renderGroups(elDefense, defensiveProfile(selection), DEFENSE_LABEL, 'defense');
    renderMethod();
  }

  /* ------------------------------------------------------------------ */
  /* Table complète                                                      */
  /* ------------------------------------------------------------------ */

  function renderGrid() {
    var all = types.allTypes();

    var header = '<thead><tr><th class="grid-corner" scope="col">' +
      '<span class="grid-corner-att">att.</span>' +
      '<span class="grid-corner-def">déf.</span>' +
      '</th>' +
      all.map(function (d) {
        return '<th scope="col" class="grid-head grid-head-col type-' + escapeHtml(d) + '" ' +
          'title="' + escapeHtml(types.frType(d)) + ' en défense">' +
          (typeIcon(d) || escapeHtml(types.frType(d).slice(0, 3))) + '</th>';
      }).join('') + '</tr></thead>';

    var body = '<tbody>' + all.map(function (a) {
      return '<tr>' +
        '<th scope="row" class="grid-head type-' + escapeHtml(a) + '" ' +
          'title="' + escapeHtml(types.frType(a)) + ' en attaque">' +
          typeIcon(a) + escapeHtml(types.frType(a)) + '</th>' +
        all.map(function (d) {
          var v = types.effectiveness(a, [d]);
          return '<td class="cell ' + classForMultiplier(v) + '" title="' +
            escapeHtml(types.frType(a) + ' → ' + types.frType(d) + ' : ' + formatMultiplier(v)) +
            '">' + (v === 1 ? '' : formatMultiplier(v).replace('×', '')) + '</td>';
        }).join('') +
      '</tr>';
    }).join('') + '</tbody>';

    elGrid.innerHTML = header + body;
  }

  /* ------------------------------------------------------------------ */
  /* Démarrage                                                           */
  /* ------------------------------------------------------------------ */

  function setStatus(text, state) {
    elStatusText.textContent = text;
    elStatus.classList.toggle('is-ready', state === 'ready');
    elStatus.classList.toggle('is-error', state === 'error');
  }

  function init() {
    elPicker.addEventListener('click', function (event) {
      var button = event.target.closest('[data-type]');
      if (button) toggleType(button.dataset.type);
    });

    $('btn-reset').addEventListener('click', function () {
      selection = [];
      render();
    });

    types.load().then(
      function (result) {
        setStatus(
          'Table des types chargée · ' +
          (result.source === 'pokeapi' ? 'source PokéAPI' : 'repli embarqué') +
          ' · ' + result.types.length + ' types',
          'ready'
        );
        renderGrid();
        render();
      },
      function (err) {
        setStatus('Table des types indisponible.', 'error');
        elGlobalError.hidden = false;
        elGlobalError.innerHTML =
          '<strong>Impossible de charger la table des types.</strong>' +
          escapeHtml(err && err.message ? ' ' + err.message : '') +
          ' Recharge la page une fois ta connexion rétablie.';
      }
    );
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window, document);
