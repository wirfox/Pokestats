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
  var gameState = PokeStats.game;
  var teams = PokeStats.teams;

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
    slots.push({ input: '', slug: '', record: null, status: 'empty', error: null, token: 0 });
  }

  var candidate = { input: '', slug: '', record: null, status: 'empty', error: null, token: 0 };
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

  /* La persistance passe désormais par js/teams.js : plusieurs équipes
   * coexistent, chacune rattachée à un jeu. */
  function saveTeam() {
    slots.forEach(function (slot, index) {
      teams.setSlot(index, slot.input, slot.slug);
    });
  }

  function restoreTeam() {
    return teams.slots();
  }

  /* ------------------------------------------------------------------ */
  /* Construction des emplacements                                       */
  /* ------------------------------------------------------------------ */

  /* ------------------------------------------------------------------ */
  /* Onglets d'équipes                                                   */
  /* ------------------------------------------------------------------ */

  /**
   * Une barre d'onglets, une équipe par onglet. Chaque équipe est rattachée à
   * un jeu : changer de jeu n'efface rien, l'ancienne équipe reste à un clic.
   */
  function renderTabs() {
    var container = $('team-tabs');
    if (!container) return;
    var currentGame = gameState.current();
    var active = teams.active();

    container.innerHTML =
      teams.all().map(function (t) {
        var jeu = gameState.byId(t.gameId);
        var remplis = t.slots.filter(function (v) { return v; }).length;
        var estActif = active && t.id === active.id;
        return '<button type="button" class="team-tab' + (estActif ? ' is-active' : '') +
          '" data-team="' + ui.escapeHtml(t.id) + '"' +
          (estActif ? ' aria-current="true"' : '') + '>' +
            '<span class="team-tab-name">' + ui.escapeHtml(t.name) + '</span>' +
            '<span class="team-tab-meta">' +
              ui.escapeHtml(jeu ? jeu.label : 'jeu inconnu') +
              ' · ' + remplis + '/6</span>' +
          '</button>';
      }).join('') +
      '<button type="button" class="team-tab team-tab-add" id="team-add" ' +
        'title="Nouvelle équipe pour ' + ui.escapeHtml(currentGame ? currentGame.label : '') + '">+</button>';

    container.querySelectorAll('[data-team]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (teams.active() && btn.dataset.team === teams.active().id) return;
        teams.setActive(btn.dataset.team);
        switchToActiveTeam();
      });
    });

    var add = $('team-add');
    if (add) {
      add.addEventListener('click', function () {
        teams.create(currentGame ? currentGame.id : null);
        switchToActiveTeam();
      });
    }
    renderTeamToolbar();
  }

  /** Actions sur l'équipe active : renommer, supprimer. */
  function renderTeamToolbar() {
    var el = $('team-toolbar');
    if (!el) return;
    var active = teams.active();
    if (!active) { el.innerHTML = ''; return; }
    var jeu = gameState.byId(active.gameId);

    el.innerHTML =
      '<span class="team-current">Équipe active&nbsp;: <strong>' +
        ui.escapeHtml(active.name) + '</strong>' +
        (jeu ? ' <span class="team-current-game">(' + ui.escapeHtml(jeu.label) + ')</span>' : '') +
      '</span>' +
      '<button type="button" class="btn btn-ghost" id="team-rename">Renommer</button>' +
      '<button type="button" class="btn btn-ghost" id="team-delete">Supprimer</button>';

    $('team-rename').addEventListener('click', function () {
      var nom = root.prompt('Nom de cette équipe :', active.name);
      if (nom === null) return;
      teams.rename(active.id, nom);
      renderTabs();
    });
    $('team-delete').addEventListener('click', function () {
      var seule = teams.all().length === 1;
      var message = seule
        ? 'Vider cette équipe ? C’est la dernière, elle sera conservée mais remise à zéro.'
        : 'Supprimer l’équipe « ' + active.name + ' » ? Cette action est définitive.';
      if (!root.confirm(message)) return;
      teams.remove(active.id);
      switchToActiveTeam();
    });
  }

  /** Recharge les emplacements depuis l'équipe devenue active. */
  function switchToActiveTeam() {
    var valeurs = teams.slots();
    var identifiants = teams.slugs();
    slots.forEach(function (slot, index) {
      var input = slotElement(index).querySelector('.slot-input');
      input.value = valeurs[index] || '';
      slot.input = '';               // force le rechargement même à valeur égale
      slot.slug = '';
      setSlotInput(index, valeurs[index] || '', {
        silent: true, slug: identifiants[index] || ''
      });
    });
    renderTabs();
    onTeamChanged();
  }

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
    content.innerHTML = ui.monCard(slot.record, { showStats: true }) +
      ui.formPickerHtml(slot.record) +
      ui.movesetHtml(slot.record, teams.movesOf(index), {
        index: index, open: openMovesets[index]
      });
    ui.wireFormPicker(content, function (formSlug, label) {
      var input = wrapper.querySelector('.slot-input');
      input.value = label;
      setSlotInput(index, label, { slug: formSlug });
    });
    wireMoveset(content, index);
  }

  /* ------------------------------------------------------------------ */
  /* Attaques équipées                                                   */
  /* ------------------------------------------------------------------ */

  /* Le bloc « attaques » reste ouvert d'un rendu à l'autre : il se referme
   * sinon à chaque ajout, ce qui rendrait la saisie des quatre attaques
   * pénible. */
  var openMovesets = [];

  /**
   * Identifiant d'une fiche dans l'espace de noms de l'application, celui que
   * partagent les données de génération, le Pokédex et la table des formes.
   */
  function canonicalSlug(record) {
    if (!record) return '';
    var forms = PokeStats.forms;
    return (forms && forms.currentSlug(record)) || record.slug || '';
  }

  /** Capacités que CE Pokémon peut apprendre, pour restreindre les propositions. */
  function learnableOf(record) {
    return (record && record.learnable) || null;
  }

  /**
   * Signale une capacité que PokéAPI n'associe pas à ce Pokémon.
   *
   * Ce n'est jamais un refus : c'est le jeu du joueur qui fait foi, pas notre
   * copie des données. Mais neuf fois sur dix, c'est une faute de frappe.
   */
  function noteApprentissage(record, slug) {
    var table = learnableOf(record);
    if (!table) return null;
    if (!table[slug]) {
      return 'PokéAPI n’associe pas cette capacité à ' + record.frName +
        ' : vérifie l’orthographe. Le conseil ci-dessus reste calculé sur ses ' +
        'vraies valeurs.';
    }
    var jeu = gameState.current();
    if (jeu && table[slug].indexOf(jeu.id) === -1) {
      return 'PokéAPI ne la liste pas pour ' + jeu.label +
        ', mais pour d’autres versions. Si ton jeu te la propose, fie-toi à ton jeu.';
    }
    return null;
  }

  function wireMoveset(container, index) {
    var bloc = container.querySelector('.moveset');
    if (!bloc) return;
    var slot = slots[index];
    var record = slot && slot.record;
    if (!record) return;

    var corps = bloc.querySelector('.moveset-body');

    bloc.querySelector('.moveset-toggle').addEventListener('click', function () {
      var ouvert = corps.hidden;
      corps.hidden = !ouvert;
      this.setAttribute('aria-expanded', ouvert ? 'true' : 'false');
      openMovesets[index] = ouvert;
    });

    bloc.querySelectorAll('.move-remove').forEach(function (btn) {
      btn.addEventListener('click', function () {
        teams.removeMove(index, btn.dataset.move);
        openMovesets[index] = true;
        renderSlot(index);
      });
    });

    var ajout = bloc.querySelector('.moveset-input');
    if (ajout) {
      var listeAjout = bloc.querySelector('#moveset-' + index + '-list');
      ajout.addEventListener('input', function () {
        remplirCapacites(listeAjout, ajout.value, record);
      });
      var valider = function () {
        var slug = PokeStats.movedex.resolve(ajout.value);
        if (!slug) return;
        teams.addMove(index, slug);
        openMovesets[index] = true;
        renderSlot(index);
      };
      ajout.addEventListener('change', valider);
      ajout.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); valider(); }
      });
    }

    var candidat = bloc.querySelector('.moveset-candidate');
    var listeCandidat = bloc.querySelector('#moveset-' + index + '-newlist');
    var conseil = bloc.querySelector('.moveset-advice');

    candidat.addEventListener('input', function () {
      remplirCapacites(listeCandidat, candidat.value, record);
    });

    var demander = function () {
      var saisie = candidat.value.trim();
      if (!saisie) { conseil.hidden = true; return; }
      var slug = PokeStats.movedex.resolve(saisie);
      if (!slug) {
        conseil.hidden = false;
        conseil.innerHTML = '<div class="advice advice-non">' +
          '<p class="advice-verdict">Capacité inconnue</p>' +
          '<ul class="advice-reasons"><li>« ' + ui.escapeHtml(saisie) +
          ' » ne correspond à aucune capacité du catalogue. Vérifie l’orthographe.</li></ul>' +
          '</div>';
        return;
      }
      var verdict = PokeStats.moveset.evaluate(record, teams.movesOf(index), slug);
      conseil.hidden = false;
      conseil.innerHTML = ui.moveAdviceHtml(record, verdict, noteApprentissage(record, slug)) +
        (verdict.code === 'remplace' || verdict.code === 'apprends'
          ? '<button type="button" class="btn moveset-apply" data-move="' +
            ui.escapeHtml(slug) + '">Appliquer l’échange</button>'
          : '');

      var appliquer = conseil.querySelector('.moveset-apply');
      if (appliquer) {
        appliquer.addEventListener('click', function () {
          var actuelles = teams.movesOf(index);
          var place = verdict.drop ? actuelles.indexOf(verdict.drop.slug) : -1;
          /* La nouvelle attaque prend la place de celle qui saute : l'ordre
           * affiché reste celui que le joueur a en tête. */
          if (place !== -1) actuelles[place] = slug;
          else actuelles = actuelles.concat([slug]);
          teams.setMoves(index, actuelles);
          openMovesets[index] = true;
          renderSlot(index);
        });
      }
    };

    bloc.querySelector('.moveset-ask').addEventListener('click', demander);
    candidat.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); demander(); }
    });
  }

  /**
   * Propositions de capacités, restreintes à celles que ce Pokémon peut
   * apprendre quand PokéAPI le sait. Une liste de 847 capacités serait
   * inutilisable ; une liste de 90 est un vrai gain de temps.
   */
  function remplirCapacites(datalist, valeur, record) {
    if (!datalist) return;
    if (!valeur || valeur.length < 2) { datalist.innerHTML = ''; return; }
    var table = learnableOf(record);
    var propositions = PokeStats.movedex.suggest(valeur, { limit: 10, only: table });
    if (!propositions.length && table) {
      /* Rien dans son répertoire : on élargit plutôt que de ne rien proposer. */
      propositions = PokeStats.movedex.suggest(valeur, { limit: 10 });
    }
    datalist.innerHTML = propositions.map(function (m) {
      return '<option value="' + ui.escapeHtml(m.frName) + '"></option>';
    }).join('');
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

  /**
   * Propositions de saisie, restreintes au jeu sélectionné.
   *
   * Sans ce filtre, un joueur de Rouge/Bleu se verrait proposer Carchacrok,
   * qui n'existe pas dans son jeu. On élargit tout de même à l'index complet
   * si le filtrage ne laisse rien : mieux vaut une proposition hors-jeu, que
   * l'analyse signalera, qu'aucune proposition du tout.
   */
  function refreshDatalist(datalist, value) {
    if (!value || value.length < 2) {
      datalist.innerHTML = '';
      return;
    }
    var brut = names.suggest(value, 24);
    var duJeu = brut.filter(function (s) { return gameState.isInGame(s.slug); });
    var retenues = (duJeu.length ? duJeu : brut).slice(0, 8);

    datalist.innerHTML = retenues.map(function (s) {
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

  /**
   * Change le contenu d'un emplacement.
   *
   * @param {number} index
   * @param {string} value texte saisi (ou libellé de forme)
   * @param {{silent?: boolean, slug?: string}} [options]
   *        `slug` : identifiant déjà connu. Fourni par le sélecteur de forme
   *        et par la restauration de l'équipe, il évite de redevenir
   *        dépendant de l'interprétation du libellé — c'est ce qui garantit
   *        qu'un Lougaroc Crépusculaire reste crépusculaire après un F5.
   */
  function setSlotInput(index, value, options) {
    var slot = slots[index];
    var o = options || {};
    var trimmed = String(value || '').trim();
    var slugDemande = o.slug || '';

    /* Rien n'a changé : on ne recharge pas.
     *
     * Le champ émet un « change » dès qu'il perd le focus, y compris quand son
     * contenu est identique — un simple clic ailleurs dans l'emplacement
     * suffit. Recharger à ce moment-là redessinerait la fiche sous le doigt de
     * l'utilisateur, et surtout : faute d'identifiant explicite, la forme
     * choisie serait redevinée à partir du libellé. C'est ce qui ramenait un
     * Lougaroc Crépusculaire à sa forme Diurne. */
    var memeSaisie = trimmed === slot.input;
    var memeIdentifiant = !slugDemande || slugDemande === slot.slug;
    if (memeSaisie && memeIdentifiant && slot.status !== 'error') {
      return;
    }

    slot.input = trimmed;
    /* On n'arrive ici que si la saisie a changé, ou qu'un identifiant précis
     * est demandé : dans les deux cas l'ancien identifiant est caduc. */
    slot.slug = slugDemande;
    slot.token += 1;
    var token = slot.token;
    /* Lors d'un changement d'onglet, les valeurs viennent déjà du stockage :
     * les réécrire écraserait l'équipe qu'on vient de quitter. */
    if (!o.silent) saveTeam();

    if (!trimmed) {
      slot.record = null;
      slot.slug = '';
      slot.status = 'empty';
      slot.error = null;
      renderSlot(index);
      onTeamChanged();
      return;
    }

    slot.status = 'loading';
    slot.error = null;
    renderSlot(index);

    dex.load(trimmed, slugDemande ? { slug: slugDemande } : undefined).then(
      function (record) {
        if (slot.token !== token) return;      // saisie plus récente : on ignore
        slot.record = record;
        slot.status = 'ok';
        /* On enregistre l'identifiant RÉELLEMENT obtenu, pas celui demandé :
         * il est stable d'une visite à l'autre, quoi qu'il arrive à l'index
         * des noms ou aux libellés.
         *
         * Ramené à l'espace d'identifiants de l'application : PokéAPI nomme la
         * forme par défaut de Lougaroc « lycanroc-midday », les données de jeu
         * l'appellent « lycanroc ». Enregistrer la seconde forme du nom permet
         * au Pokédex et au moteur de la reconnaître sans traduction. */
        slot.slug = canonicalSlug(record) || slugDemande;
        teams.setSlot(index, slot.input, slot.slug);
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

  /**
   * @param {string} value saisie de l'utilisateur
   * @param {{slug?: string}} [options] identifiant déjà connu — même rôle que
   *        pour un emplacement d'équipe : il court-circuite l'interprétation
   *        du libellé et garantit qu'une forme choisie ne se perd pas.
   */
  function loadCandidate(value, options) {
    var trimmed = String(value || '').trim();
    var slugDemande = (options && options.slug) || '';
    candidate.input = trimmed;
    candidate.slug = slugDemande;
    candidate.token += 1;
    var token = candidate.token;

    elCandidateError.hidden = true;

    if (!trimmed) {
      candidate.record = null;
      candidate.slug = '';
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

    dex.load(trimmed, slugDemande ? { slug: slugDemande } : undefined).then(
      function (record) {
        if (candidate.token !== token) return;
        candidate.record = record;
        candidate.status = 'ok';
        candidate.slug = canonicalSlug(record) || slugDemande;
        elCandidateCard.innerHTML =
          ui.monCard(record, { showStats: true, showAbilities: true }) +
          ui.formPickerHtml(record);
        ui.wireFormPicker(elCandidateCard, function (formSlug, label) {
          elCandidateInput.value = label;
          loadCandidate(label, { slug: formSlug });
        });
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

  /**
   * Changer de jeu change la génération, donc les stats, les types et les
   * tiers. Tout ce qui est affiché doit être recalculé — mais l'équipe saisie,
   * elle, est conservée : l'utilisateur retrouve ses Pokémon.
   */
  function onGameChanged() {
    /* L'ordre importe : on invalide la table AVANT de recharger, sinon une
     * requête encore en vol pour l'ancienne génération viendrait l'écraser. */
    if (types.reset) types.reset();
    typeChartReady = false;
    renderTabs();

    types.load().then(function () {
      typeChartReady = true;
      updateStatusLine(names.status());
      /* Les fiches déjà chargées portent les stats de l'ancienne génération :
       * on les recharge depuis leur saisie.
       *
       * L'identifiant est réinjecté avec elle. Sans cela, ce rechargement —
       * qui a lieu à CHAQUE chargement de page, pas seulement quand on change
       * de jeu — reconstruirait la forme à partir du libellé français, et la
       * moindre défaillance de cette interprétation ramènerait le joueur à la
       * forme de base. Un Lougaroc Crépusculaire redeviendrait Diurne. */
      slots.forEach(function (slot, index) {
        if (!slot.input) return;
        var saisie = slot.input;
        var identifiant = slot.slug;
        slot.input = '';
        slot.slug = '';
        setSlotInput(index, saisie, { silent: true, slug: identifiant });
      });
      if (candidate.input) {
        var saisie = candidate.input;
        var identifiant = candidate.slug;
        candidate.input = '';
        candidate.slug = '';
        loadCandidate(saisie, { slug: identifiant });
      }
      renderTeamSummary();
    });
  }

  function init() {
    watchBrokenImages();
    buildSlots();

    if (PokeStats.gamebar) PokeStats.gamebar.mount($('game-bar'));

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

    /* 3. Jeu sélectionné, puis équipes. L'ordre compte : les équipes sont
     *    rattachées à un jeu, et les fiches dépendent de sa génération. */
    gameState.init().then(
      function (game) {
        teams.init(game.id);
        gameState.onChange(onGameChanged);
        renderTabs();

        var saved = restoreTeam();
        var savedSlugs = teams.slugs();
        saved.slice(0, TEAM_SIZE).forEach(function (value, index) {
          if (!value) return;
          var input = slotElement(index).querySelector('.slot-input');
          input.value = value;
          setSlotInput(index, value, { silent: true, slug: savedSlugs[index] || '' });
        });
        onGameChanged();
      },
      function (err) {
        showGlobalError(
          'Impossible de charger les données du jeu sélectionné.',
          ' ' + (err && err.message ? err.message : '') +
          ' Le site a besoin de ces données pour adapter les statistiques et les tiers.'
        );
      }
    );
  }

  function updateStatusLine(nameStatus) {
    if (!typeChartReady) return;
    var src = types.source() || '';
    var chartSource = src.indexOf('generation-') === 0
      ? 'types : génération ' + src.replace('generation-', '')
      : src === 'pokeapi' ? 'types : PokéAPI' : 'types : repli embarqué';
    var jeu = gameState.current();
    setStatus(
      (jeu ? jeu.label + ' · ' : '') + chartSource + ' · ' +
      'noms : ' + nameStatus.count + ' entrées',
      'ready'
    );
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window, document);
