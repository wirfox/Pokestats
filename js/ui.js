/*
 * js/ui.js — Rendu de l'interface.
 * ================================
 *
 * Ce module ne prend AUCUNE décision : il se contente de traduire en HTML les
 * objets produits par js/analysis.js. Toute la logique de recommandation vit
 * dans le moteur, ce qui permet de la tester sans navigateur.
 */
(function (root) {
  'use strict';

  var PokeStats = (root.PokeStats = root.PokeStats || {});
  var types = PokeStats.types;
  var dex = PokeStats.dex;
  var analysis = PokeStats.analysis;

  /* Valeur maximale d'une stat de base (Blizzaroi/Chenipotte mis à part,
   * 255 est le plafond du jeu) — sert à dimensionner les barres. */
  var STAT_MAX = 255;

  /* ------------------------------------------------------------------ */
  /* Aides                                                               */
  /* ------------------------------------------------------------------ */

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function statBarClass(value) {
    if (value >= 120) return 'top';
    if (value >= 90) return 'high';
    if (value >= 60) return 'mid';
    return 'low';
  }

  function pct(value) {
    return Math.max(1, Math.min(100, (value / STAT_MAX) * 100));
  }

  function frAbility(slug) {
    return slug.replace(/-/g, ' ');
  }

  /* ------------------------------------------------------------------ */
  /* Fragments réutilisables                                             */
  /* ------------------------------------------------------------------ */


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

  function typeChips(typeList) {
    return (typeList || [])
      .map(function (t) {
        return '<span class="type-chip type-' + escapeHtml(t) + '">' +
          typeIcon(t) + escapeHtml(types.frType(t)) + '</span>';
      })
      .join('');
  }

  /** Pastille de tier, avec mention explicite du niveau de confiance. */
  function tierBadge(tierInfo) {
    if (!tierInfo || !tierInfo.known) {
      return '<span class="tier-badge tier-unknown" ' +
        'title="Aucune donnée de viabilité fiable — aucun remplacement ne sera recommandé sur cette base.">' +
        'Tier inconnu</span>';
    }
    var title = tierInfo.desc || '';
    var conf = '';

    if (tierInfo.secondOpinion) {
      title += ' · Smogon : ' + tierInfo.tier + ' — Game8 : ' + tierInfo.secondOpinion;
    }
    if (!tierInfo.trusted) {
      title += tierInfo.disagrees
        ? ' · Désaccord marqué entre les deux sources : ce tier ne peut que bloquer une recommandation, jamais la justifier.'
        : ' · Donnée de confiance moyenne : elle ne peut que bloquer une recommandation, jamais la justifier.';
      conf = '<span class="conf">≈</span>';
    }

    var second = tierInfo.secondOpinion
      ? '<span class="tier-second' + (tierInfo.disagrees ? ' is-conflict' : '') + '">' +
        escapeHtml(tierInfo.secondOpinion) + '</span>'
      : '';

    return '<span class="tier-badge tier-' + escapeHtml(tierInfo.tier) + '" title="' +
      escapeHtml(title) + '">Tier ' + escapeHtml(tierInfo.tier) + conf + second + '</span>';
  }

  /**
   * Vignette du Pokémon.
   *
   * Les images sont servies par l'hébergement de PokéAPI. Si l'une d'elles ne
   * charge pas — réseau capricieux, hôte injoignable — le navigateur afficherait
   * une icône cassée. La classe `is-broken`, posée par le gestionnaire délégué
   * de app.js, la remplace par un cadre discret : une image manquante ne doit
   * pas défigurer une fiche par ailleurs complète.
   */
  function spriteHtml(record) {
    if (!record.sprite) {
      return '<div class="mon-sprite is-missing">Pas d\'image</div>';
    }
    return '<img class="mon-sprite" src="' + escapeHtml(record.sprite) +
      '" alt="" loading="lazy" width="72" height="72" ' +
      'data-fallback="' + escapeHtml(record.frName) + '">';
  }

  /**
   * Barres de stats. Si `opponent` est fourni, chaque barre affiche un
   * marqueur à la valeur adverse ainsi que l'écart chiffré.
   */
  function statsHtml(record, opponent) {
    var rows = dex.STAT_KEYS.map(function (key) {
      var value = record.stats[key] || 0;
      var marker = '';
      var delta = '';

      if (opponent) {
        var other = opponent.stats[key] || 0;
        marker = '<span class="marker" style="left:' + pct(other) + '%"></span>';
        var diff = value - other;
        var cls = diff > 0 ? 'delta-up' : diff < 0 ? 'delta-down' : 'delta-flat';
        var sign = diff > 0 ? '+' : '';
        delta = '<span class="stat-delta ' + cls + '">' + sign + diff + '</span>';
      }

      return '' +
        '<div class="stat-row' + (opponent ? ' has-delta' : '') + '">' +
          '<span class="stat-label">' + escapeHtml(dex.STAT_FR[key]) + '</span>' +
          '<span class="stat-value">' + value + '</span>' +
          '<span class="stat-bar">' +
            '<span class="' + statBarClass(value) + '" style="width:' + pct(value) + '%"></span>' +
            marker +
          '</span>' +
          delta +
        '</div>';
    });

    return '<div class="stats">' + rows.join('') + '</div>';
  }

  /**
   * Arsenal offensif : puissance STAB, couverture et capacités clés.
   *
   * Ces indicateurs mesurent un POTENTIEL — ce que le Pokémon peut apprendre —
   * et non le jeu de capacités réellement équipé. C'est dit explicitement dans
   * l'infobulle pour éviter tout malentendu.
   */
  function movesHtml(record) {
    var info = analysis.movesOf(record);
    if (!info.known) {
      return '<div class="moves moves-unknown">Capacités&nbsp;: donnée indisponible ' +
        '— aucune conclusion n’en est tirée.</div>';
    }

    var chips = info.moves.map(function (slug) {
      var m = analysis.moveInfo(slug);
      return '<span class="move-chip' + (m.type ? ' type-' + escapeHtml(m.type) : '') + '" ' +
        'title="' + escapeHtml((m.type ? types.frType(m.type) : '') +
          (m.power ? ' · puissance ' + m.power : '') +
          (m.category === 'phy' ? ' · physique' : m.category === 'spe' ? ' · spéciale' : '')) + '">' +
        escapeHtml(m.name) + '</span>';
    }).join('');

    var cat = info.category === 'phy' ? 'physique' : 'spéciale';
    var stab = info.stabPower
      ? 'STAB ' + info.stabPower + ' (' + cat + ')'
      : '<strong class="moves-warn">aucune capacité STAB ' + cat + '</strong>';

    return '' +
      '<div class="moves">' +
        '<span class="moves-metric" title="Meilleure puissance de base parmi les capacités du type du Pokémon, dans sa catégorie offensive dominante. Potentiel apprenable, pas le set équipé.">' +
          stab + '</span>' +
        '<span class="moves-metric" title="Nombre de types frappés au moins ×2 par ses quatre meilleures capacités.">' +
          'couverture ' + info.coverage + '/18</span>' +
        (chips ? '<div class="move-list">' + chips + '</div>' : '') +
      '</div>';
  }

  /**
   * Fiche complète d'un Pokémon.
   * @param {Object} record
   * @param {{showStats?: boolean, opponent?: Object, showAbilities?: boolean}} [opts]
   */
  function monCard(record, opts) {
    var o = opts || {};
    var tierInfo = analysis.tierOf(record);
    var roleId = analysis.roleOf(record);
    var isNFE = !!(record.evolution && record.evolution.canEvolve);

    /* Nom de forme en français (« Diurne », « Crépusculaire »…) fourni par
     * PokéAPI ; à défaut, on retombe sur le suffixe brut de l'identifiant. */
    var formName = record.frFormName ||
      (record.formSuffix ? record.formSuffix.replace(/-/g, ' ') : '');
    var formLabel = formName
      ? ' <span class="mon-en">(' + escapeHtml(formName) + ')</span>'
      : '';

    var abilities = o.showAbilities && record.abilities && record.abilities.length
      ? '<div class="mon-meta" style="margin-top:6px"><span>Talents&nbsp;: ' +
        record.abilities.map(function (a) {
          return escapeHtml(frAbility(a.slug)) + (a.hidden ? ' <em>(caché)</em>' : '');
        }).join(', ') + '</span></div>'
      : '';

    var moves = o.showMoves === false ? '' : movesHtml(record);

    return '' +
      '<div class="mon">' +
        spriteHtml(record) +
        '<div class="mon-body">' +
          '<div class="mon-name">' + escapeHtml(record.frName) + formLabel +
            '<span class="mon-en">' + escapeHtml(record.enName) + '</span>' +
          '</div>' +
          '<div class="type-row">' + typeChips(record.types) + '</div>' +
          '<div class="mon-meta">' +
            '<span class="bst">BST <strong>' + record.bst + '</strong></span>' +
            tierBadge(tierInfo) +
            '<span class="role-chip" title="' +
              escapeHtml(analysis.ROLES[roleId].description) + '">' +
              escapeHtml(analysis.ROLES[roleId].label) + '</span>' +
            (isNFE ? '<span class="nfe-chip" title="Ce Pokémon peut encore évoluer.">Non évolué</span>' : '') +
          '</div>' +
          abilities +
          moves +
          (o.showStats === false ? '' : statsHtml(record, o.opponent)) +
        '</div>' +
      '</div>';
  }

  /* ------------------------------------------------------------------ */
  /* Faiblesses et résistances                                           */
  /* ------------------------------------------------------------------ */

  function formatMultiplier(value) {
    if (value === 0) return '×0';
    if (value === 0.25) return '×¼';
    if (value === 0.5) return '×½';
    if (value === 1) return '×1';
    return '×' + value;
  }

  function multiplierClass(value) {
    if (value === 0) return 'cell-0';
    if (value === 0.25) return 'cell-025';
    if (value === 0.5) return 'cell-05';
    if (value === 1) return 'cell-1';
    if (value === 2) return 'cell-2';
    return 'cell-4';
  }

  var DEFENSE_LABEL = {
    4: 'Faiblesse doublée', 2: 'Faiblesse', 1: 'Dégâts normaux',
    0.5: 'Résistance', 0.25: 'Double résistance', 0: 'Immunité'
  };
  var ATTACK_LABEL = {
    4: 'Dégâts ×4', 2: 'Très efficace', 1: 'Dégâts normaux',
    0.5: 'Peu efficace', 0.25: 'Très peu efficace', 0: 'Aucun effet'
  };

  function matchupRows(profile, labels, skipNeutral) {
    var groups = types.groupByMultiplier(profile).filter(function (g) {
      return !(skipNeutral && g.value === 1);
    });
    if (!groups.length) return '<p class="matchup-empty">Rien à signaler.</p>';

    return groups.map(function (g) {
      return '' +
        '<div class="mu-row">' +
          '<span class="mu-mult ' + multiplierClass(g.value) + '">' +
            formatMultiplier(g.value) + '</span>' +
          '<span class="mu-label">' + escapeHtml(labels[g.value] || '') + '</span>' +
          '<span class="mu-types">' + typeChips(g.types) + '</span>' +
        '</div>';
    }).join('');
  }

  /**
   * Faiblesses et résistances d'un Pokémon, en deux volets.
   *
   * Attaque et défense sont séparées à dessein : c'est la confusion la plus
   * fréquente. Le Feu est fort CONTRE la Plante mais vulnérable FACE À l'Eau ;
   * une liste unique « fort / faible » induirait en erreur.
   *
   * Le neutre (×1) est masqué : il n'apprend rien et allonge la fiche.
   */
  function matchupsHtml(typeList) {
    if (!types.isLoaded() || !typeList || !typeList.length) return '';
    var noms = typeList.map(types.frType).join(' / ');

    return '' +
      '<div class="mu-block">' +
        '<h3 class="mu-title mu-defense">Ce qu\'il subit' +
          '<span class="mu-sub">en défense, ' + escapeHtml(noms) + '</span></h3>' +
        matchupRows(types.defensiveProfile(typeList), DEFENSE_LABEL, true) +
      '</div>' +
      '<div class="mu-block">' +
        '<h3 class="mu-title mu-attack">Ce que ses capacités de type infligent' +
          '<span class="mu-sub">en attaque, ' + escapeHtml(noms) + '</span></h3>' +
        matchupRows(types.offensiveProfile(typeList), ATTACK_LABEL, true) +
      '</div>';
  }

  /* ------------------------------------------------------------------ */
  /* Équipe                                                              */
  /* ------------------------------------------------------------------ */

  /** Synthèse des faiblesses de types partagées par l'équipe. */
  function teamSummaryHtml(profile) {
    if (!profile.size) return '';

    var critical = profile.criticalWeaknesses;
    var body;

    if (!critical.length) {
      body = '<p style="margin:0;color:var(--text-dim)">Aucune faiblesse partagée par ' +
        profile.threshold + ' membres ou plus. La couverture défensive est correcte.</p>';
    } else {
      body = '<div class="weak-list">' + critical.map(function (t) {
        return '<span class="weak-item">' + escapeHtml(types.frType(t)) +
          ' <span class="count">' + profile.weakCount[t] + '/' + profile.size + '</span></span>';
      }).join('') + '</div>';
    }

    return '' +
      '<h3>Faiblesses critiques de l\'équipe (' + profile.threshold +
        ' membres faibles ou plus)</h3>' + body;
  }

  /* ------------------------------------------------------------------ */
  /* Évolutions                                                          */
  /* ------------------------------------------------------------------ */

  function evolutionHtml(record, evolution) {
    if (!evolution.available) {
      if (evolution.reason === 'donnees-indisponibles') {
        return '<h3>Évolution</h3><p style="margin:0;color:var(--warn)">' +
          escapeHtml(evolution.text) + '</p>';
      }
      return '<h3>Évolution</h3><p style="margin:0;color:var(--text-dim)">' +
        escapeHtml(record.frName) + ' est au bout de sa chaîne d\'évolution.</p>';
    }

    /* Chaîne complète, telle que renvoyée par PokéAPI. */
    var stages = (record.evolution.stages || []);
    var chain = stages.length
      ? '<div class="chain">' + stages.map(function (s, i) {
          var isCurrent = s.speciesSlug === record.speciesSlug;
          /* frName est renseigné par js/dex.js depuis PokéAPI ; le repli sur
           * l'identifiant ne sert que si l'appel a échoué. */
          return (i > 0 ? '<span class="chain-arrow">→</span>' : '') +
            '<span class="chain-node' + (isCurrent ? ' is-current' : '') + '">' +
            escapeHtml(s.frName || s.speciesSlug) + '</span>';
        }).join('') + '</div>'
      : '';

    var forms = [evolution.best].concat(evolution.alternatives);
    var cards = forms.map(function (form) {
      var isBest = form === evolution.best;
      var gain = form.bst - record.bst;
      return '' +
        '<div class="evo-form' + (isBest ? ' is-best' : '') + '">' +
          monCard(form, { showStats: true, opponent: record }) +
          '<div class="evo-condition">' + escapeHtml(form.evolutionCondition || '') + '</div>' +
          '<div class="evo-gain">' + (gain >= 0 ? '+' : '') + gain + ' de BST par rapport à ' +
            escapeHtml(record.frName) + '</div>' +
        '</div>';
    }).join('');

    return '' +
      '<h3>Chaîne d\'évolution</h3>' +
      chain +
      '<div class="evo-forms">' + cards + '</div>';
  }

  /* ------------------------------------------------------------------ */
  /* Verdict et raisons                                                  */
  /* ------------------------------------------------------------------ */

  var VERDICT_LABEL = {
    remplacer: 'Remplacement recommandé',
    ajouter: 'Ajout recommandé',
    investir: 'À intégrer pour son évolution',
    entrainer: 'À garder et entraîner',
    'a-tester': 'À tester, sans garantie',
    'non-recommande': 'Non recommandé',
    indetermine: 'Analyse impossible'
  };

  function verdictHtml(headline) {
    return '' +
      '<div class="verdict verdict-' + escapeHtml(headline.status) + '">' +
        '<span class="verdict-label">' +
          escapeHtml(VERDICT_LABEL[headline.status] || headline.status) + '</span>' +
        '<h3>' + escapeHtml(headline.title) + '</h3>' +
        '<p>' + escapeHtml(headline.text) + '</p>' +
      '</div>';
  }

  function reasonList(title, items, cls) {
    if (!items.length) return '';
    return '' +
      '<div class="reason-group">' +
        '<h3>' + escapeHtml(title) + '</h3>' +
        '<ul class="reason-list ' + cls + '">' +
          items.map(function (t) { return '<li>' + escapeHtml(t) + '</li>'; }).join('') +
        '</ul>' +
      '</div>';
  }

  /**
   * Explique la conclusion : arguments en faveur, points bloquants, réserves.
   * On se base sur la comparaison la plus pertinente, ou à défaut sur les
   * motifs de blocage les plus fréquents.
   */
  function reasonsHtml(result) {
    var focus = result.bestNow || result.bestEvolved ||
      (result.comparisons.length ? result.comparisons.slice().sort(function (a, b) {
        return b.margin - a.margin;
      })[0] : null);

    var html = '';

    if (focus) {
      var against = ' (face à ' + focus.member.frName + ')';
      html += reasonList(
        'Arguments retenus' + against,
        focus.evidence.map(function (e) { return e.text; }),
        'reason-pro'
      );
      html += reasonList(
        'Points bloquants' + against,
        focus.blockers.map(function (b) { return b.text; }),
        'reason-con'
      );
      html += reasonList(
        'Réserves' + against,
        focus.supporting,
        'reason-note'
      );
    }

    /* Informations sur l'évolution, indépendantes de la comparaison. */
    var notes = [];
    if (result.evolution.available) {
      var evo = result.evolution;
      notes.push(
        'Évolution la plus forte identifiée : ' + evo.best.frName +
        ' (' + evo.condition + '), ' + (evo.bstGain >= 0 ? '+' : '') + evo.bstGain + ' de BST.'
      );
      if (evo.typeChange) notes.push('Changement de type : ' + evo.typeChange + '.');
      if (evo.roleBefore !== evo.roleAfter) {
        notes.push('Changement de rôle : ' + evo.roleBefore + ' → ' + evo.roleAfter + '.');
      }
      if (evo.newAbilities.length) {
        notes.push('Nouveaux talents accessibles : ' +
          evo.newAbilities.map(frAbility).join(', ') + '.');
      }
      notes.push(
        evo.tier.known
          ? 'Viabilité de l\'évolution : tier ' + evo.tier.tier +
            (evo.tier.trusted ? '.' : ' (donnée de confiance moyenne).')
          : 'Viabilité de l\'évolution : inconnue — aucune conclusion n\'en est tirée.'
      );
    }
    if (!result.candidateTier.known) {
      notes.push(
        'Aucun tier fiable pour ' + result.candidate.frName +
        ' : par construction, l\'outil refuse de recommander un remplacement sans cette donnée.'
      );
    }
    html += reasonList('À savoir', notes, 'reason-note');

    return html;
  }

  /* ------------------------------------------------------------------ */
  /* Comparaisons détaillées                                             */
  /* ------------------------------------------------------------------ */

  function figure(label, value) {
    return '<div class="figure"><span class="k">' + escapeHtml(label) +
      '</span><span class="v">' + value + '</span></div>';
  }

  function comparisonHtml(cmp, candidateLabel) {
    var d = cmp.details;
    var deltaCls = d.keyDelta > 0 ? 'delta-up' : d.keyDelta < 0 ? 'delta-down' : 'delta-flat';

    var body = '' +
      '<div class="cmp-body">' +
        '<div class="cmp-figures">' +
          figure('Écart de BST',
            '<span class="' + (d.bstDelta > 0 ? 'delta-up' : d.bstDelta < 0 ? 'delta-down' : 'delta-flat') +
            '">' + (d.bstDelta >= 0 ? '+' : '') + d.bstDelta + '</span>') +
          figure('Stats clés (' + escapeHtml(d.roleMemberLabel) + ')',
            d.keyStatCandidate + ' vs ' + d.keyStatMember) +
          figure('Écart retenu',
            '<span class="' + deltaCls + '">' +
            escapeHtml(analysis.formatPercent(d.keyDelta)) + '</span>') +
          figure('Tiers',
            escapeHtml((d.tierCandidate.tier || '?') + ' vs ' + (d.tierMember.tier || '?'))) +
          (d.movesCandidate && d.movesCandidate.known && d.movesMember && d.movesMember.known
            ? figure('Puissance STAB',
                d.movesCandidate.stabPower + ' vs ' + d.movesMember.stabPower) +
              figure('Couverture',
                d.movesCandidate.coverage + ' vs ' + d.movesMember.coverage + ' types')
            : '') +
        '</div>' +

        (cmp.evidence.length
          ? reasonList('Arguments', cmp.evidence.map(function (e) { return e.text; }), 'reason-pro')
          : '') +
        (cmp.blockers.length
          ? reasonList('Blocages', cmp.blockers.map(function (b) { return b.text; }), 'reason-con')
          : '') +

        '<div class="cmp-columns">' +
          '<div>' +
            '<h4>' + escapeHtml(candidateLabel) + '</h4>' +
            statsHtml(cmp.candidate, cmp.member) +
          '</div>' +
          '<div>' +
            '<h4>' + escapeHtml(cmp.member.frName) + ' — ' +
              escapeHtml(d.roleMemberLabel) + '</h4>' +
            statsHtml(cmp.member) +
          '</div>' +
        '</div>' +
      '</div>';

    /* Quand la comparaison porte sur une forme finale, on rappelle de quel
     * Pokémon de l'équipe il s'agit : « Rocabot → Lougaroc ». */
    var libelleMembre = cmp.memberWillEvolve && cmp.memberNow
      ? cmp.memberNow.frName + ' → ' + cmp.member.frName
      : cmp.member.frName;

    return '' +
      '<details class="cmp"' + (cmp.verdict === 'remplacer' ? ' open' : '') + '>' +
        '<summary>' +
          '<span class="cmp-name">vs ' + escapeHtml(libelleMembre) + '</span>' +
          '<span class="cmp-badge ' + escapeHtml(cmp.verdict) + '">' +
            escapeHtml(
              cmp.verdict === 'remplacer' ? 'Remplacer'
                : cmp.verdict === 'a-tester' ? 'À tester'
                : 'Pas de changement'
            ) +
          '</span>' +
        '</summary>' +
        body +
      '</details>';
  }

  function comparisonsHtml(result) {
    if (!result.comparisons.length) return '';

    var html = '<div class="comparisons">' +
      '<h3>Comparaison membre par membre — ' + escapeHtml(result.candidate.frName) + '</h3>' +
      result.comparisons
        .slice()
        .sort(function (a, b) { return b.margin - a.margin; })
        .map(function (c) { return comparisonHtml(c, result.candidate.frName); })
        .join('') +
      '</div>';

    if (result.evolutionComparisons.length) {
      /* Comparaison à terme : chaque Pokémon est ramené à SA forme finale.
       * Comparer l'évolution du candidat à l'état actuel d'un équipier serait
       * truqué — l'équipier aussi va évoluer. */
      var nomCandidat = result.evolution.available
        ? result.evolution.best.frName
        : result.candidate.frName;

      html += '<div class="comparisons" style="margin-top:20px">' +
        '<h3>Comparaison à terme — chacun sous sa forme finale</h3>' +
        '<p class="cmp-note">Chaque Pokémon est comparé une fois pleinement ' +
          'évolué. Un équipier encore en forme de base est donc jugé sur ce ' +
          'qu’il deviendra, pas sur ce qu’il est aujourd’hui.</p>' +
        result.evolutionComparisons
          .slice()
          .sort(function (a, b) { return b.margin - a.margin; })
          .map(function (c) { return comparisonHtml(c, nomCandidat); })
          .join('') +
        '</div>';
    }

    return html;
  }

  /* ------------------------------------------------------------------ */
  /* Méthode                                                             */
  /* ------------------------------------------------------------------ */

  function methodHtml(result) {
    var t = result.thresholds;
    return '' +
      '<h4>Conditions obligatoires (toutes requises)</h4>' +
      '<ol>' +
        '<li>Le tier du candidat ET celui du membre visé doivent être connus.</li>' +
        '<li>Le candidat doit être pleinement évolué.</li>' +
        '<li>Son tier ne doit pas être inférieur à celui du membre visé.</li>' +
        '<li>Ses stats clés ne doivent être inférieures sous <em>aucune</em> des ' +
          'deux lectures de rôle (celui du membre remplacé et le sien).</li>' +
        '<li>Un total de stats inférieur sans tier supérieur est rédhibitoire ' +
          '(tolérance : ' + t.BST_TOLERANCE + ' points).</li>' +
        '<li>Le remplacement ne doit pas augmenter le nombre de faiblesses ' +
          'critiques de l\'équipe.</li>' +
      '</ol>' +

      '<h4>Faisceau d\'indices (' + t.EVIDENCE_REQUIRED + ' requis pour conclure)</h4>' +
      '<ul>' +
        '<li>Tier nettement supérieur (au moins un cran, donnée fiable des deux côtés).</li>' +
        '<li>Stats clés supérieures d\'au moins ' +
          analysis.formatPercent(t.KEY_STAT_CLEAR_GAIN) + '.</li>' +
        '<li>Total de stats supérieur d\'au moins +' + t.BST_NOTABLE_GAIN + ' de BST.</li>' +
        '<li>Comble une faiblesse critique de l\'équipe que le membre visé ne couvrait pas.</li>' +
      '</ul>' +
      '<p>Avec un seul indice, la conclusion est « à tester, mais pas objectivement ' +
        'meilleur ». Avec zéro, ou dès qu\'une condition obligatoire échoue&nbsp;: ' +
        '« pas de changement recommandé ».</p>' +

      '<h4>Capacités</h4>' +
      '<p>Des statistiques élevées ne servent à rien sans capacité pour les ' +
        'exploiter. Deux indicateurs sont calculés à partir des capacités ' +
        'apprenables en Génération 9&nbsp;:</p>' +
      '<ul>' +
        '<li><strong>Puissance STAB</strong>&nbsp;: meilleure puissance de base ' +
          'parmi les capacités du type du Pokémon, dans sa catégorie offensive ' +
          'dominante. Un attaquant physique sans capacité physique de son type ' +
          'obtient 0 — et le remplacement est alors bloqué.</li>' +
        '<li><strong>Couverture</strong>&nbsp;: nombre de types frappés au moins ' +
          '×2 par ses quatre meilleures capacités. Un Pokémon n\'ayant que quatre ' +
          'emplacements, compter toutes ses capacités surestimerait sa portée.</li>' +
      '</ul>' +
      '<p>Un arsenal nettement plus faible (puissance STAB inférieure de plus de ' +
        '25 points ET couverture moindre) bloque le remplacement, même quand les ' +
        'statistiques brutes sont favorables. Une couverture supérieure d\'au ' +
        'moins 3 types compte comme un indice.</p>' +
      '<p><em>Limite&nbsp;: ces indicateurs mesurent ce qu\'un Pokémon PEUT ' +
        'apprendre, pas les capacités qu\'il porte réellement.</em></p>' +

      '<h4>Pokémon non évolués — la règle de l\'expérience</h4>' +
      '<p>Un Pokémon qui n\'est pas dans l\'équipe ne gagne <strong>aucun point ' +
        'd\'expérience</strong>, donc n\'évoluera jamais. «&nbsp;Il n\'est pas encore ' +
        'évolué&nbsp;» ne peut donc pas servir de motif pour l\'écarter&nbsp;: c\'est au ' +
        'contraire la raison de l\'intégrer.</p>' +
      '<ul>' +
        '<li>Un candidat non évolué est jugé sur sa <strong>forme finale</strong> ' +
          '(Griknot se juge sur Carchacrok, jamais sur Carmache).</li>' +
        '<li><strong>Les équipiers aussi.</strong> Un membre encore en forme de ' +
          'base est comparé sur ce qu’il deviendra, pas sur son état du moment. ' +
          'Sans cela, la comparaison serait truquée&nbsp;: un Khélocrok ' +
          '(→ Torgamord, 485) semblerait écraser un Rocabot (280) alors que ' +
          'Rocabot devient Lougaroc (487), donc plus fort.</li>' +
        '<li>Cette forme finale doit franchir exactement les mêmes conditions ' +
          'obligatoires et le même faisceau d\'indices que n\'importe quel autre ' +
          'candidat. Le potentiel n\'assouplit aucune règle.</li>' +
        '<li>Si elle les franchit, la réponse est «&nbsp;intègre-le maintenant&nbsp;», ' +
          'avec le coût annoncé&nbsp;: équipe temporairement plus faible sur cet ' +
          'emplacement, et condition d\'évolution à remplir.</li>' +
        '<li>Si elle ne les franchit pas, le refus porte sur la forme finale — ' +
          'jamais sur le fait que le Pokémon soit encore une forme de base.</li>' +
      '</ul>' +

      '<h4>Provenance des données</h4>' +
      '<ul>' +
        '<li>Statistiques de base, types, talents, chaînes d\'évolution et table ' +
          'd\'efficacité des types&nbsp;: <strong>PokéAPI</strong>, récupérés en direct.</li>' +
        '<li>Tiers de viabilité&nbsp;: <strong>Smogon</strong> (via <code>@pkmn/dex</code>), ' +
          'recoupés avec la tier list <strong>Game8</strong> du Combat Classé. ' +
          'Les deux classent pour des formats différents et ne sont jamais fusionnés.</li>' +
        '<li>Quand les deux sources divergent d\'au moins deux crans, le tier est ' +
          'marqué «&nbsp;≈&nbsp;»&nbsp;: il peut encore bloquer une recommandation, ' +
          'mais ne peut plus la justifier.</li>' +
        '<li>Aucune donnée n\'est estimée ou inventée. Une information manquante ' +
          'entraîne systématiquement une abstention.</li>' +
      '</ul>';
  }

  PokeStats.ui = {
    escapeHtml: escapeHtml,
    monCard: monCard,
    statsHtml: statsHtml,
    typeChips: typeChips,
    tierBadge: tierBadge,
    teamSummaryHtml: teamSummaryHtml,
    matchupsHtml: matchupsHtml,
    evolutionHtml: evolutionHtml,
    verdictHtml: verdictHtml,
    reasonsHtml: reasonsHtml,
    comparisonsHtml: comparisonsHtml,
    methodHtml: methodHtml
  };
})(typeof window !== 'undefined' ? window : globalThis);
