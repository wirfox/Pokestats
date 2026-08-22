/*
 * js/moveset.js — Faut-il échanger une attaque contre une autre ?
 * ===============================================================
 *
 * Le jeu propose une nouvelle capacité, les quatre emplacements sont pris :
 * laquelle sacrifier, et est-ce seulement rentable ? Ce module répond, ou
 * refuse de répondre.
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
 * ni l'objet tenu, ni le talent n'entrent en jeu. C'est un ordre de grandeur,
 * suffisant pour dire qu'une attaque en écrase clairement une autre, jamais
 * pour départager deux attaques proches — et c'est exactement pour cela que
 * le seuil de décision est large.
 *
 * CE QUE LE MODULE REFUSE DE FAIRE
 * --------------------------------
 *   1. Chiffrer une capacité de STATUT. Danse-Lames, Feu Follet, Ténacité
 *      n'ont pas de puissance ; leur valeur dépend d'une stratégie que
 *      l'application ne connaît pas. Elles sont montrées, décrites, et laissées
 *      au jugement du joueur.
 *   2. Chiffrer une attaque à PUISSANCE VARIABLE. Balayage dépend du poids de
 *      la cible, Gyroballe de la différence de Vitesse, Retour du bonheur du
 *      Pokémon. Leur puissance de base vaut 0 dans les données : la traiter
 *      comme une puissance réelle en ferait la victime automatique de tous les
 *      échanges — l'erreur inverse de celle qu'on veut éviter.
 *   3. Sacrifier une attaque PRIORITAIRE. Vive-Attaque frappe avant l'adversaire,
 *      un atout qui ne se lit pas dans une espérance de dégâts.
 *   4. Sacrifier la dernière attaque du type du Pokémon (STAB) pour une
 *      attaque qui n'en est pas une.
 *   5. Sacrifier la seule attaque qui frappe un type en super-efficace, si la
 *      nouvelle ne reprend pas cette couverture.
 *   6. Trancher pour un gain faible. En dessous du seuil, la réponse est
 *      « garde tes attaques ».
 */
(function (root) {
  'use strict';

  var PokeStats = (root.PokeStats = root.PokeStats || {});

  var MAX_MOVES = 4;

  var SEUILS = {
    /* La nouvelle attaque doit dépasser la plus faible d'au moins 20 %.
     * En dessous, l'écart tient dans l'imprécision du modèle (IV, EV, nature,
     * objet) : trancher serait donner une fausse certitude. */
    GAIN_MINIMUM: 1.20,
    /* Un échange à type et catégorie identiques ne coûte aucune couverture :
     * un gain plus modeste suffit à le justifier. */
    GAIN_MEME_TYPE: 1.05,
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

    /* Seules les attaques offensives sont sacrifiables : échanger une capacité
     * de statut contre des dégâts est un choix de stratégie, pas de chiffres. */
    var offensives = actuel.moves.filter(function (m) { return !m.move.isStatus; });

    /* Sacrifiables : les attaques que le modèle sait vraiment mesurer. Une
     * attaque prioritaire ou à puissance variable n'est pas « la plus faible »,
     * elle est hors barème — la désigner d'office serait le pire des conseils. */
    var sacrifiables = offensives.filter(function (m) {
      return m.score !== null && !m.priority;
    });

    if (!sacrifiables.length) {
      var pourquoi = !offensives.length
        ? 'Les quatre capacités actuelles sont des capacités de statut.'
        : 'Aucune des attaques actuelles n’est comparable sur le papier : ' +
          intraduisibles(offensives) + '.';
      return result('a-toi-de-voir', null, [{
        code: 'rien-de-comparable',
        text: pourquoi + ' Choisir laquelle sacrifier relève d’une stratégie que ' +
          'cet outil ne connaît pas : il ne tranche pas à ta place.'
      }], contexte);
    }

    var scores = sacrifiables.slice().sort(function (a, b) { return a.score - b.score; });
    var faible = scores[0];
    var mesurables = offensives.filter(function (m) { return m.score !== null; });
    var meilleur = mesurables.slice().sort(function (a, b) {
      return a.score - b.score;
    })[mesurables.length - 1];

    /* Cas le plus sûr : même type ET même catégorie, en plus fort. Aucune
     * couverture perdue, la comparaison est directe. */
    var memeType = sacrifiables.filter(function (m) {
      return m.move.type === candidat.move.type &&
             m.move.category === candidat.move.category &&
             m.score < candidat.score;
    }).sort(function (a, b) { return a.score - b.score; });

    if (memeType.length && candidat.score >= memeType[0].score * SEUILS.GAIN_MEME_TYPE) {
      var remplacee = memeType[0];
      return result('remplace', remplacee, [{
        code: 'meme-type-plus-fort',
        text: 'Même type et même catégorie que ' + remplacee.move.frName +
          ', mais plus efficace (' + Math.round(candidat.score) + ' contre ' +
          Math.round(remplacee.score) + ' en espérance de dégâts) : l’échange ne ' +
          'coûte aucune couverture.'
      }, comparaisonBrute(candidat, remplacee)], contexte);
    }

    /* Sinon : la plus faible attaque est la seule candidate au sacrifice, et
     * elle doit franchir tous les garde-fous. */
    var blocages = [];

    var stabRestants = offensives.filter(function (m) {
      return m.stab && m.slug !== faible.slug;
    }).length;
    if (faible.stab && !candidat.stab && stabRestants === 0) {
      blocages.push({
        code: 'derniere-stab',
        text: faible.move.frName + ' est sa dernière attaque de son propre type. ' +
          'La perdre pour une attaque sans bonus de type affaiblirait ' +
          record.frName + ' sur son terrain le plus solide.'
      });
    }

    var sansFaible = union(offensives.filter(function (m) { return m.slug !== faible.slug; })
      .map(function (m) { return m.hits; }).concat([candidat.hits]));
    var perdus = difference(faible.hits, sansFaible);
    if (perdus.length) {
      blocages.push({
        code: 'couverture-perdue',
        text: faible.move.frName + ' est la seule à frapper ' + frTypes(perdus) +
          ' en super-efficace. ' + candidat.move.frName + ' ne reprend pas cette ' +
          'couverture : l’échange ferait perdre plus qu’il ne rapporte.'
      });
    }

    if (candidat.score < faible.score * SEUILS.GAIN_MINIMUM) {
      blocages.push({
        code: 'gain-insuffisant',
        text: 'Le gain est trop faible pour être sûr : ' + Math.round(candidat.score) +
          ' contre ' + Math.round(faible.score) + ' pour ' + faible.move.frName +
          '. Sous +' + Math.round((SEUILS.GAIN_MINIMUM - 1) * 100) + ' %, l’écart ' +
          'tient dans ce que le modèle ignore (IV, EV, nature, objet).'
      });
    }

    if (blocages.length) {
      var repere = meilleur ? [{
        code: 'reference',
        text: 'Ta meilleure attaque actuelle reste ' + meilleur.move.frName +
          ' (' + Math.round(meilleur.score) + ').'
      }] : [];
      return result('garde', null, blocages.concat(repere), contexte);
    }

    var motifsOk = [{
      code: 'gain-net',
      text: candidat.move.frName + ' dépasse nettement ' + faible.move.frName +
        ' (' + Math.round(candidat.score) + ' contre ' + Math.round(faible.score) +
        ' en espérance de dégâts).'
    }, comparaisonBrute(candidat, faible)];

    if (candidat.stab && !faible.stab) {
      motifsOk.push({
        code: 'stab-gagne',
        text: 'Elle est en plus du type de ' + record.frName + ' : bonus de 50 %.'
      });
    }
    var gagnes = difference(candidat.hits, union(offensives.map(function (m) { return m.hits; })));
    if (gagnes.length) {
      motifsOk.push({
        code: 'couverture-gagnee',
        text: 'Elle ouvre du super-efficace contre ' + frTypes(gagnes) + '.'
      });
    }

    return result('remplace', faible, motifsOk, contexte);
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
