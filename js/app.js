/*
 * js/app.js — État de l'application et branchement de l'interface.
 * ================================================================
 *
 * Rôle : gérer l'équipe, déclencher les chargements, appeler le moteur
 * d'analyse et confier le rendu à js/ui.js. Aucune règle de décision ici.
 */
(function (root, document) {
  'use strict';

  var PokeStats = root.PokeStats;
  var api = PokeStats.api;
  var names = PokeStats.names;
  var types = PokeStats.types;
  var dex = PokeStats.dex;
  var analysis = PokeStats.analysis;
  var ui = PokeStats.ui;

  var TEAM_SIZE = 6;
  var TEAM_STORAGE_KEY = 'pokestats:v1:team';

  /* Équipe d'exemple : une équipe de partie d'Écarlate / Violet plausible. */
  var EXAMPLE_TEAM = [
    'Miascarade', 'Flâmigator', 'Palmaval', 'Carchacrok', 'Corvaillus', 'Scalpereur'
  ];

  /* ------------------------------------------------------------------ */
  /* État                                                                */
  /* ------------------------------------------------------------------ */

  var slots = [];
  for (var i = 0; i < TEAM_SIZE; i++) {
    slots.push({ input: '', record: null, status: 'empty', error: null, token: 0 });
  }

  var candidate = { input: '', record: null, status: 'empty', error: null, token: 0 };
  var typeChartReady = false;

  /* ------------------------------------------------------------------ */
  /* Raccourcis DOM                                                      */
  /* ------------------------------------------------------------------ */

  function $(id) { return document.getElementById(id); }

  var elTeamSlots = $('team-slots');
  var elTeamSummary = $('team-summary');
  var elCandidateInput = $('candidate-name');
  var elCandidateCard = $('candidate-card');
  var elCandidateError = $('candidate-error');
  var elEvolutionBlock = $('evolution-block');
  var elAnalysisPanel = $('analysis-panel');
  var elVerdict = $('verdict');
  var elReasons = $('reasons');
  var elComparisons = $('comparisons');
  var elMethodBody = $('method-body');
  var elSuggestions = $('candidate-suggestions');
  var elStatus = $('data-status');
  var elStatusText = $('data-status-text');
  var elGlobalError = $('global-error');

  /* ------------------------------------------------------------------ */
  /* Bandeau d'état                                                      */
  /* ------------------------------------------------------------------ */

  function setStatus(text, state) {
    elStatusText.textContent = text;
    elStatus.classList.toggle('is-ready', state === 'ready');
    elStatus.classList.toggle('is-error', state === 'error');
  }

  function showGlobalError(message, detail) {
    elGlobalError.hidden = false;
    elGlobalError.innerHTML =
      '<strong>' + ui.escapeHtml(message) + '</strong>' +
      (detail ? ui.escapeHtml(detail) : '');
  }

  function hideGlobalError() { elGlobalError.hidden = true; }

  /* ------------------------------------------------------------------ */
  /* Persistance de l'équipe                                             */
  /* ------------------------------------------------------------------ */

  function saveTeam() {
    try {
      if (!root.localStorage) return;
      root.localStorage.setItem(
        TEAM_STORAGE_KEY,
        JSON.stringify(slots.map(function (s) { return s.input; }))
      );
    } catch (e) { /* stockage indisponible : sans conséquence */ }
  }

  function restoreTeam() {
    try {
      if (!root.localStorage) return null;
      var raw = root.localStorage.getItem(TEAM_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Construction des emplacements                                       */
  /* ------------------------------------------------------------------ */

  function buildSlots() {
    elTeamSlots.innerHTML = '';
    slots.forEach(function (slot, index) {
      var wrapper = document.createElement('div');
      wrapper.className = 'slot';
      wrapper.dataset.index = String(index);

      wrapper.innerHTML =
        '<div class="slot-header">' +
          '<span class="slot-index">Emplacement ' + (index + 1) + '</span>' +
          '<button type="button" class="slot-remove" title="Vider cet emplacement" ' +
            'aria-label="Vider l\'emplacement ' + (index + 1) + '">×</button>' +
        '</div>' +
        '<label class="visually-hidden" for="slot-input-' + index + '">' +
          'Pokémon de l\'emplacement ' + (index + 1) + '</label>' +
        '<input type="text" class="text-input slot-input" id="slot-input-' + index + '" ' +
          'placeholder="Nom du Pokémon" autocomplete="off" ' +
          'list="slot-suggestions-' + index + '">' +
        '<datalist id="slot-suggestions-' + index + '"></datalist>' +
        '<div class="slot-content"></div>';

      var input = wrapper.querySelector('.slot-input');
      var datalist = wrapper.querySelector('datalist');

      input.addEventListener('input', function () {
        refreshDatalist(datalist, input.value);
      });
      input.addEventListener('change', function () {
        setSlotInput(index, input.value);
      });
      input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          setSlotInput(index, input.value);
        }
      });

      wrapper.querySelector('.slot-remove').addEventListener('click', function () {
        input.value = '';
        setSlotInput(index, '');
      });

      elTeamSlots.appendChild(wrapper);
    });
  }

  function slotElement(index) {
    return elTeamSlots.querySelector('.slot[data-index="' + index + '"]');
  }

  function renderSlot(index) {
    var slot = slots[index];
    var wrapper = slotElement(index);
    if (!wrapper) return;

    var content = wrapper.querySelector('.slot-content');
    wrapper.classList.toggle('is-filled', slot.status === 'ok');
    wrapper.classList.toggle('is-loading', slot.status === 'loading');

    if (slot.status === 'empty') {
      content.innerHTML = '';
      return;
    }
    if (slot.status === 'loading') {
      content.innerHTML = '<div class="slot-error" style="color:var(--text-faint)">Chargement…</div>';
      return;
    }
    if (slot.status === 'error') {
      content.innerHTML = '<div class="slot-error">' + ui.escapeHtml(slot.error.message) +
        renderSuggestionLinks(slot.error.suggestions, index) + '</div>';
      wireSuggestionLinks(content, index);
      return;
    }
    content.innerHTML = ui.monCard(slot.record, { showStats: true });
  }

  function renderSuggestionLinks(suggestions, index) {
    if (!suggestions || !suggestions.length) return '';
    return ' Vouliez-vous dire ' + suggestions.map(function (s, i) {
      return '<button type="button" data-suggest="' + ui.escapeHtml(s.label) + '" ' +
        'data-slot="' + index + '">' + ui.escapeHtml(s.label) + '</button>' +
        (i < suggestions.length - 1 ? ' ou ' : '');
    }).join('') + '&nbsp;?';
  }

  function wireSuggestionLinks(container, index) {
    container.querySelectorAll('button[data-suggest]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var label = btn.dataset.suggest;
        if (index === -1) {
          elCandidateInput.value = label;
          loadCandidate(label);
        } else {
          var input = slotElement(index).querySelector('.slot-input');
          input.value = label;
          setSlotInput(index, label);
        }
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Autocomplétion                                                      */
  /* ------------------------------------------------------------------ */

  function refreshDatalist(datalist, value) {
    if (!value || value.length < 2) {
      datalist.innerHTML = '';
      return;
    }
    datalist.innerHTML = names.suggest(value, 8).map(function (s) {
      return '<option value="' + ui.escapeHtml(s.label) + '"></option>';
    }).join('');
  }

  /* ------------------------------------------------------------------ */
  /* Chargement des Pokémon                                              */
  /* ------------------------------------------------------------------ */

  /** Transforme une erreur d'API en message utilisateur exploitable. */
  function describeError(err, input) {
    if (err && err.kind === 'not-found') {
      return {
        message: 'Aucun Pokémon nommé « ' + input +' » n\'a été trouvé.',
        suggestions: names.didYouMean(input, 3)
      };
    }
    if (err && err.kind === 'network') {
      return {
        message: 'PokéAPI est injoignable. Vérifie ta connexion, puis réessaie.',
        suggestions: []
      };
    }
    if (err && err.kind === 'server') {
      return {
        message: 'PokéAPI a renvoyé une erreur. Réessaie dans un instant.',
        suggestions: []
      };
    }
    return {
      message: 'Erreur inattendue lors du chargement de « ' + input + ' ».',
      suggestions: []
    };
  }

  function setSlotInput(index, value) {
    var slot = slots[index];
    var trimmed = String(value || '').trim();

    if (trimmed === slot.input && slot.status !== 'error') {
      return;
    }

    slot.input = trimmed;
    slot.token += 1;
    var token = slot.token;
    saveTeam();

    if (!trimmed) {
      slot.record = null;
      slot.status = 'empty';
      slot.error = null;
      renderSlot(index);
      onTeamChanged();
      return;
    }

    slot.status = 'loading';
    slot.error = null;
    renderSlot(index);

    dex.load(trimmed).then(
      function (record) {
        if (slot.token !== token) return;      // saisie plus récente : on ignore
        slot.record = record;
        slot.status = 'ok';
        renderSlot(index);
        onTeamChanged();
      },
      function (err) {
        if (slot.token !== token) return;
        slot.record = null;
        slot.status = 'error';
        slot.error = describeError(err, trimmed);
        renderSlot(index);
        onTeamChanged();
      }
    );
  }

  function currentTeam() {
    return slots
      .filter(function (s) { return s.status === 'ok' && s.record; })
      .map(function (s) { return s.record; });
  }

  function onTeamChanged() {
    renderTeamSummary();
    /* Si une analyse est déjà affichée, on la recalcule pour rester cohérent. */
    if (candidate.status === 'ok') runAnalysis();
  }

  function renderTeamSummary() {
    var team = currentTeam();
    if (!team.length || !typeChartReady) {
      elTeamSummary.hidden = true;
      return;
    }
    elTeamSummary.hidden = false;
    elTeamSummary.innerHTML = ui.teamSummaryHtml(analysis.teamTypeProfile(team));
  }

  /* ------------------------------------------------------------------ */
  /* Candidat                                                            */
  /* ------------------------------------------------------------------ */

  function loadCandidate(value) {
    var trimmed = String(value || '').trim();
    candidate.input = trimmed;
    candidate.token += 1;
    var token = candidate.token;

    elCandidateError.hidden = true;

    if (!trimmed) {
      candidate.record = null;
      candidate.status = 'empty';
      elCandidateCard.hidden = true;
      elEvolutionBlock.hidden = true;
      elAnalysisPanel.hidden = true;
      return;
    }

    candidate.status = 'loading';
    elCandidateCard.hidden = false;
    elCandidateCard.innerHTML = '<p style="margin:0;color:var(--text-faint)">Chargement…</p>';
    elEvolutionBlock.hidden = true;

    dex.load(trimmed).then(
      function (record) {
        if (candidate.token !== token) return;
        candidate.record = record;
        candidate.status = 'ok';
        elCandidateCard.innerHTML = ui.monCard(record, { showStats: true, showAbilities: true });
        runAnalysis();
      },
      function (err) {
        if (candidate.token !== token) return;
        candidate.record = null;
        candidate.status = 'error';
        elCandidateCard.hidden = true;
        elEvolutionBlock.hidden = true;
        elAnalysisPanel.hidden = true;

        var described = describeError(err, trimmed);
        elCandidateError.hidden = false;
        elCandidateError.innerHTML = '<strong>' + ui.escapeHtml(described.message) + '</strong>' +
          renderSuggestionLinks(described.suggestions, -1);
        wireSuggestionLinks(elCandidateError, -1);
      }
    );
  }

  /* ------------------------------------------------------------------ */
  /* Analyse                                                             */
  /* ------------------------------------------------------------------ */

  function runAnalysis() {
    if (candidate.status !== 'ok' || !candidate.record) return;

    if (!typeChartReady) {
      elAnalysisPanel.hidden = false;
      elVerdict.innerHTML =
        '<div class="verdict verdict-indetermine">' +
          '<span class="verdict-label">Analyse impossible</span>' +
          '<h3>La table d\'efficacité des types n\'a pas pu être chargée.</h3>' +
          '<p>Sans elle, l\'analyse de couverture serait incomplète : par prudence, ' +
          'aucune recommandation n\'est produite. Recharge la page une fois ta ' +
          'connexion rétablie.</p>' +
        '</div>';
      elReasons.innerHTML = '';
      elComparisons.innerHTML = '';
      elMethodBody.innerHTML = '';
      return;
    }

    var result = analysis.evaluate({
      team: currentTeam(),
      candidate: candidate.record
    });

    /* Évolutions : affichées dès qu'un candidat est chargé. */
    elEvolutionBlock.hidden = false;
    elEvolutionBlock.innerHTML = ui.evolutionHtml(candidate.record, result.evolution);

    elAnalysisPanel.hidden = false;
    elVerdict.innerHTML = ui.verdictHtml(result.headline);
    elReasons.innerHTML = ui.reasonsHtml(result);
    elComparisons.innerHTML = ui.comparisonsHtml(result);
    elMethodBody.innerHTML = ui.methodHtml(result);
  }

  /* ------------------------------------------------------------------ */
  /* Actions globales                                                    */
  /* ------------------------------------------------------------------ */

  function fillExampleTeam() {
    EXAMPLE_TEAM.forEach(function (name, index) {
      var input = slotElement(index).querySelector('.slot-input');
      input.value = name;
      setSlotInput(index, name);
    });
  }

  function clearTeam() {
    slots.forEach(function (slot, index) {
      var input = slotElement(index).querySelector('.slot-input');
      input.value = '';
      setSlotInput(index, '');
    });
  }

  /* ------------------------------------------------------------------ */
  /* Démarrage                                                           */
  /* ------------------------------------------------------------------ */

  /*
   * Images en échec : un seul écouteur délégué, en phase de capture (les
   * événements `error` d'une image ne remontent pas). Remplace la vignette
   * cassée par un cadre portant le nom du Pokémon.
   */
  function watchBrokenImages() {
    document.addEventListener('error', function (event) {
      var img = event.target;
      if (!img || img.tagName !== 'IMG' || !img.classList.contains('mon-sprite')) return;
      var remplacement = document.createElement('div');
      remplacement.className = 'mon-sprite is-missing is-broken';
      remplacement.textContent = img.dataset.fallback || 'Image indisponible';
      if (img.parentNode) img.parentNode.replaceChild(remplacement, img);
    }, true);
  }

  function init() {
    watchBrokenImages();
    buildSlots();

    $('btn-example').addEventListener('click', fillExampleTeam);
    $('btn-clear-team').addEventListener('click', clearTeam);
    $('btn-analyze').addEventListener('click', function () {
      loadCandidate(elCandidateInput.value);
    });
    elCandidateInput.addEventListener('input', function () {
      refreshDatalist(elSuggestions, elCandidateInput.value);
    });
    elCandidateInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        loadCandidate(elCandidateInput.value);
      }
    });
    $('btn-reset-cache').addEventListener('click', function () {
      api.clearCache();
      try { root.localStorage.removeItem('pokestats:v1:names-fr-index'); } catch (e) { /* noop */ }
      root.location.reload();
    });

    /* 1. Index des noms : le fichier de secours est disponible immédiatement,
     *    l'index complet arrive en arrière-plan. */
    names.init().then(function (status) {
      updateStatusLine(status);
    });

    /* 2. Table des types : indispensable à l'analyse de couverture. */
    setStatus('Chargement de la table des types depuis PokéAPI…', 'loading');
    types.load().then(
      function (result) {
        typeChartReady = true;
        hideGlobalError();
        /* Le repli hors ligne permet de continuer, mais l'utilisateur doit
         * savoir que les données de types ne viennent pas de PokéAPI. */
        if (result && result.source === 'repli-hors-ligne') {
          showGlobalError(
            'PokéAPI est injoignable pour la table des types.',
            ' L\'analyse continue avec la table vérifiée embarquée ' +
            '(data/type-chart.js). Les statistiques et évolutions, elles, ' +
            'nécessitent PokéAPI : elles resteront indisponibles tant que la ' +
            'connexion n\'est pas rétablie.'
          );
        }
        updateStatusLine(names.status());
        renderTeamSummary();
        if (candidate.status === 'ok') runAnalysis();
      },
      function (err) {
        typeChartReady = false;
        setStatus('PokéAPI injoignable — analyse indisponible.', 'error');
        showGlobalError(
          'Impossible de charger les données PokéAPI.',
          ' ' + (err && err.message ? err.message : '') +
          ' L\'analyse reste bloquée tant que les données officielles ne sont pas ' +
          'disponibles : l\'outil préfère ne rien conclure plutôt que de deviner.'
        );
      }
    );

    /* 3. Restauration de la dernière équipe saisie. */
    var saved = restoreTeam();
    if (Array.isArray(saved)) {
      saved.slice(0, TEAM_SIZE).forEach(function (value, index) {
        if (!value) return;
        var input = slotElement(index).querySelector('.slot-input');
        input.value = value;
        setSlotInput(index, value);
      });
    }
  }

  function updateStatusLine(nameStatus) {
    if (!typeChartReady) return;
    var chartSource = types.source() === 'pokeapi'
      ? 'table des types : PokéAPI'
      : 'table des types : repli embarqué';
    setStatus(
      'Données PokéAPI chargées · ' + chartSource + ' · ' +
      'index des noms : ' + nameStatus.source + ' (' + nameStatus.count + ' entrées)',
      'ready'
    );
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window, document);
