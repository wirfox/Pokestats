/*
 * js/analysis.js — Moteur de comparaison et de recommandation.
 * ============================================================
 *
 * PRINCIPE DIRECTEUR : la prudence prime sur l'utilité.
 * -----------------------------------------------------
 * Le moteur ne propose un remplacement que lorsqu'il peut le justifier par des
 * données vérifiables. Dans TOUS les autres cas — données manquantes, écarts
 * faibles, tier incertain — il répond « pas de changement recommandé ».
 *
 * Concrètement, une recommandation positive doit franchir DEUX barrières :
 *
 *   1. CONDITIONS OBLIGATOIRES (toutes requises) — un seul échec suffit à
 *      bloquer définitivement la recommandation.
 *   2. FAISCEAU D'INDICES — il faut au moins deux indices indépendants et
 *      objectifs pour conclure « remplace ». Avec un seul indice, la réponse
 *      est « à tester, mais pas objectivement meilleur ».
 *
 * Aucune donnée n'est inventée : tout provient de PokéAPI (stats, types,
 * évolutions) ou de la table de viabilité data/tiers.js, qui distingue
 * explicitement les entrées fiables des entrées incertaines.
 */
(function (root) {
  'use strict';

  var PokeStats = (root.PokeStats = root.PokeStats || {});
  var types = PokeStats.types;

  /* ================================================================== */
  /* Seuils de décision — regroupés ici pour être auditables d'un coup.  */
  /* ================================================================== */

  var THRESHOLDS = {
    /* Écart relatif sur les stats clés à partir duquel on parle d'un gain
     * « net » (et non d'un bruit statistique). 12 % se situe dans la
     * fourchette 10–15 % demandée par le cahier des charges. */
    KEY_STAT_CLEAR_GAIN: 0.12,

    /* En dessous de cet écart absolu de BST, deux Pokémon sont considérés
     * comme équivalents en puissance brute. */
    BST_TOLERANCE: 10,

    /* Gain de BST à partir duquel la puissance brute constitue un indice
     * objectif à part entière. Reste soumis aux conditions obligatoires :
     * un BST supérieur ne suffit jamais seul à déclencher un remplacement. */
    BST_NOTABLE_GAIN: 30,

    /* Nombre minimal de membres faibles à un type pour parler d'une
     * faiblesse critique de l'équipe. */
    TEAM_WEAKNESS_MIN: 3,

    /* Nombre d'indices requis pour recommander un remplacement. */
    EVIDENCE_REQUIRED: 2,

    /* Score de tier (0 = D … 5 = SS) à partir duquel un Pokémon pleinement
     * évolué est jugé « intéressant dans l'absolu ». 2 = tier B. */
    VIABLE_TIER_SCORE: 2,

    /* Score de tier à partir duquel entraîner une évolution vaut clairement
     * le coup. 3 = tier A. */
    WORTH_TRAINING_TIER_SCORE: 3
  };

  /* ================================================================== */
  /* Tiers                                                               */
  /* ================================================================== */

  function tierTable() {
    return root.POKESTATS_TIERS || { scale: {}, entries: {} };
  }

  /**
   * Tier d'un Pokémon. Recherche la forme exacte, puis l'espèce.
   * @returns {{known: boolean, tier: ?string, score: ?number,
   *            confidence: number, trusted: boolean, matchedOn: ?string}}
   *   confidence : 2 = haute (peut justifier), 1 = moyenne (peut seulement bloquer)
   */
  function tierOf(record) {
    var table = tierTable();
    var candidates = [record.slug, record.speciesSlug];
    for (var i = 0; i < candidates.length; i++) {
      var key = candidates[i];
      if (key && table.entries[key]) {
        var entry = table.entries[key];
        var scaleEntry = table.scale[entry[0]];
        return {
          known: true,
          tier: entry[0],
          score: scaleEntry ? scaleEntry.score : null,
          confidence: entry[1],
          trusted: entry[1] >= 2,
          matchedOn: key,
          desc: scaleEntry ? scaleEntry.desc : ''
        };
      }
    }
    return {
      known: false, tier: null, score: null,
      confidence: 0, trusted: false, matchedOn: null, desc: ''
    };
  }

  /* ================================================================== */
  /* Rôles et statistiques clés                                          */
  /* ================================================================== */

  var ROLES = {
    'sweeper-physique': {
      label: 'Sweeper physique',
      keys: ['attack', 'speed'],
      description: 'Mise sur l’Attaque et la Vitesse'
    },
    'sweeper-special': {
      label: 'Sweeper spécial',
      keys: ['special-attack', 'speed'],
      description: 'Mise sur l’Attaque Spéciale et la Vitesse'
    },
    'attaquant-physique': {
      label: 'Attaquant physique',
      keys: ['attack', 'defense', 'hp'],
      description: 'Frappe fort en physique sans être rapide'
    },
    'attaquant-special': {
      label: 'Attaquant spécial',
      keys: ['special-attack', 'special-defense', 'hp'],
      description: 'Frappe fort en spécial sans être rapide'
    },
    'mur': {
      label: 'Mur / Tank',
      keys: ['hp', 'defense', 'special-defense'],
      description: 'Encaisse : PV, Défense et Défense Spéciale'
    },
    'polyvalent': {
      label: 'Polyvalent',
      keys: ['hp', 'attack', 'defense', 'special-attack', 'special-defense', 'speed'],
      description: 'Profil équilibré, jugé sur le total des stats'
    }
  };

  /**
   * Déduit le rôle d'un Pokémon de ses seules stats de base.
   *
   * Les règles sont volontairement ordonnées et chiffrées, donc reproductibles
   * et vérifiables — aucun jugement subjectif n'intervient :
   *
   *   1. Rapide ET offensif                 → sweeper
   *   2. Offense dominante (≥ 110)          → attaquant (même s'il est robuste)
   *   3. Robuste et lent                    → mur / tank
   *   4. Offense correcte (≥ 100)           → attaquant
   *   5. Sinon                              → polyvalent
   *
   * L'ordre compte : un Pokémon comme Scalpereur (135 Att. mais 305 de
   * robustesse) doit être lu comme un attaquant, pas comme un mur.
   */
  function roleOf(record) {
    var s = record.stats;
    var bestOffense = Math.max(s.attack, s['special-attack']);
    var bulk = s.hp + s.defense + s['special-defense'];
    var physical = s.attack >= s['special-attack'];

    if (s.speed >= 90 && bestOffense >= 95) {
      return physical ? 'sweeper-physique' : 'sweeper-special';
    }
    if (bestOffense >= 110) {
      return physical ? 'attaquant-physique' : 'attaquant-special';
    }
    if (bulk >= 280 && s.speed < 80) {
      return 'mur';
    }
    if (bestOffense >= 100) {
      return physical ? 'attaquant-physique' : 'attaquant-special';
    }
    return 'polyvalent';
  }

  /** Somme des stats clés d'un rôle donné, pour un Pokémon donné. */
  function keyStatValue(record, roleId) {
    var role = ROLES[roleId] || ROLES.polyvalent;
    return role.keys.reduce(function (sum, k) { return sum + (record.stats[k] || 0); }, 0);
  }

  /** Écart relatif des stats clés de `a` par rapport à `b`, sous un rôle donné. */
  function keyStatDelta(a, b, roleId) {
    var va = keyStatValue(a, roleId);
    var vb = keyStatValue(b, roleId);
    if (!vb) return 0;
    return (va - vb) / vb;
  }

  /* ================================================================== */
  /* Analyse de type de l'équipe                                         */
  /* ================================================================== */

  /**
   * Compte, pour chaque type attaquant, combien de membres de l'équipe y sont
   * faibles, et en déduit les faiblesses critiques.
   *
   * @param {Array} members fiches Pokémon
   * @returns {{weakCount: Object, criticalWeaknesses: string[], size: number}}
   */
  function teamTypeProfile(members) {
    var list = (members || []).filter(Boolean);
    var weakCount = Object.create(null);
    var resistCount = Object.create(null);

    types.allTypes().forEach(function (t) {
      weakCount[t] = 0;
      resistCount[t] = 0;
    });

    list.forEach(function (m) {
      types.allTypes().forEach(function (t) {
        var mult = types.effectiveness(t, m.types);
        if (mult > 1) weakCount[t] += 1;
        if (mult < 1) resistCount[t] += 1;
      });
    });

    var threshold = Math.max(THRESHOLDS.TEAM_WEAKNESS_MIN, Math.ceil(list.length / 2));
    var critical = types.allTypes().filter(function (t) {
      return weakCount[t] >= threshold;
    });

    return {
      size: list.length,
      weakCount: weakCount,
      resistCount: resistCount,
      threshold: threshold,
      criticalWeaknesses: critical
    };
  }

  /** Nombre de faiblesses critiques d'une composition donnée. */
  function criticalCount(members) {
    return teamTypeProfile(members).criticalWeaknesses.length;
  }

  /* ================================================================== */
  /* Comparaison d'un candidat avec UN membre de l'équipe                */
  /* ================================================================== */

  /**
   * @param {Object} candidate fiche du Pokémon envisagé
   * @param {Object} member    fiche du membre potentiellement remplacé
   * @param {Array}  team      équipe complète (le membre inclus)
   * @returns {Object} verdict détaillé et traçable
   */
  function comparePair(candidate, member, team) {
    var tc = tierOf(candidate);
    var tm = tierOf(member);

    var roleMember = roleOf(member);
    var roleCandidate = roleOf(candidate);

    /* On mesure l'écart sous DEUX angles : le rôle du membre remplacé (le
     * candidat doit tenir son poste) et le rôle naturel du candidat. On retient
     * le plus défavorable : un gain doit être vrai dans les deux lectures. */
    var deltaOnMemberRole = keyStatDelta(candidate, member, roleMember);
    var deltaOnCandidateRole = keyStatDelta(candidate, member, roleCandidate);
    var keyDelta = Math.min(deltaOnMemberRole, deltaOnCandidateRole);

    var bstDelta = candidate.bst - member.bst;

    /* Effet du remplacement sur la couverture de types de l'équipe. */
    var profileBefore = teamTypeProfile(team);
    var teamAfter = team.map(function (m) { return m === member ? candidate : m; });
    var profileAfter = teamTypeProfile(teamAfter);

    var strategicGain = profileBefore.criticalWeaknesses.filter(function (t) {
      var candidateResists = types.effectiveness(t, candidate.types) < 1;
      var memberResists = types.effectiveness(t, member.types) < 1;
      return candidateResists && !memberResists;
    });

    var worsensTeam = profileAfter.criticalWeaknesses.length > profileBefore.criticalWeaknesses.length;

    var candidateIsNFE = !!(candidate.evolution && candidate.evolution.canEvolve);

    /* ---------------- Conditions obligatoires ---------------- */
    var blockers = [];

    if (!tc.known || !tm.known) {
      blockers.push({
        code: 'tier-inconnu',
        text:
          'Tier inconnu pour ' +
          (!tc.known ? candidate.frName : member.frName) +
          ' : sans donnée de viabilité fiable, aucun remplacement n’est proposé.'
      });
    }

    if (candidateIsNFE) {
      blockers.push({
        code: 'non-evolue',
        text:
          candidate.frName +
          ' n’est pas pleinement évolué : il ne peut pas remplacer un membre ' +
          'de l’équipe en l’état.'
      });
    }

    if (tc.known && tm.known && tc.score < tm.score) {
      blockers.push({
        code: 'tier-inferieur',
        text:
          'Tier ' + tc.tier + ' contre ' + tm.tier + ' pour ' + member.frName +
          ' : le candidat est classé en dessous.'
      });
    }

    if (keyDelta < 0) {
      blockers.push({
        code: 'stats-cles-inferieures',
        text:
          'Stats clés inférieures (' + formatPercent(keyDelta) + ' sur le profil ' +
          ROLES[keyDelta === deltaOnMemberRole ? roleMember : roleCandidate].label.toLowerCase() + ').'
      });
    }

    /* Règle explicite du cahier des charges : BST plus faible ET tier non
     * supérieur ⇒ blocage sec. */
    if (bstDelta < 0 && tc.known && tm.known && tc.score <= tm.score) {
      blockers.push({
        code: 'bst-et-tier-inferieurs',
        text:
          'Total de stats inférieur (' + bstDelta + ') sans tier supérieur pour compenser.'
      });
    }

    /* Cas résiduel : BST nettement inférieur alors que le tier est inconnu
     * (la règle précédente ne s'applique pas faute de tiers comparables). */
    if (bstDelta < -THRESHOLDS.BST_TOLERANCE &&
        !blockers.some(function (b) { return b.code === 'bst-et-tier-inferieurs'; }) &&
        !(tc.known && tm.known && tc.score > tm.score)) {
      blockers.push({
        code: 'bst-inferieur',
        text: 'Total de stats nettement inférieur (' + bstDelta + ').'
      });
    }

    if (worsensTeam) {
      blockers.push({
        code: 'aggrave-equipe',
        text:
          'Ce remplacement augmenterait le nombre de faiblesses critiques de l’équipe (' +
          profileBefore.criticalWeaknesses.length + ' → ' +
          profileAfter.criticalWeaknesses.length + ').'
      });
    }

    /* ---------------- Faisceau d'indices ---------------- */
    var evidence = [];
    var tierJustifiable = tc.known && tm.known && tc.trusted && tm.trusted;

    if (tierJustifiable && tc.score - tm.score >= 1) {
      evidence.push({
        code: 'tier-superieur',
        text: 'Tier nettement supérieur : ' + tm.tier + ' → ' + tc.tier + '.'
      });
    }

    if (keyDelta >= THRESHOLDS.KEY_STAT_CLEAR_GAIN) {
      evidence.push({
        code: 'stats-cles-superieures',
        text:
          'Stats clés supérieures de ' + formatPercent(keyDelta) +
          ' (seuil retenu : ' + formatPercent(THRESHOLDS.KEY_STAT_CLEAR_GAIN) + ').'
      });
    }

    if (strategicGain.length > 0) {
      evidence.push({
        code: 'couverture-type',
        text:
          'Comble une faiblesse critique de l’équipe : ' +
          strategicGain.map(types.frType).join(', ') + '.'
      });
    }

    if (bstDelta >= THRESHOLDS.BST_NOTABLE_GAIN) {
      evidence.push({
        code: 'bst-superieur',
        text:
          'Total de stats nettement supérieur : +' + bstDelta + ' de BST ' +
          '(seuil retenu : +' + THRESHOLDS.BST_NOTABLE_GAIN + ').'
      });
    }

    /* Arguments d'appoint : ils enrichissent l'explication mais ne comptent
     * jamais comme un indice décisif. */
    var supporting = [];
    if (tc.known && tm.known && tc.score > tm.score && !tierJustifiable) {
      supporting.push(
        'Tier apparemment supérieur (' + tm.tier + ' → ' + tc.tier + '), mais la donnée ' +
        'de viabilité est de confiance moyenne : elle n’est pas retenue comme preuve.'
      );
    }

    /* ---------------- Verdict ---------------- */
    var verdict;
    if (blockers.length > 0) {
      verdict = 'aucun-changement';
    } else if (evidence.length >= THRESHOLDS.EVIDENCE_REQUIRED) {
      verdict = 'remplacer';
    } else if (evidence.length === 1) {
      verdict = 'a-tester';
    } else {
      verdict = 'aucun-changement';
    }

    /* Marge purement indicative : sert à classer les comparaisons entre elles,
     * jamais à décider. */
    var margin =
      (tc.known && tm.known ? (tc.score - tm.score) : 0) +
      keyDelta * 10 +
      strategicGain.length * 0.5;

    return {
      candidate: candidate,
      member: member,
      verdict: verdict,
      blockers: blockers,
      evidence: evidence,
      supporting: supporting,
      margin: margin,
      details: {
        tierCandidate: tc,
        tierMember: tm,
        roleMember: roleMember,
        roleCandidate: roleCandidate,
        roleMemberLabel: ROLES[roleMember].label,
        roleCandidateLabel: ROLES[roleCandidate].label,
        keyDelta: keyDelta,
        deltaOnMemberRole: deltaOnMemberRole,
        deltaOnCandidateRole: deltaOnCandidateRole,
        keyStatCandidate: keyStatValue(candidate, roleMember),
        keyStatMember: keyStatValue(member, roleMember),
        bstDelta: bstDelta,
        strategicGain: strategicGain,
        criticalBefore: profileBefore.criticalWeaknesses,
        criticalAfter: profileAfter.criticalWeaknesses
      }
    };
  }

  function formatPercent(ratio) {
    var pct = ratio * 100;
    var sign = pct > 0 ? '+' : '';
    return sign + pct.toFixed(1).replace('.', ',') + ' %';
  }

  /* ================================================================== */
  /* Évaluation de l'évolution                                           */
  /* ================================================================== */

  /**
   * Choisit la meilleure évolution atteignable et mesure le gain.
   * « Meilleure » = tier le plus haut à confiance haute, sinon BST le plus élevé.
   */
  function evaluateEvolution(record) {
    var evo = record.evolution || {};
    if (!evo.loaded) {
      return {
        available: false,
        reason: 'donnees-indisponibles',
        text:
          'La chaîne d’évolution n’a pas pu être récupérée : aucune conclusion ' +
          'n’est tirée sur une éventuelle évolution.'
      };
    }
    if (!evo.canEvolve || !evo.nextForms.length) {
      return { available: false, reason: 'aucune-evolution', text: null };
    }

    var ranked = evo.nextForms.slice().sort(function (a, b) {
      var ta = tierOf(a);
      var tb = tierOf(b);
      var sa = ta.trusted && ta.score != null ? ta.score : -1;
      var sb = tb.trusted && tb.score != null ? tb.score : -1;
      if (sb !== sa) return sb - sa;
      return b.bst - a.bst;
    });

    var best = ranked[0];
    var bestTier = tierOf(best);
    var roleBase = roleOf(record);
    var roleEvo = roleOf(best);

    var typeChange =
      best.types.join('/') !== record.types.join('/')
        ? record.types.map(types.frType).join(' / ') + ' → ' + best.types.map(types.frType).join(' / ')
        : null;

    /* Un entraînement « vaut clairement le coup » si l'évolution est bien
     * classée avec une donnée fiable. Sinon on reste factuel sur les gains
     * chiffrés sans trancher. */
    var worthTraining = bestTier.known && bestTier.trusted &&
      bestTier.score >= THRESHOLDS.WORTH_TRAINING_TIER_SCORE;

    return {
      available: true,
      best: best,
      alternatives: ranked.slice(1),
      tier: bestTier,
      bstGain: best.bst - record.bst,
      keyGainOnBaseRole: keyStatDelta(best, record, roleBase),
      keyGainOnEvoRole: keyStatDelta(best, record, roleEvo),
      roleBefore: ROLES[roleBase].label,
      roleAfter: ROLES[roleEvo].label,
      typeChange: typeChange,
      condition: best.evolutionCondition || 'Condition inconnue',
      worthTraining: worthTraining,
      newAbilities: best.abilities
        .map(function (a) { return a.slug; })
        .filter(function (slug) {
          return !record.abilities.some(function (b) { return b.slug === slug; });
        })
    };
  }

  /* ================================================================== */
  /* Évaluation globale                                                  */
  /* ================================================================== */

  /**
   * Analyse complète : le candidat (et son évolution) face à l'équipe.
   *
   * @param {Object} input
   * @param {Array}  input.team      fiches de l'équipe (0 à 6, sans trous)
   * @param {Object} input.candidate fiche du Pokémon capturé
   * @returns {Object} résultat structuré, directement affichable
   */
  function evaluate(input) {
    var team = (input.team || []).filter(Boolean);
    var candidate = input.candidate;

    var teamProfile = teamTypeProfile(team);
    var candidateTier = tierOf(candidate);
    var evolution = evaluateEvolution(candidate);

    /* --- Comparaisons du candidat tel quel --- */
    var comparisons = team.map(function (m) { return comparePair(candidate, m, team); });

    /* --- Comparaisons de l'évolution, si elle existe --- */
    var evolutionComparisons = [];
    if (evolution.available) {
      /* L'évolution héritant de la chaîne, on la traite comme pleinement
       * évoluée seulement si elle n'évolue pas elle-même à son tour. On ne
       * dispose pas toujours de cette information : dans le doute, on la
       * considère comme finale uniquement si aucune forme suivante n'est
       * listée après elle dans la chaîne. */
      var deeper = (candidate.evolution.nextForms || []).some(function (f) {
        return f.evolutionDepth > evolution.best.evolutionDepth;
      });
      var evoRecord = Object.assign({}, evolution.best, {
        evolution: { canEvolve: deeper, nextForms: [], stages: [], loaded: true }
      });
      evolutionComparisons = team.map(function (m) { return comparePair(evoRecord, m, team); });
      evolution.record = evoRecord;
    }

    function bestOf(list) {
      var replaceables = list.filter(function (c) { return c.verdict === 'remplacer'; });
      if (replaceables.length) {
        /* On vise le membre le plus faible que le candidat dépasse, c'est-à-dire
         * celui pour lequel la marge est la plus grande. */
        return replaceables.sort(function (a, b) { return b.margin - a.margin; })[0];
      }
      var testables = list.filter(function (c) { return c.verdict === 'a-tester'; });
      if (testables.length) {
        return testables.sort(function (a, b) { return b.margin - a.margin; })[0];
      }
      return null;
    }

    var bestNow = bestOf(comparisons);
    var bestEvolved = bestOf(evolutionComparisons);

    var hasFreeSlot = team.length < 6;

    /* --- Viabilité dans l'absolu (utile quand un slot est libre) --- */
    var viableOnItsOwn =
      candidateTier.known &&
      candidateTier.score >= THRESHOLDS.VIABLE_TIER_SCORE &&
      !(candidate.evolution && candidate.evolution.canEvolve);

    /* --- Message de synthèse --- */
    var headline = buildHeadline({
      candidate: candidate,
      candidateTier: candidateTier,
      team: team,
      hasFreeSlot: hasFreeSlot,
      bestNow: bestNow,
      bestEvolved: bestEvolved,
      evolution: evolution,
      viableOnItsOwn: viableOnItsOwn
    });

    return {
      candidate: candidate,
      candidateTier: candidateTier,
      candidateRole: roleOf(candidate),
      candidateRoleLabel: ROLES[roleOf(candidate)].label,
      team: team,
      teamProfile: teamProfile,
      comparisons: comparisons,
      evolution: evolution,
      evolutionComparisons: evolutionComparisons,
      bestNow: bestNow,
      bestEvolved: bestEvolved,
      hasFreeSlot: hasFreeSlot,
      viableOnItsOwn: viableOnItsOwn,
      headline: headline,
      thresholds: THRESHOLDS
    };
  }

  /**
   * Construit la conclusion en français.
   * `status` ∈ {'remplacer', 'ajouter', 'entrainer', 'a-tester', 'non-recommande', 'indetermine'}
   */
  function buildHeadline(ctx) {
    var name = ctx.candidate.frName;

    /* Équipe vide : rien à comparer. */
    if (!ctx.team.length) {
      return {
        status: 'indetermine',
        title: 'Ajoute d’abord au moins un Pokémon à ton équipe',
        text:
          'Sans équipe de référence, aucune comparaison n’est possible. ' +
          'Les statistiques de ' + name + ' sont affichées à titre informatif.'
      };
    }

    var outclasses = ctx.bestNow && ctx.bestNow.verdict === 'remplacer'
      ? ctx.bestNow.member
      : null;

    /* 1. Une place est libre : inutile de sacrifier qui que ce soit.
     *    C'est toujours l'option la moins risquée, donc la première proposée. */
    if (ctx.hasFreeSlot && (ctx.viableOnItsOwn || outclasses)) {
      return {
        status: 'ajouter',
        title:
          'Ton équipe a une place libre et ' + name + ' est un choix valable.',
        text:
          'Aucun remplacement n’est nécessaire : place ' + name +
          (ctx.candidateTier.known ? ' (tier ' + ctx.candidateTier.tier + ')' : '') +
          ' dans un emplacement vacant.' +
          (outclasses
            ? ' À noter : il dépasse aussi ' + outclasses.frName +
              ', que tu pourras écarter plus tard si tu manques de place.'
            : ''),
        target: outclasses
      };
    }

    /* 2. Le candidat, tel quel, dépasse clairement un membre. */
    if (outclasses) {
      return {
        status: 'remplacer',
        title:
          name + ' est objectivement plus fort que ' + outclasses.frName +
          ' dans ton équipe.',
        text:
          'Le remplacement de ' + outclasses.frName + ' par ' + name +
          ' est recommandé : les critères de supériorité sont réunis et vérifiés.',
        target: outclasses
      };
    }

    /* 3. Le candidat n'est pas encore prêt, mais son évolution passe la barre. */
    if (ctx.bestEvolved && ctx.bestEvolved.verdict === 'remplacer') {
      return {
        status: 'entrainer',
        title:
          'Garde ' + name + ' et entraîne-le : son évolution ' +
          ctx.evolution.best.frName + ' vaut le coup.',
        text:
          'En l’état, ' + name + ' ne surpasse aucun membre de ton équipe. En revanche, ' +
          'une fois évolué en ' + ctx.evolution.best.frName + ' (' + ctx.evolution.condition +
          '), il devient objectivement supérieur à ' + ctx.bestEvolved.member.frName + '.',
        target: ctx.bestEvolved.member
      };
    }

    /* 4. Évolution prometteuse sans supériorité démontrée. */
    if (ctx.evolution.available && ctx.evolution.worthTraining) {
      return {
        status: 'entrainer',
        title:
          name + ' n’est pas meilleur que ton équipe actuelle, mais son évolution est solide.',
        text:
          'Son évolution ' + ctx.evolution.best.frName + ' est classée tier ' +
          ctx.evolution.tier.tier + '. L’entraîner peut valoir le coup, même si aucun ' +
          'remplacement immédiat n’est justifié par les données.'
      };
    }

    /* 5. Un seul indice : intéressant, mais pas démontré. */
    var testable = ctx.bestNow || ctx.bestEvolved;
    if (testable && testable.verdict === 'a-tester') {
      return {
        status: 'a-tester',
        title:
          name + ' est intéressant, mais pas clairement meilleur que ton équipe actuelle.',
        text:
          'À tester en combat face à ' + testable.member.frName + ', mais les données ' +
          'ne suffisent pas à affirmer qu’il est objectivement supérieur. ' +
          'Pas de changement recommandé.',
        target: testable.member
      };
    }

    /* 6. Cas par défaut : on ne recommande rien. */
    var reasonSample = null;
    if (ctx.candidate.evolution && ctx.candidate.evolution.canEvolve) {
      reasonSample = name + ' n’est pas encore pleinement évolué.';
    } else if (!ctx.candidateTier.known) {
      reasonSample =
        'Aucune donnée de viabilité fiable n’est disponible pour ' + name +
        ' : par prudence, aucun changement n’est proposé.';
    }

    return {
      status: 'non-recommande',
      title:
        name + ' n’est pas recommandé pour ton équipe actuelle.',
      text:
        (reasonSample ? reasonSample + ' ' : '') +
        'Aucun membre de ton équipe n’est objectivement dépassé par ' + name + '. ' +
        'Pas de changement recommandé.'
    };
  }

  PokeStats.analysis = {
    THRESHOLDS: THRESHOLDS,
    ROLES: ROLES,
    tierOf: tierOf,
    roleOf: roleOf,
    keyStatValue: keyStatValue,
    keyStatDelta: keyStatDelta,
    teamTypeProfile: teamTypeProfile,
    criticalCount: criticalCount,
    comparePair: comparePair,
    evaluateEvolution: evaluateEvolution,
    evaluate: evaluate,
    formatPercent: formatPercent
  };
})(typeof window !== 'undefined' ? window : globalThis);
