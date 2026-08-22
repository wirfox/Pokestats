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
 *     movesets: [ ["thunderbolt", "quick-attack"], [], … ] (6 × 0 à 4 capacités)
 *   }
 *
 * Les emplacements ne stockent que ce que l'utilisateur a tapé, pas les fiches
 * complètes : c'est compact, et cela reste valable si les données de PokéAPI
 * évoluent. Les attaques, elles, sont stockées par IDENTIFIANT : c'est ce que
 * le catalogue comprend, et cela survit à un changement de langue d'affichage.
 *
 * `movesets` est ajouté sans toucher à `slots` : une équipe enregistrée par une
 * version antérieure du site se recharge telle quelle, simplement sans
 * attaques.
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

  function write() {
    try {
      if (root.localStorage) {
        root.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      }
    } catch (e) { /* quota ou stockage refusé : la session reste utilisable */ }
  }

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
  function setSlot(index, value) {
    var team = active();
    if (!team || index < 0 || index >= TEAM_SIZE) return;
    var suivant = String(value || '');
    if (team.slots[index] !== suivant && !memeEspece(team.slots[index], suivant)) {
      team.movesets[index] = [];
    }
    team.slots[index] = suivant;
    write();
  }

  /** Deux saisies désignent-elles le même Pokémon (forme mise à part) ? */
  function memeEspece(avant, apres) {
    var names = PokeStats.names;
    var forms = PokeStats.forms;
    if (!avant || !apres || !names) return false;
    var a = names.toCandidateSlug(avant).slug;
    var b = names.toCandidateSlug(apres).slug;
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
    slots: slots,
    MAX_MOVES: MAX_MOVES,
    movesOf: movesOf,
    setMoves: setMoves,
    addMove: addMove,
    removeMove: removeMove,
    clearSlots: clearSlots,
    setGame: setGame
  };
})(typeof window !== 'undefined' ? window : globalThis);
