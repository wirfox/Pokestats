/*
 * js/moveset.js — Faut-il échanger une attaque contre une autre ?
 * ===============================================================
 *
 * Le jeu propose une nouvelle capacité, les quatre emplacements sont pris :
 * laquelle sacrifier ?
 *
 * LA RÈGLE
 * --------
 * Les quatre attaques sont classées de la plus forte à la plus faible, tous
 * types confondus, et la nouvelle vient prendre sa place dans ce classement.
 *
 *   - Elle dépasse au moins une attaque  → on échange contre LA PLUS FAIBLE.
 *   - Elle ne dépasse aucune des quatre  → on ne change rien.
 *
 * Le type n'entre pas dans le classement. Une attaque Électrik plus forte
 * remplace une attaque Normal plus faible, et réciproquement : c'est le
 * classement qui décide, pas la couleur de la vignette.
 *
 * MODÈLE DE COMPARAISON
 * ---------------------
 * Les dégâts d'une attaque sont, à peu de chose près, proportionnels au
 * produit puissance × statistique offensive × bonus de type (STAB). En y
 * ajoutant la précision, on obtient une espérance de dégâts — grossière, mais
 * fondée sur les vraies valeurs du jeu et sur la génération choisie :
 *
 *     score = puissance × STAB × (précision / 100) × (statistique / 100)
 *
 * Ce n'est PAS un calculateur de dégâts : ni les IV, ni les EV, ni la nature,
 * ni l'objet tenu, ni le talent n'entrent en jeu. C'est un ordre de grandeur.
 *
 * CE QUE LE MODULE SIGNALE SANS BLOQUER
 * -------------------------------------
 * Un échange peut être gagnant en dégâts et coûter autre chose : la dernière
 * attaque du type du Pokémon, la seule qui frappe un type en super-efficace,
 * ou une attaque prioritaire. Ces conséquences ne sont pas des refus — le
 * classement décide —, mais elles sont NOMMÉES dans le verdict. Le joueur voit
 * ce qu'il perd avant de valider.
 *
 * CE QU'IL REFUSE DE CHIFFRER
 * ---------------------------
 * Deux familles de capacités n'ont pas de puissance à comparer. Ce n'est pas
 * de la prudence, c'est une absence de donnée :
 *
 *   1. Les capacités de STATUT. Danse-Lames, Feu Follet, Ténacité n'infligent
 *      aucun dégât ; leur valeur dépend d'une stratégie que l'application ne
 *      connaît pas. Elles sont montrées, décrites, et laissées au joueur.
 *   2. Les attaques à PUISSANCE VARIABLE. Balayage dépend du poids de la
 *      cible, Gyroballe de la différence de Vitesse, Retour du bonheur du
 *      Pokémon. Leur puissance de base vaut 0 dans les données : les classer
 *      comme des attaques de puissance nulle en ferait la victime automatique
 *      de tous les échanges.
 *
 * Ces capacités-là restent hors du classement, et le verdict le dit.
 */
(function (root) {
  'use strict';

  var PokeStats = (root.PokeStats = root.PokeStats || {});

  var MAX_MOVES = 4;

  var SEUILS = {
    /* Multiplicateur à partir duquel on parle de « super-efficace ». */
    SUPER_EFFICACE: 2
  };

  var VERDICTS = {
    'apprends': { label: 'Apprends-la', ton: 'oui' },
    'remplace': { label: 'Échange rentable', ton: 'oui' },
    'garde': { label: 'Garde tes attaques', ton: 'non' },
    'a-toi-de-voir': { label: 'À toi de juger', ton: 'neutre' },
    'deja-connue': { label: 'Déjà apprise', ton: 'neutre' },
    'donnee-manquante': { label: 'Données insuffisantes', ton: 'non' }
  };

  /* ------------------------------------------------------------------ */
  /* Mesures                                                             */
  /* ------------------------------------------------------------------ */

  /** Statistique offensive mobilisée par une capacité. */
  function statFor(record, move) {
    if (move.category === 'phy') return record.stats.attack;
    if (move.category === 'spe') return record.stats['special-attack'];
    return 0;
  }

  function hasStab(record, move) {
    return (record.types || []).indexOf(move.type) !== -1;
  }

  /**
   * Espérance de dégâts, en unités arbitraires mais comparables entre elles.
   * `null` pour une capacité de statut : elle n'inflige pas de dégâts, lui
   * donner un score reviendrait à inventer une équivalence.
   */
  function scoreOf(record, move) {
    if (!move || move.isStatus) return null;
    /* Puissance de base nulle sur une attaque = puissance variable (Balayage,
     * Gyroballe, Éclatepierre…). Elle n'est pas « faible », elle est inconnue. */
    if (!move.power) return null;
    var stab = hasStab(record, move) ? 1.5 : 1;
    var precision = (move.accuracy || 100) / 100;
    return move.power * stab * precision * (statFor(record, move) / 100);
  }

  /** Types défensifs qu'une capacité frappe en super-efficace. */
  function hits(move) {
    var types = PokeStats.types;
    if (!move || move.isStatus || !types || !types.allTypes) return [];
    return types.allTypes().filter(function (def) {
      return types.effectiveness(move.type, [def]) >= SEUILS.SUPER_EFFICACE;
    });
  }

  function union(listes) {
    var seen = Object.create(null);
    var out = [];
    listes.forEach(function (l) {
      l.forEach(function (t) { if (!seen[t]) { seen[t] = true; out.push(t); } });
    });
    return out;
  }

  function difference(a, b) {
    var seen = Object.create(null);
    b.forEach(function (t) { seen[t] = true; });
    return a.filter(function (t) { return !seen[t]; });
  }

  /* ------------------------------------------------------------------ */
  /* Description d'un jeu d'attaques                                     */
  /* ------------------------------------------------------------------ */

  /**
   * Analyse une capacité dans le contexte d'un Pokémon donné.
   * @returns {Object} fiche enrichie : score, STAB, couverture
   */
  function describe(record, slug) {
    var move = PokeStats.movedex.get(slug);
    if (!move) return null;
    return {
      slug: slug,
      move: move,
      stab: hasStab(record, move),
      score: scoreOf(record, move),
      /* Attaque dont la puissance dépend de la situation : chiffrable en
       * combat, pas sur le papier. */
      variable: !move.isStatus && !move.power,
      priority: move.priority > 0,
      hits: hits(move)
    };
  }

  /**
   * Le jeu d'attaques d'un Pokémon, décrit et trié.
   * Les capacités inconnues sont signalées, jamais devinées.
   */
  function describeSet(record, slugs) {
    var known = [];
    var unknown = [];
    (slugs || []).forEach(function (slug) {
      if (!slug) return;
      var d = describe(record, slug);
      if (d) known.push(d); else unknown.push(slug);
    });
    return { moves: known, unknown: unknown };
  }

  /* ------------------------------------------------------------------ */
  /* Décision                                                            */
  /* ------------------------------------------------------------------ */

  function result(code, drop, reasons, extra) {
    var out = {
      code: code,
      label: VERDICTS[code].label,
      ton: VERDICTS[code].ton,
      drop: drop || null,
      reasons: reasons || []
    };
    if (extra) Object.keys(extra).forEach(function (k) { out[k] = extra[k]; });
    return out;
  }

  /**
   * Faut-il apprendre `candidateSlug`, et à la place de quoi ?
   *
   * @param {Object} record            fiche du Pokémon (js/dex.js)
   * @param {string[]} currentSlugs    attaques déjà connues (0 à 4)
   * @param {string} candidateSlug     capacité proposée par le jeu
   * @returns {Object} verdict, capacité à sacrifier, motifs
   */
  function evaluate(record, currentSlugs, candidateSlug) {
    var candidat = describe(record, candidateSlug);
    if (!record || !candidat) {
      return result('donnee-manquante', null, [{
        code: 'capacite-inconnue',
        text: 'Cette capacité n’est pas dans le catalogue' +
          (PokeStats.movedex.get(candidateSlug, 9) ? ' pour le jeu sélectionné' : '') +
          ' : sans ses vraies valeurs, aucun conseil n’est possible.'
      }], { candidate: candidat });
    }

    var actuel = describeSet(record, currentSlugs);
    var contexte = { candidate: candidat, current: actuel.moves, unknown: actuel.unknown };

    if (actuel.moves.some(function (m) { return m.slug === candidat.slug; })) {
      return result('deja-connue', null, [{
        code: 'doublon',
        text: record.frName + ' connaît déjà ' + candidat.move.frName + '.'
      }], contexte);
    }

    /* Emplacement libre : rien à sacrifier, donc aucun risque. */
    if (actuel.moves.length < MAX_MOVES) {
      var apport = difference(candidat.hits, union(actuel.moves.map(function (m) { return m.hits; })));
      var motifs = [{
        code: 'emplacement-libre',
        text: 'Il reste ' + (MAX_MOVES - actuel.moves.length) + ' emplacement' +
          (MAX_MOVES - actuel.moves.length > 1 ? 's' : '') +
          ' libre' + (MAX_MOVES - actuel.moves.length > 1 ? 's' : '') +
          ' : tu n’as rien à sacrifier.'
      }];
      if (candidat.stab) {
        motifs.push({
          code: 'stab',
          text: 'C’est une attaque de son propre type : elle frappe 50 % plus fort.'
        });
      }
      if (apport.length) {
        motifs.push({
          code: 'couverture',
          text: 'Elle apporte du super-efficace contre ' + frTypes(apport) + '.'
        });
      }
      return result('apprends', null, motifs, contexte);
    }

    /* Attaque à puissance variable : sa force dépend du combat, pas de la
     * fiche. La comparer à une puissance fixe serait un faux calcul. */
    if (candidat.variable) {
      return result('a-toi-de-voir', null, [{
        code: 'puissance-variable',
        text: candidat.move.frName + ' n’a pas de puissance fixe : elle dépend ' +
          'de la situation (poids ou vitesse de la cible, bonheur du Pokémon…). ' +
          'Cet outil ne peut pas la comparer honnêtement à une attaque classique.'
      }], contexte);
    }

    /* Capacité de statut : hors du modèle. On montre, on ne tranche pas. */
    if (candidat.move.isStatus) {
      return result('a-toi-de-voir', null, [{
        code: 'statut-non-chiffrable',
        text: candidat.move.frName + ' est une capacité de statut : elle n’inflige ' +
          'aucun dégât, et sa valeur dépend d’une stratégie que cet outil ne ' +
          'connaît pas. Il ne la mettra donc pas en concurrence avec tes attaques.'
      }].concat(candidat.move.effect ? [{
        code: 'effet', text: 'Effet : ' + candidat.move.effect
      }] : []), contexte);
    }

    /* Le classement ne retient que ce qui a une puissance à comparer. Une
     * capacité de statut ou à puissance variable n'est pas « faible » : elle
     * est hors barème, et le dire vaut mieux que la sacrifier par défaut. */
    var offensives = actuel.moves.filter(function (m) { return !m.move.isStatus; });
    var classables = offensives.filter(function (m) { return m.score !== null; });
    var horsBareme = actuel.moves.filter(function (m) {
      return m.move.isStatus || m.score === null;
    });

    if (!classables.length) {
      return result('a-toi-de-voir', null, [{
        code: 'rien-de-comparable',
        text: (offensives.length
          ? 'Aucune des attaques actuelles n’a de puissance comparable : ' +
            intraduisibles(offensives) + '.'
          : 'Les quatre capacités actuelles sont des capacités de statut.') +
          ' Il n’y a rien à classer, et cet outil ne tranche pas au hasard.'
      }], contexte);
    }

    /* Classement, du plus fort au plus faible. C'est lui qui décide. */
    var classement = classables.slice().sort(function (a, b) { return b.score - a.score; });
    var faible = classement[classement.length - 1];
    var meilleur = classement[0];

    /* Le classement complet, la nouvelle attaque à sa place dedans : c'est la
     * façon la plus honnête de montrer POURQUOI c'est celle-là qui saute. */
    contexte.classement = classement.concat([candidat])
      .sort(function (a, b) { return b.score - a.score; });
    contexte.horsClassement = horsBareme;

    var horsBaremeMotif = horsBareme.length ? [{
      code: 'hors-classement',
      text: intraduisibles(horsBareme) + ' ' + (horsBareme.length > 1 ? 'restent' : 'reste') +
        ' hors du classement : ' + (horsBareme.length > 1 ? 'elles n’ont' : 'elle n’a') +
        ' pas de puissance à comparer.'
    }] : [];

    /* Elle ne dépasse aucune des attaques en place : rien à changer. */
    if (candidat.score <= faible.score) {
      return result('garde', null, [{
        code: 'plus-faible-que-tout',
        text: candidat.move.frName + ' (' + Math.round(candidat.score) +
          ' en espérance de dégâts) ne dépasse aucune de tes attaques actuelles. ' +
          'La plus faible, ' + faible.move.frName + ', vaut déjà ' +
          Math.round(faible.score) + '.'
      }].concat(horsBaremeMotif), contexte);
    }

    /* Elle en dépasse au moins une : on échange contre la plus faible, quel
     * que soit son type. */
    var raisons = [{
      code: 'plus-forte-que-la-plus-faible',
      text: candidat.move.frName + ' (' + Math.round(candidat.score) + ') dépasse ' +
        faible.move.frName + ' (' + Math.round(faible.score) + '), la plus faible ' +
        'de tes ' + classement.length + ' attaques classées. ' +
        (meilleur.slug === faible.slug
          ? ''
          : 'Ta meilleure reste ' + meilleur.move.frName + ' (' +
            Math.round(meilleur.score) + ').')
    }, comparaisonBrute(candidat, faible)];

    if (candidat.stab && !faible.stab) {
      raisons.push({
        code: 'stab-gagne',
        text: 'Elle est du type de ' + record.frName + ' : bonus de 50 % sur ses dégâts.'
      });
    }

    /* Ce que l'échange coûte par ailleurs. Ces avertissements ne bloquent
     * rien — le classement a décidé — mais le joueur doit les lire avant de
     * valider, parce qu'ils ne se lisent pas dans une espérance de dégâts. */
    raisons = raisons.concat(avertissements(record, candidat, faible, classables));
    return result('remplace', faible, raisons.concat(horsBaremeMotif), contexte);
  }

  /**
   * Conséquences d'un échange qui n'apparaissent pas dans le classement.
   * Signalées, jamais bloquantes : c'est le joueur qui valide.
   */
  function avertissements(record, candidat, sortante, classables) {
    var out = [];

    var stabRestants = classables.filter(function (m) {
      return m.stab && m.slug !== sortante.slug;
    }).length;
    if (sortante.stab && !candidat.stab && stabRestants === 0) {
      out.push({
        code: 'derniere-stab',
        text: 'Attention : ' + sortante.move.frName + ' est sa dernière attaque de ' +
          'son propre type. Après l’échange, ' + record.frName + ' n’aura plus ' +
          'aucune attaque à bonus de type.'
      });
    }

    var sansSortante = union(classables
      .filter(function (m) { return m.slug !== sortante.slug; })
      .map(function (m) { return m.hits; })
      .concat([candidat.hits]));
    var perdus = difference(sortante.hits, sansSortante);
    if (perdus.length) {
      out.push({
        code: 'couverture-perdue',
        text: 'Attention : ' + sortante.move.frName + ' est la seule à frapper ' +
          frTypes(perdus) + ' en super-efficace. Cette couverture disparaît.'
      });
    }

    if (sortante.move.priority > 0) {
      out.push({
        code: 'priorite-perdue',
        text: 'Attention : ' + sortante.move.frName + ' frappe avant l’adversaire. ' +
          'La priorité ne se lit pas dans une espérance de dégâts, et le ' +
          'classement ne la compte donc pas.'
      });
    }

    var gagnes = difference(candidat.hits, union(classables.map(function (m) { return m.hits; })));
    if (gagnes.length) {
      out.push({
        code: 'couverture-gagnee',
        text: 'Elle ouvre du super-efficace contre ' + frTypes(gagnes) + '.'
      });
    }

    return out;
  }

  /** Motif purement factuel : les chiffres bruts, sans interprétation. */
  function comparaisonBrute(candidat, sortante) {
    return {
      code: 'chiffres',
      text: candidat.move.frName + ' : ' + candidat.move.power + ' de puissance, ' +
        candidat.move.accuracy + ' %, ' + candidat.move.pp + ' PP — ' +
        sortante.move.frName + ' : ' + sortante.move.power + ' de puissance, ' +
        sortante.move.accuracy + ' %, ' + sortante.move.pp + ' PP.'
    };
  }

  /** Résume pourquoi des attaques échappent au barème. */
  function intraduisibles(moves) {
    var noms = moves.map(function (m) {
      if (m.priority) return m.move.frName + ' (prioritaire)';
      if (m.variable) return m.move.frName + ' (puissance variable)';
      return m.move.frName;
    });
    return noms.join(', ');
  }

  function frTypes(list) {
    var types = PokeStats.types;
    var noms = list.map(function (t) {
      return (types && types.frType) ? types.frType(t) : t;
    });
    if (noms.length === 1) return noms[0];
    return noms.slice(0, -1).join(', ') + ' et ' + noms[noms.length - 1];
  }

  PokeStats.moveset = {
    MAX_MOVES: MAX_MOVES,
    SEUILS: SEUILS,
    VERDICTS: VERDICTS,
    scoreOf: scoreOf,
    hits: hits,
    describe: describe,
    describeSet: describeSet,
    evaluate: evaluate
  };
})(typeof window !== 'undefined' ? window : globalThis);
