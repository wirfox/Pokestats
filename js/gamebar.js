/*
 * js/gamebar.js — Sélecteur de jeu, commun à toutes les pages.
 * ============================================================
 *
 * Rend un bouton affichant le jeu courant, qui déploie la liste des jeux
 * groupés par génération. Le choix est mémorisé par js/gamestate.js et vaut
 * pour l'ensemble du site.
 *
 * Le module se contente d'afficher et de déclencher ; il ne décide de rien.
 */
(function (root, document) {
  'use strict';

  var PokeStats = (root.PokeStats = root.PokeStats || {});
  var game = PokeStats.game;

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** Chiffres romains : c'est ainsi que les générations sont nommées. */
  var ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];

  function mount(container) {
    if (!container) return;

    container.innerHTML =
      '<button type="button" class="game-button" id="game-button" ' +
        'aria-haspopup="listbox" aria-expanded="false">' +
        '<span class="game-button-label">' +
          '<span class="game-button-hint">Jeu</span>' +
          '<span class="game-button-name" id="game-button-name">…</span>' +
        '</span>' +
        '<span class="game-button-caret" aria-hidden="true">▾</span>' +
      '</button>' +
      '<div class="game-menu" id="game-menu" role="listbox" hidden></div>';

    var button = document.getElementById('game-button');
    var menu = document.getElementById('game-menu');

    function renderLabel() {
      var current = game.current();
      document.getElementById('game-button-name').textContent =
        current ? current.label : 'Choisir…';
    }

    function renderMenu() {
      var currentId = (game.current() || {}).id;
      menu.innerHTML = game.grouped().map(function (group) {
        return '' +
          '<div class="game-group">' +
            '<div class="game-group-title">Génération ' +
              escapeHtml(ROMAN[group.generation] || group.generation) + '</div>' +
            group.games.map(function (g) {
              var active = g.id === currentId;
              return '<button type="button" class="game-option' +
                (active ? ' is-active' : '') + '" data-game="' + escapeHtml(g.id) +
                '" role="option" aria-selected="' + active + '">' +
                '<span class="game-option-name">' + escapeHtml(g.label) + '</span>' +
                '<span class="game-option-count">' +
                  game.entryCount(g.id) + '&nbsp;Pokémon</span>' +
                '</button>';
            }).join('') +
          '</div>';
      }).join('');
    }

    /**
     * Place le menu sous le bouton.
     *
     * Il est en position fixe — la barre de navigation défile horizontalement
     * et rognerait un menu positionné en absolu. On le recale donc à chaque
     * ouverture, en le maintenant dans l'écran : sur mobile, le bouton peut
     * se trouver tout à droite du ruban.
     */
    function place() {
      var rect = button.getBoundingClientRect();
      var marge = 10;
      var largeur = Math.min(320, root.innerWidth - marge * 2);
      menu.style.width = largeur + 'px';

      var gauche = Math.min(
        Math.max(marge, rect.right - largeur),
        root.innerWidth - largeur - marge
      );
      menu.style.left = gauche + 'px';
      menu.style.top = (rect.bottom + 8) + 'px';
      /* Jamais plus haut que l'espace restant sous le bouton. */
      menu.style.maxHeight = Math.max(180, root.innerHeight - rect.bottom - 24) + 'px';
    }

    function open() {
      renderMenu();
      menu.hidden = false;
      place();
      button.setAttribute('aria-expanded', 'true');
    }

    function close() {
      menu.hidden = true;
      button.setAttribute('aria-expanded', 'false');
    }

    button.addEventListener('click', function () {
      if (menu.hidden) open(); else close();
    });

    menu.addEventListener('click', function (event) {
      var option = event.target.closest('[data-game]');
      if (!option) return;
      close();
      game.select(option.dataset.game);
    });

    /*
     * Un menu en position fixe ne suit pas la page : on le recale à chaque
     * défilement.
     *
     * Le refermer aurait semblé plus simple, mais le bouton vit dans un ruban
     * défilant : cliquer dessus provoque un défilement automatique de mise en
     * vue, qui refermait le menu dans la milliseconde suivant son ouverture.
     */
    root.addEventListener('scroll', function () { if (!menu.hidden) place(); }, true);
    root.addEventListener('resize', function () { if (!menu.hidden) place(); });

    /* Fermeture au clic extérieur et à Échap : comportement attendu d'un menu. */
    document.addEventListener('click', function (event) {
      if (!menu.hidden && !container.contains(event.target)) close();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !menu.hidden) { close(); button.focus(); }
    });

    game.onChange(renderLabel);
    renderLabel();
  }

  PokeStats.gamebar = { mount: mount };
})(typeof window !== 'undefined' ? window : globalThis,
   typeof document !== 'undefined' ? document : null);
