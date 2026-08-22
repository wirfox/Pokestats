/*
 * js/teams.js — Plusieurs équipes, conservées d'une visite à l'autre.
 * ===================================================================
 *
 * Un joueur ne joue pas à un seul jeu. Il a une équipe sur Écarlate, une autre
 * sur Épée, et veut passer de l'une à l'autre sans tout ressaisir. Chaque
 * équipe est donc rattachée à un jeu, et changer de jeu n'efface rien.
 *
 * Modèle d'une équipe :
 *   {
 *     id, name, gameId,
 *     slots:    [ "Rocabot", "", ... ],                    (6 emplacements)
 *     slugs:    [ "rockruff", "", ... ],                    (identifiant résolu)
 *     movesets: [ ["thunderbolt", "quick-attack"], [], … ] (6 × 0 à 4 capacités)
 *   }
 *
 * `slots` garde ce que l'utilisateur a tapé — c'est ce qu'il relit dans le
 * champ. `slugs` garde l'identifiant auquel cette saisie a RÉELLEMENT abouti.
 *
 * Les deux sont nécessaires, et le second n'est pas une redondance : sans lui,
 * la forme choisie doit être redevinée à chaque chargement en réanalysant un
 * libellé français (« Lougaroc Forme Crépusculaire »). Il suffit alors qu'un
 * libellé change, qu'un fichier arrive périmé du cache du navigateur ou que
 * l'index des noms se charge à contretemps pour que la saisie retombe sur
 * l'espèce de base — et le joueur retrouve un Lougaroc Diurne à la place du
 * Crépusculaire qu'il avait choisi. L'identifiant, lui, ne se réinterprète pas.
 *
 * `slugs` et `movesets` sont ajoutés sans toucher à `slots` : une équipe
 * enregistrée par une version antérieure du site se recharge telle quelle.
 */
(function (root) {
  'use strict';

  var PokeStats = (root.PokeStats = root.PokeStats || {});

  var STORAGE_KEY = 'pokestats:v2:teams';
  var LEGACY_KEY = 'pokestats:v1:team';   // équipe unique des versions précédentes
  var TEAM_SIZE = 6;
  var MAX_TEAMS = 12;                     // au-delà, la barre d'onglets devient illisible
  var MAX_MOVES = 4;                      // règle du jeu : quatre capacités, pas plus

  var state = { teams: [], activeId: null };

  function uid() {
    return 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function emptySlots() {
    var slots = [];
    for (var i = 0; i < TEAM_SIZE; i++) slots.push('');
    return slots;
  }

  function emptySlugs() {
    var out = [];
    for (var i = 0; i < TEAM_SIZE; i++) out.push('');
    return out;
  }

  function emptyMovesets() {
    var sets = [];
    for (var i = 0; i < TEAM_SIZE; i++) sets.push([]);
    return sets;
  }

  /**
   * Complète une équipe venue du stockage. Les versions antérieures du site
   * n'enregistraient pas les attaques : leur absence ne doit jamais faire
   * planter le chargement d'une équipe existante.
   */
  function normalize(team) {
    if (!team) return team;
    if (!Array.isArray(team.slugs)) team.slugs = emptySlugs();
    while (team.slugs.length < TEAM_SIZE) team.slugs.push('');
    team.slugs = team.slugs.slice(0, TEAM_SIZE).map(function (v) {
      return typeof v === 'string' ? v : '';
    });
    if (!Array.isArray(team.movesets)) team.movesets = emptyMovesets();
    while (team.movesets.length < TEAM_SIZE) team.movesets.push([]);
    team.movesets = team.movesets.slice(0, TEAM_SIZE).map(function (list) {
      return Array.isArray(list)
        ? list.filter(function (m) { return typeof m === 'string' && m; }).slice(0, MAX_MOVES)
        : [];
    });
    return team;
  }

  /* ------------------------------------------------------------------ */
  /* Persistance                                                         */
  /* ------------------------------------------------------------------ */

  function read() {
    try {
      var raw = root.localStorage && root.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.teams)) return null;
      return parsed;
    } catch (e) {
      return null;
    }
  }

  /* Dernière écriture réussie ? Consulté par l'interface pour prévenir. */
  var derniereEcritureOk = true;

  /**
   * Enregistre les équipes.
   *
   * L'échec n'est PAS anodin, contrairement à ce que cette fonction supposait :
   * localStorage est un espace commun d'environ 5 Mo, que le cache des fiches
   * PokéAPI saturait à lui seul. Une fois plein, l'écriture échouait — et
   * l'utilisateur perdait ses attaques et la forme de ses Pokémon à chaque
   * changement de page, sans le moindre message.
   *
   * Une équipe se saisit à la main, une fiche PokéAPI se retélécharge. En cas
   * de manque de place, c'est donc le cache qui saute, pas le travail du
   * joueur. Et si cela ne suffit pas, l'interface le dit.
   *
   * @returns {boolean} vrai si l'enregistrement a abouti
   */
  function write() {
    if (!root.localStorage) { derniereEcritureOk = false; return false; }
    var payload;
    try {
      payload = JSON.stringify(state);
    } catch (e) {
      derniereEcritureOk = false;
      return false;
    }

    try {
      root.localStorage.setItem(STORAGE_KEY, payload);
      derniereEcritureOk = true;
      return true;
    } catch (e) {
      /* Place manquante : on sacrifie le cache, jamais les équipes. */
      var api = PokeStats.api;
      if (api && api.purgeCache) api.purgeCache();
      try {
        root.localStorage.setItem(STORAGE_KEY, payload);
        derniereEcritureOk = true;
        return true;
      } catch (e2) {
        derniereEcritureOk = false;
        return false;
      }
    }
  }

  /** L'équipe est-elle réellement enregistrée ? */
  function isPersisted() { return derniereEcritureOk; }

  /**
   * Récupère l'équipe unique des versions antérieures pour ne pas la perdre.
   * L'ancienne clé est conservée : si l'utilisateur revient à une version
   * précédente du site, il retrouve son équipe.
   */
  function importLegacy(gameId) {
    try {
      var raw = root.localStorage && root.localStorage.getItem(LEGACY_KEY);
      if (!raw) return null;
      var slots = JSON.parse(raw);
      if (!Array.isArray(slots) || !slots.some(function (s) { return s; })) return null;
      return normalize({
        id: uid(),
        name: 'Mon équipe',
        gameId: gameId,
        slots: slots.slice(0, TEAM_SIZE).concat(emptySlots()).slice(0, TEAM_SIZE)
      });
    } catch (e) {
      return null;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Cycle de vie                                                        */
  /* ------------------------------------------------------------------ */

  /** @param {string} gameId jeu courant, pour rattacher une éventuelle création */
  function init(gameId) {
    var stored = read();
    if (stored && stored.teams.length) {
      stored.teams.forEach(normalize);
      state = stored;
    } else {
      var legacy = importLegacy(gameId);
      var first = legacy || normalize({
        id: uid(), name: 'Mon équipe', gameId: gameId, slots: emptySlots()
      });
      state = { teams: [first], activeId: first.id };
      write();
    }
    if (!byId(state.activeId)) state.activeId = state.teams[0].id;
    return active();
  }

  function byId(id) {
    return state.teams.filter(function (t) { return t.id === id; })[0] || null;
  }

  function all() { return state.teams.slice(); }

  /** Équipes rattachées à un jeu donné. */
  function forGame(gameId) {
    return state.teams.filter(function (t) { return t.gameId === gameId; });
  }

  function active() { return byId(state.activeId) || state.teams[0] || null; }

  function setActive(id) {
    if (!byId(id)) return active();
    state.activeId = id;
    write();
    return active();
  }

  /**
   * Crée une équipe pour un jeu. Renvoie l'équipe existante plutôt qu'un
   * doublon si la limite est atteinte.
   */
  function create(gameId, name) {
    if (state.teams.length >= MAX_TEAMS) return active();
    var team = normalize({
      id: uid(),
      name: name || nextName(gameId),
      gameId: gameId,
      slots: emptySlots()
    });
    state.teams.push(team);
    state.activeId = team.id;
    write();
    return team;
  }

  /** Nom par défaut : « Équipe 2 », « Équipe 3 »… au sein du même jeu. */
  function nextName(gameId) {
    var n = forGame(gameId).length + 1;
    return n === 1 ? 'Mon équipe' : 'Équipe ' + n;
  }

  function rename(id, name) {
    var team = byId(id);
    if (!team) return null;
    team.name = String(name || '').trim().slice(0, 40) || team.name;
    write();
    return team;
  }

  /** Supprime une équipe. La dernière n'est jamais supprimée, seulement vidée. */
  function remove(id) {
    var team = byId(id);
    if (!team) return active();
    if (state.teams.length === 1) {
      team.slots = emptySlots();
      team.slugs = emptySlugs();
      team.movesets = emptyMovesets();
      write();
      return team;
    }
    state.teams = state.teams.filter(function (t) { return t.id !== id; });
    if (state.activeId === id) state.activeId = state.teams[0].id;
    write();
    return active();
  }

  /**
   * Enregistre le contenu d'un emplacement de l'équipe active.
   *
   * Changer de Pokémon vide ses attaques : celles de l'ancien occupant n'ont
   * aucune raison d'être apprises par le nouveau, et les conserver ferait
   * analyser un jeu d'attaques que le joueur n'a jamais saisi. Choisir une
   * autre FORME du même Pokémon les conserve, elle.
   */
  function setSlot(index, value, slug) {
    var team = active();
    if (!team || index < 0 || index >= TEAM_SIZE) return;
    var suivant = String(value || '');
    var avant = team.slugs[index] || team.slots[index];
    var apres = slug || suivant;
    if (team.slots[index] !== suivant && !memeEspece(avant, apres)) {
      team.movesets[index] = [];
    }
    team.slots[index] = suivant;
    team.slugs[index] = suivant ? String(slug || '') : '';
    write();
  }

  /**
   * Identifiant réellement obtenu pour un emplacement, ou chaîne vide.
   *
   * C'est LUI qui doit être rechargé, pas le texte : « Lougaroc Forme
   * Crépusculaire » peut cesser de se résoudre, « lycanroc-dusk » non.
   */
  function slugOf(index) {
    var team = active();
    if (!team || index < 0 || index >= TEAM_SIZE) return '';
    return team.slugs[index] || '';
  }

  function slugs() {
    var team = active();
    return team ? team.slugs.slice() : emptySlugs();
  }

  /** Deux saisies désignent-elles le même Pokémon (forme mise à part) ? */
  function memeEspece(avant, apres) {
    var names = PokeStats.names;
    var forms = PokeStats.forms;
    if (!avant || !apres) return false;
    var resoudre = function (v) {
      /* Un identifiant déjà résolu se reconnaît : il est dans la table des
       * formes, ou il ne ressemble pas à une saisie française. */
      if (forms && forms.speciesOf(v)) return v;
      return names ? names.toCandidateSlug(v).slug : v;
    };
    var a = resoudre(avant);
    var b = resoudre(apres);
    if (a === b) return true;
    if (!forms) return false;
    var ea = forms.speciesOf(a);
    var eb = forms.speciesOf(b);
    return !!ea && ea === eb;
  }

  /** Attaques enregistrées pour un emplacement. */
  function movesOf(index) {
    var team = active();
    if (!team || index < 0 || index >= TEAM_SIZE) return [];
    return team.movesets[index].slice();
  }

  /** Remplace les attaques d'un emplacement (4 au maximum, sans doublon). */
  function setMoves(index, list) {
    var team = active();
    if (!team || index < 0 || index >= TEAM_SIZE) return [];
    var vus = Object.create(null);
    team.movesets[index] = (list || [])
      .filter(function (m) {
        if (typeof m !== 'string' || !m || vus[m]) return false;
        vus[m] = true;
        return true;
      })
      .slice(0, MAX_MOVES);
    write();
    return team.movesets[index].slice();
  }

  function addMove(index, slug) {
    return setMoves(index, movesOf(index).concat([slug]));
  }

  function removeMove(index, slug) {
    return setMoves(index, movesOf(index).filter(function (m) { return m !== slug; }));
  }

  function slots() {
    var team = active();
    return team ? team.slots.slice() : emptySlots();
  }

  function clearSlots() {
    var team = active();
    if (!team) return;
    team.slots = emptySlots();
    team.slugs = emptySlugs();
    team.movesets = emptyMovesets();
    write();
  }

  /** Rattache l'équipe active à un autre jeu (sans toucher à son contenu). */
  function setGame(id, gameId) {
    var team = byId(id);
    if (!team) return null;
    team.gameId = gameId;
    write();
    return team;
  }

  PokeStats.teams = {
    TEAM_SIZE: TEAM_SIZE,
    MAX_TEAMS: MAX_TEAMS,
    init: init,
    all: all,
    forGame: forGame,
    byId: byId,
    active: active,
    setActive: setActive,
    create: create,
    rename: rename,
    remove: remove,
    setSlot: setSlot,
    isPersisted: isPersisted,
    slots: slots,
    slugs: slugs,
    slugOf: slugOf,
    MAX_MOVES: MAX_MOVES,
    movesOf: movesOf,
    setMoves: setMoves,
    addMove: addMove,
    removeMove: removeMove,
    clearSlots: clearSlots,
    setGame: setGame
  };
})(typeof window !== 'undefined' ? window : globalThis);
