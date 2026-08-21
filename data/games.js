/*
 * data/games.js — Jeux Pokémon proposés au choix.
 * GÉNÉRÉ AUTOMATIQUEMENT — ne pas éditer à la main.
 *   Source    : PokéAPI (/version-group, /version)
 *   Régénérer : npm run build:games
 *   Jeux      : 23
 *
 * Chaque entrée : { id, label (français), generation, pokedexes }
 * La génération détermine les statistiques, les types, la table d'efficacité
 * et les tiers appliqués — voir data/gen/gen{N}.js.
 */
(function (root) {
  'use strict';
  root.POKESTATS_GAMES = {
    meta: {
      "provenance": "vérifié — généré depuis PokéAPI (version-group, version)",
      "source": "PokéAPI /version-group et /version — noms français officiels",
      "generatedAt": "2026-08-21",
      "regenerate": "npm run build:games",
      "count": 23,
      "note": "Les extensions sont fusionnées dans leur jeu de base : leurs pokédex s’ajoutent à celui du jeu principal."
    },
    games: [
      {
        "id": "red-blue",
        "label": "Rouge / Bleu",
        "generation": 1,
        "entries": 151,
        "pokedexes": [
          "kanto"
        ]
      },
      {
        "id": "yellow",
        "label": "Jaune",
        "generation": 1,
        "entries": 151,
        "pokedexes": [
          "kanto"
        ]
      },
      {
        "id": "crystal",
        "label": "Cristal",
        "generation": 2,
        "entries": 251,
        "pokedexes": [
          "original-johto"
        ]
      },
      {
        "id": "gold-silver",
        "label": "Or / Argent",
        "generation": 2,
        "entries": 251,
        "pokedexes": [
          "original-johto"
        ]
      },
      {
        "id": "emerald",
        "label": "Émeraude",
        "generation": 3,
        "entries": 202,
        "pokedexes": [
          "hoenn"
        ]
      },
      {
        "id": "firered-leafgreen",
        "label": "Rouge Feu / Vert Feuille",
        "generation": 3,
        "entries": 151,
        "pokedexes": [
          "kanto"
        ]
      },
      {
        "id": "ruby-sapphire",
        "label": "Rubis / Saphir",
        "generation": 3,
        "entries": 202,
        "pokedexes": [
          "hoenn"
        ]
      },
      {
        "id": "diamond-pearl",
        "label": "Diamant / Perle",
        "generation": 4,
        "entries": 151,
        "pokedexes": [
          "original-sinnoh"
        ]
      },
      {
        "id": "heartgold-soulsilver",
        "label": "Or HeartGold / Argent SoulSilver",
        "generation": 4,
        "entries": 256,
        "pokedexes": [
          "updated-johto"
        ]
      },
      {
        "id": "platinum",
        "label": "Platine",
        "generation": 4,
        "entries": 210,
        "pokedexes": [
          "extended-sinnoh"
        ]
      },
      {
        "id": "black-2-white-2",
        "label": "Noir 2 / Blanc 2",
        "generation": 5,
        "entries": 301,
        "pokedexes": [
          "updated-unova"
        ]
      },
      {
        "id": "black-white",
        "label": "Noir / Blanc",
        "generation": 5,
        "entries": 156,
        "pokedexes": [
          "original-unova"
        ]
      },
      {
        "id": "omega-ruby-alpha-sapphire",
        "label": "Rubis Oméga / Saphir Alpha",
        "generation": 6,
        "entries": 211,
        "pokedexes": [
          "updated-hoenn"
        ]
      },
      {
        "id": "x-y",
        "label": "X / Y",
        "generation": 6,
        "entries": 454,
        "pokedexes": [
          "kalos-central",
          "kalos-coastal",
          "kalos-mountain"
        ]
      },
      {
        "id": "lets-go-pikachu-lets-go-eevee",
        "label": "Let’s Go, Pikachu / Let’s Go, Évoli",
        "generation": 7,
        "entries": 153,
        "pokedexes": [
          "letsgo-kanto"
        ]
      },
      {
        "id": "sun-moon",
        "label": "Soleil / Lune",
        "generation": 7,
        "entries": 782,
        "pokedexes": [
          "original-alola",
          "original-melemele",
          "original-akala",
          "original-ulaula",
          "original-poni"
        ]
      },
      {
        "id": "ultra-sun-ultra-moon",
        "label": "Ultra-Soleil / Ultra-Lune",
        "generation": 7,
        "entries": 1003,
        "pokedexes": [
          "updated-alola",
          "updated-melemele",
          "updated-akala",
          "updated-ulaula",
          "updated-poni"
        ]
      },
      {
        "id": "brilliant-diamond-shining-pearl",
        "label": "Diamant Étincelant / Perle Scintillante",
        "generation": 8,
        "entries": 151,
        "pokedexes": [
          "original-sinnoh"
        ]
      },
      {
        "id": "legends-arceus",
        "label": "Légendes : Arceus",
        "generation": 8,
        "entries": 242,
        "pokedexes": [
          "hisui"
        ]
      },
      {
        "id": "sword-shield",
        "label": "Épée / Bouclier",
        "generation": 8,
        "entries": 821,
        "pokedexes": [
          "galar",
          "isle-of-armor",
          "crown-tundra"
        ]
      },
      {
        "id": "legends-za",
        "label": "Légendes : Z-A",
        "generation": 9,
        "entries": 364,
        "pokedexes": [
          "lumiose-city",
          "hyperspace"
        ]
      },
      {
        "id": "mega-dimension",
        "label": "Méga-Dimension",
        "generation": 9,
        "entries": 132,
        "pokedexes": [
          "hyperspace"
        ]
      },
      {
        "id": "scarlet-violet",
        "label": "Écarlate / Violet",
        "generation": 9,
        "entries": 843,
        "pokedexes": [
          "paldea",
          "kitakami",
          "blueberry"
        ]
      }
    ]
  };
})(typeof window !== 'undefined' ? window : globalThis);
