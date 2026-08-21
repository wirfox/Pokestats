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
    WORTH_TRAINING_TIER_SCORE: 3,

    /* Rapport de rendement offensif en dessous duquel l'arsenal devient
     * handicapant. 0,8 = le candidat frappe au moins 20 % moins fort que le
     * membre visé, tous facteurs combinés. */
    OFFENSIVE_OUTPUT_RATIO: 0.8,

    /* Gain de couverture offensive constituant un indice à part entière :
     * frapper 3 types de plus au moins ×2 change réellement les combats. */
    COVERAGE_CLEAR_GAIN: 3
  };

  /* ================================================================== */
  /* Tiers                                                               */
  /* ================================================================== */

  function tierTable() {
    return root.POKESTATS_TIERS || { scale: {}, entries: {} };
  }

  /**
   * Fiche d'une espèce dans la génération sélectionnée, ou null.
   *
   * Les tiers, les statistiques et les capacités dépendent de la génération :
   * Carchacrok n'est pas classé pareil en 4G et en 9G, et Glaivodo n'existe
   * pas avant la 9G. Quand un jeu est choisi, ses données priment.
   */
  function genEntry(record) {
    var data = PokeStats.game && PokeStats.game.genData && PokeStats.game.genData();
    if (!data || !data.species) return null;
    return data.species[record.slug] || data.species[record.speciesSlug] || null;
  }

  /**
   * Tier d'un Pokémon. Recherche la forme exacte, puis l'espèce.
   * @returns {{known: boolean, tier: ?string, score: ?number,
   *            confidence: number, trusted: boolean, matchedOn: ?string}}
   *   confidence : 2 = haute (peut justifier), 1 = moyenne (peut seulement bloquer)
   */
  function tierOf(record) {
    /* Génération sélectionnée : sa donnée fait foi. */
    var fromGen = genEntry(record);
    if (fromGen) {
      if (!fromGen.r) {
        return { known: false, tier: null, score: null, confidence: 0,
                 trusted: false, matchedOn: null, desc: '', fromGeneration: true };
      }
      var scaleGen = tierTable().scale[fromGen.r];
      return {
        known: true, tier: fromGen.r,
        score: scaleGen ? scaleGen.score : null,
        confidence: 2, trusted: true,
        matchedOn: record.slug, desc: scaleGen ? scaleGen.desc : '',
        fromGeneration: true
      };
    }

    var table = tierTable();
    var candidates = [record.slug, record.speciesSlug];
    for (var i = 0; i < candidates.length; i++) {
      var key = candidates[i];
      if (key && table.entries[key]) {
        var entry = table.entries[key];
        var scaleEntry = table.scale[entry[0]];
        var second = entry[2] || null;   // tier Game8, quand il existe
        return {
          known: true,
          tier: entry[0],
          score: scaleEntry ? scaleEntry.score : null,
          confidence: entry[1],
          trusted: entry[1] >= 2,
          /* Second avis (Game8, Combat Classé). Un désaccord marqué avec
           * Smogon a déjà fait tomber `confidence` à 1 à la génération : le
           * tier ne peut alors plus justifier une recommandation. */
          secondOpinion: second,
          disagrees: !!second && entry[1] < 2,
          matchedOn: key,
          desc: scaleEntry ? scaleEntry.desc : ''
        };
      }
    }
    return {
      known: false, tier: null, score: null,
      confidence: 0, trusted: false, secondOpinion: null, disagrees: false,
      matchedOn: null, desc: ''
    };
  }

  /* ================================================================== */
  /* Capacités                                                           */
  /* ================================================================== */

  /**
   * Indicateurs de capacités d'un Pokémon (voir data/moves.js).
   *
   * Un Pokémon peut être statistiquement supérieur et pourtant inutilisable :
   * 130 d'Attaque ne servent à rien sans capacité physique correcte. Ces
   * indicateurs permettent au moteur de le détecter.
   *
   * @returns {{known: boolean, stabPower: number, category: ?string,
   *            coverage: number, moves: string[]}}
   *   known=false quand la donnée manque : le moteur n'en tire alors AUCUNE
   *   conclusion, ni blocage ni indice.
   */
  function movesOf(record) {
    var fromGen = genEntry(record);
    if (fromGen) {
      /* L'espèce existe dans cette génération : ses capacités d'alors font foi. */
      if (!fromGen.m) {
        return { known: false, stabPower: 0, category: null, coverage: 0,
                 moves: [], fromGeneration: true };
      }
      return {
        known: true, stabPower: fromGen.m[0], category: fromGen.m[1],
        coverage: fromGen.m[2], moves: fromGen.m[3] || [], fromGeneration: true
      };
    }

    var table = root.POKESTATS_MOVES;
    if (!table || !table.byPokemon) {
      return { known: false, stabPower: 0, category: null, coverage: 0, moves: [] };
    }
    var entry = table.byPokemon[record.slug] || table.byPokemon[record.speciesSlug];
    if (!entry) {
      return { known: false, stabPower: 0, category: null, coverage: 0, moves: [] };
    }
    return {
      known: true,
      stabPower: entry[0],
      category: entry[1],
      coverage: entry[2],
      moves: entry[3] || []
    };
  }

  /**
   * Rendement offensif : puissance STAB effective × stat d'attaque concernée.
   *
   * Comparer les puissances de capacités sans la stat qui les porte est
   * trompeur : Flotte-Mèche (95 de puissance, 135 d'Att. Spé.) frappe aussi
   * fort que Flâmigator (117 de puissance, 110 d'Att. Spé.). Le produit est
   * un indicateur de dégâts autrement plus fidèle que l'un ou l'autre seul.
   *
   * @returns {number} 0 si la donnée manque ou si aucune STAB n'est utilisable
   */
  function offensiveOutput(record, moves) {
    var info = moves || movesOf(record);
    if (!info.known || !info.stabPower) return 0;
    var stat = info.category === 'phy'
      ? record.stats.attack
      : record.stats['special-attack'];
    return info.stabPower * stat;
  }

  /** Détail d'une capacité : nom français, type, catégorie, puissance. */
  function moveInfo(slug) {
    var data = PokeStats.game && PokeStats.game.genData && PokeStats.game.genData();
    var m = (data && data.moves && data.moves[slug]) || null;
    var table = root.POKESTATS_MOVES;
    if (!m) m = table && table.moves && table.moves[slug];
    if (!m) return { slug: slug, name: slug.replace(/-/g, ' '), type: null, category: null, power: 0 };
    return { slug: slug, name: m[0], type: m[1], category: m[2], power: m[3] };
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
          'En l’état, ' + candidate.frName + ' est encore une forme non évoluée : ' +
          'c’est son évolution qu’il faut comparer (voir plus bas), pas ses stats actuelles.'
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

    /* ---- Capacités ----
     * On ne conclut que si les deux Pokémon ont des données : une information
     * manquante ne doit ni bloquer ni justifier. */
    var mc = movesOf(candidate);
    var mm = movesOf(member);
    var movesComparable = mc.known && mm.known;

    if (movesComparable && mc.stabPower === 0) {
      blockers.push({
        code: 'aucune-stab',
        text:
          candidate.frName + ' n’apprend aucune capacité offensive de son type ' +
          'dans sa catégorie dominante : ses statistiques d’attaque sont ' +
          'inexploitables.'
      });
    }

    /* Le cas que cette règle attrape : des stats clés supérieures sur le
     * papier, mais un arsenal qui ne suit pas. On raisonne sur le RENDEMENT
     * (puissance × stat d'attaque) et non sur la puissance seule, sinon un
     * Pokémon très fort mais aux capacités modestes serait écarté à tort. */
    var outputC = offensiveOutput(candidate, mc);
    var outputM = offensiveOutput(member, mm);
    if (movesComparable && mc.stabPower > 0 && outputM > 0 &&
        outputC < outputM * THRESHOLDS.OFFENSIVE_OUTPUT_RATIO &&
        mc.coverage < mm.coverage) {
      blockers.push({
        code: 'moveset-plus-faible',
        text:
          'Rendement offensif nettement inférieur : ' +
          Math.round((outputC / outputM) * 100) + ' % de celui de ' +
          member.frName + ' (puissance STAB ' + mc.stabPower + ' contre ' +
          mm.stabPower + ', couverture ' + mc.coverage + ' contre ' +
          mm.coverage + ' types). L’avantage de statistiques ne compense pas ' +
          'ce déficit.'
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

    if (movesComparable && mc.coverage >= mm.coverage + THRESHOLDS.COVERAGE_CLEAR_GAIN) {
      evidence.push({
        code: 'couverture-offensive',
        text:
          'Couverture offensive supérieure : frappe ' + mc.coverage +
          ' types au moins ×2, contre ' + mm.coverage + ' pour ' +
          member.frName + '.'
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
      var raison = tc.disagrees || tm.disagrees
        ? 'les deux tier lists de référence sont en désaccord marqué sur ce Pokémon'
        : 'la donnée de viabilité est de confiance moyenne';
      supporting.push(
        'Tier apparemment supérieur (' + tm.tier + ' → ' + tc.tier + '), mais ' +
        raison + ' : il n’est pas retenu comme preuve.'
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
        criticalAfter: profileAfter.criticalWeaknesses,
        movesCandidate: mc,
        movesMember: mm,
        outputCandidate: outputC,
        outputMember: outputM
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

    /* Classement des évolutions atteignables. Une FORME TERMINALE passe
     * toujours devant une forme intermédiaire : c'est elle qui représente le
     * potentiel réel du Pokémon (Griknot se juge sur Carchacrok, jamais sur
     * Carmache). À égalité, on départage par le tier fiable puis par le BST. */
    /* Une évolution qui n'existe pas dans le jeu choisi n'est pas un objectif
     * atteignable : Nymphali ne sert à rien à un joueur de Noir/Blanc. */
    var reachable = evo.nextForms.filter(function (f) {
      return f.existsInGame !== false;
    });
    if (!reachable.length) {
      return {
        available: false,
        reason: 'hors-jeu',
        text:
          'Aucune de ses évolutions n’existe dans le jeu sélectionné : ' +
          'aucune conclusion n’en est tirée.'
      };
    }

    var ranked = reachable.slice().sort(function (a, b) {
      if (!!b.isTerminal !== !!a.isTerminal) return b.isTerminal ? 1 : -1;
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
     * chiffrés sans trancher. (evaluate() peut aussi activer ce drapeau si
     * l'évolution dépasse démontrablement un membre de l'équipe.) */
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

  /**
   * Forme finale d'un Pokémon : sa meilleure évolution terminale, ou lui-même
   * s'il est déjà pleinement évolué.
   *
   * POURQUOI C'EST INDISPENSABLE
   * ----------------------------
   * Comparer la forme finale d'un candidat à la forme ACTUELLE d'un membre est
   * une comparaison truquée : le membre aussi va évoluer. Sans ce correctif,
   * l'outil conseillait d'échanger un Rocabot (280) contre un Khélocrok au
   * motif qu'il deviendrait Torgamord (485) — en oubliant que Rocabot devient
   * Lougaroc (487), donc meilleur.
   *
   * On compare donc toujours potentiel contre potentiel.
   *
   * @returns {{record: Object, willEvolve: boolean, evolution: Object}}
   */
  function finalFormOf(record) {
    var evo = evaluateEvolution(record);
    if (!evo.available) {
      return { record: record, willEvolve: false, evolution: evo };
    }
    /* La forme retenue est terminale dans la quasi-totalité des cas ; si la
     * chaîne est partielle, on la signale comme pouvant encore évoluer. */
    var evolved = Object.assign({}, evo.best, {
      evolution: {
        canEvolve: !evo.best.isTerminal,
        nextForms: [], stages: [], loaded: true
      }
    });
    return { record: evolved, willEvolve: true, evolution: evo };
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
    var candidateMoves = movesOf(candidate);
    var evolution = evaluateEvolution(candidate);

    /* --- Comparaisons du candidat tel quel --- */
    var comparisons = team.map(function (m) { return comparePair(candidate, m, team); });

    /* --- Comparaisons « à terme » : forme finale contre forme finale ---
     *
     * Chaque membre est ramené à SA propre forme finale, pas à son état du
     * moment. C'est la seule comparaison honnête : un Rocabot dans l'équipe
     * deviendra Lougaroc, et un candidat doit dépasser Lougaroc — pas Rocabot.
     */
    var candidateFinal = finalFormOf(candidate);
    var teamFinals = team.map(finalFormOf);
    var teamPotential = teamFinals.map(function (f) { return f.record; });

    var somethingEvolves = candidateFinal.willEvolve ||
      teamFinals.some(function (f) { return f.willEvolve; });

    var evolutionComparisons = [];
    if (somethingEvolves) {
      evolutionComparisons = teamPotential.map(function (finalMember, index) {
        var cmp = comparePair(candidateFinal.record, finalMember, teamPotential);
        /* On conserve le lien vers les Pokémon tels que l'utilisateur les
         * connaît aujourd'hui, pour pouvoir les nommer dans les messages. */
        cmp.memberNow = team[index];
        cmp.memberWillEvolve = teamFinals[index].willEvolve;
        cmp.candidateNow = candidate;
        cmp.candidateWillEvolve = candidateFinal.willEvolve;
        return cmp;
      });
      if (candidateFinal.willEvolve) evolution.record = candidateFinal.record;
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

    var candidateIsNFE = !!(candidate.evolution && candidate.evolution.canEvolve);

    /* --- Viabilité dans l'absolu (utile quand un slot est libre) ---
     *
     * Un Pokémon non évolué ne gagne de l'expérience QUE s'il est dans
     * l'équipe : sa valeur se juge donc sur sa forme finale, pas sur ses stats
     * du moment. On distingue les deux lectures pour pouvoir l'expliquer.
     */
    var viableNow =
      candidateTier.known &&
      candidateTier.score >= THRESHOLDS.VIABLE_TIER_SCORE &&
      !candidateIsNFE;

    var evolutionTier = evolution.available ? evolution.tier : null;
    var viableAfterEvolution =
      !!evolutionTier && evolutionTier.known &&
      evolutionTier.score >= THRESHOLDS.VIABLE_TIER_SCORE;

    var viableOnItsOwn = viableNow || viableAfterEvolution;

    /* L'évolution dépasse-t-elle démontrablement un membre de l'équipe ?
     * Si oui, l'entraîner n'est plus un pari : c'est un investissement chiffré. */
    if (evolution.available && bestEvolved && bestEvolved.verdict === 'remplacer') {
      evolution.worthTraining = true;
    }

    /* --- Message de synthèse --- */
    var headline = buildHeadline({
      candidate: candidate,
      candidateTier: candidateTier,
      candidateIsNFE: candidateIsNFE,
      team: team,
      hasFreeSlot: hasFreeSlot,
      bestNow: bestNow,
      bestEvolved: bestEvolved,
      evolutionComparisons: evolutionComparisons,
      evolution: evolution,
      viableNow: viableNow,
      viableAfterEvolution: viableAfterEvolution,
      viableOnItsOwn: viableOnItsOwn
    });

    return {
      candidate: candidate,
      candidateTier: candidateTier,
      candidateMoves: candidateMoves,
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
      candidateIsNFE: candidateIsNFE,
      viableNow: viableNow,
      viableAfterEvolution: viableAfterEvolution,
      viableOnItsOwn: viableOnItsOwn,
      headline: headline,
      thresholds: THRESHOLDS
    };
  }

  /**
   * Construit la conclusion en français.
   *
   * ORDRE DE PRIORITÉ — le point décisif
   * ------------------------------------
   * Un Pokémon qui n'est PAS dans l'équipe ne gagne aucune expérience, donc
   * n'évoluera jamais. « Il n'est pas encore évolué » ne peut donc pas servir
   * de motif pour l'écarter : c'est au contraire la raison même de l'intégrer.
   *
   * Un candidat non évolué est donc jugé sur SA FORME FINALE. Si celle-ci
   * franchit les mêmes barrières que n'importe quel autre candidat, la réponse
   * est « intègre-le maintenant », avec le coût de l'investissement annoncé
   * clairement (équipe temporairement plus faible, condition d'évolution).
   *
   * `status` ∈ {'remplacer', 'ajouter', 'investir', 'entrainer',
   *             'a-tester', 'non-recommande', 'indetermine'}
   */
  function buildHeadline(ctx) {
    var name = ctx.candidate.frName;
    var evo = ctx.evolution;
    var evoName = evo.available ? evo.best.frName : null;

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
    /* Le membre est nommé tel que l'utilisateur le connaît aujourd'hui
     * (« Rocabot »), même si la comparaison a porté sur sa forme finale. */
    var cibleEvoluee = ctx.bestEvolved && ctx.bestEvolved.verdict === 'remplacer'
      ? ctx.bestEvolved : null;
    var outclassesEvolved = cibleEvoluee
      ? (cibleEvoluee.memberNow || cibleEvoluee.member)
      : null;

    /**
     * Explique la comparaison à terme sans rien cacher : si le membre visé
     * évolue lui aussi, on le dit et on nomme sa forme finale. Sans cela,
     * l'utilisateur ne peut pas vérifier que la comparaison est honnête.
     */
    function comparaisonATerme() {
      if (!cibleEvoluee) return '';
      var m = cibleEvoluee.member;            // forme finale du membre
      var mNow = cibleEvoluee.memberNow || m; // membre tel qu'il est aujourd'hui
      if (!cibleEvoluee.memberWillEvolve) {
        return ' ' + evoName + ' (BST ' + cibleEvoluee.candidate.bst + ') dépasse ' +
          mNow.frName + ' (BST ' + m.bst + ').';
      }
      return ' Comparaison faite à armes égales : ' + mNow.frName + ' deviendra ' +
        m.frName + ' (BST ' + m.bst + '), et ' + evoName + ' (BST ' +
        cibleEvoluee.candidate.bst + ') le dépasse malgré tout.';
    }

    /* Phrase d'investissement, réutilisée à plusieurs endroits : elle rappelle
     * la contrainte d'XP et annonce le coût réel de la décision. */
    function investmentNote(prefix) {
      if (!ctx.candidateIsNFE || !evo.available) return '';
      return ' ' + prefix + ' il ne gagnera de l’expérience QUE s’il est dans ton ' +
        'équipe : c’est la seule façon de l’amener jusqu’à ' + evoName +
        ' (' + evo.condition + '). En attendant, ton équipe sera temporairement ' +
        'plus faible sur cet emplacement — c’est le prix de l’investissement.';
    }

    /* 1. Une place est libre : inutile de sacrifier qui que ce soit.
     *    C'est toujours l'option la moins risquée, donc la première proposée. */
    if (ctx.hasFreeSlot && (ctx.viableOnItsOwn || outclasses || outclassesEvolved)) {
      /* Cas « pépite » : le candidat est faible maintenant, mais sa forme
       * finale est excellente. C'est précisément le scénario où il faut
       * l'embarquer tout de suite. */
      if (ctx.candidateIsNFE && evo.available) {
        return {
          status: 'investir',
          title:
            'Mets ' + name + ' dans ton équipe dès maintenant : c’est ' + evoName +
            ' que tu vises.',
          text:
            'Tu as une place libre, et ' +
            (outclassesEvolved
              ? 'une fois évolué, il dépassera ' + outclassesEvolved.frName + '.' +
                comparaisonATerme()
              : 'son évolution ' + evoName +
                (evo.tier.known ? ' (tier ' + evo.tier.tier + ')' : '') +
                ' est un choix solide.') +
            investmentNote('Attention :'),
          target: outclassesEvolved
        };
      }

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

    /* 3. Le candidat est encore faible, mais sa forme finale dépasse
     *    démontrablement un membre. L'équipe est pleine : il faut donc
     *    accepter un creux temporaire pour récupérer un Pokémon supérieur. */
    if (outclassesEvolved) {
      return {
        status: 'investir',
        title:
          'Prends ' + name + ' à la place de ' + outclassesEvolved.frName +
          ' : une fois évolué en ' + evoName + ', il sera supérieur.',
        text:
          'En l’état, ' + name + ' est plus faible — mais c’est sa forme finale ' +
          'qui compte, et elle remplit tous les critères face à ' +
          outclassesEvolved.frName + '.' +
          comparaisonATerme() +
          investmentNote('Rappel :'),
        target: outclassesEvolved
      };
    }

    /* 4. Évolution bien classée, sans supériorité démontrée sur un membre. */
    if (evo.available && evo.worthTraining) {
      return {
        status: 'entrainer',
        title:
          'Aucun de tes membres n’est dépassé, mais l’évolution de ' + name +
          ' est solide.',
        text:
          'Son évolution ' + evoName +
          (evo.tier.known ? ' est classée tier ' + evo.tier.tier + '. ' : '. ') +
          'Aucun remplacement n’est justifié par les données, mais si tu veux ' +
          'l’entraîner, il devra occuper un emplacement pour gagner de l’expérience' +
          ' (' + evo.condition + ').'
      };
    }

    /* 5. Un seul indice : intéressant, mais pas démontré. */
    var testable =
      (ctx.bestNow && ctx.bestNow.verdict === 'a-tester') ? ctx.bestNow :
      (ctx.bestEvolved && ctx.bestEvolved.verdict === 'a-tester') ? ctx.bestEvolved : null;

    if (testable) {
      var viaEvolution = testable === ctx.bestEvolved;
      return {
        status: 'a-tester',
        title:
          name + ' est intéressant, mais pas clairement meilleur que ton équipe actuelle.',
        text:
          'À tester en combat face à ' + testable.member.frName +
          (viaEvolution ? ' une fois évolué en ' + evoName : '') +
          ', mais les données ne suffisent pas à affirmer qu’il est objectivement ' +
          'supérieur. Pas de changement recommandé.',
        target: testable.member
      };
    }

    /* 6. Cas par défaut : on ne recommande rien.
     *    Le motif porte toujours sur la forme FINALE quand il y en a une —
     *    dire « il n'est pas encore évolué » serait un argument circulaire. */
    var reason;
    if (ctx.candidateIsNFE && evo.available) {
      /* Si des membres évoluent aussi, le dire : c'est souvent la vraie raison
       * du refus, et l'utilisateur doit pouvoir le vérifier. */
      var membresQuiEvoluent = (ctx.evolutionComparisons || [])
        .filter(function (c) { return c.memberWillEvolve; })
        .map(function (c) { return (c.memberNow || c.member).frName + ' → ' + c.member.frName; });

      reason =
        'Même une fois évolué en ' + evoName +
        (evo.tier.known ? ' (tier ' + evo.tier.tier + ')' : '') +
        ', il ne dépasse aucun membre de ton équipe' +
        (membresQuiEvoluent.length
          ? ', évolutions comprises (' + membresQuiEvoluent.join(', ') + ')'
          : '') +
        ' : l’investissement en expérience ne serait pas rentable ici.';
    } else if (ctx.candidateIsNFE && !evo.available) {
      reason =
        'Sa chaîne d’évolution n’a pas pu être analysée : sans cette donnée, ' +
        'aucune conclusion n’est tirée sur son potentiel.';
    } else if (!ctx.candidateTier.known) {
      reason =
        'Aucune donnée de viabilité fiable n’est disponible pour ' + name +
        ' : par prudence, aucun changement n’est proposé.';
    } else {
      reason = 'Aucun membre de ton équipe n’est objectivement dépassé par ' + name + '.';
    }

    return {
      status: 'non-recommande',
      title: name + ' n’est pas recommandé pour ton équipe actuelle.',
      text: reason + ' Pas de changement recommandé.'
    };
  }

  PokeStats.analysis = {
    THRESHOLDS: THRESHOLDS,
    ROLES: ROLES,
    tierOf: tierOf,
    movesOf: movesOf,
    moveInfo: moveInfo,
    offensiveOutput: offensiveOutput,
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
