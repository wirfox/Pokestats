/*
 * test/type-chart.fixture.js
 * ==========================
 * Table d'efficacité utilisée UNIQUEMENT par les tests hors navigateur.
 *
 * En production, cette table n'existe pas : elle est reconstruite à
 * l'exécution depuis PokéAPI (/type/{nom} → damage_relations), cf. js/types.js.
 * Cette copie sert seulement à rendre les tests déterministes et exécutables
 * sans réseau.
 */
'use strict';

var TYPES = [
  'normal', 'fighting', 'flying', 'poison', 'ground', 'rock', 'bug', 'ghost',
  'steel', 'fire', 'water', 'grass', 'electric', 'psychic', 'ice', 'dragon',
  'dark', 'fairy'
];

/* Pour chaque type attaquant : ce contre quoi il fait ×2, ×0.5 et ×0. */
var RELATIONS = {
  normal:   { two: [],                                  half: ['rock', 'steel'],                                        zero: ['ghost'] },
  fighting: { two: ['normal', 'rock', 'steel', 'ice', 'dark'], half: ['flying', 'poison', 'bug', 'psychic', 'fairy'],   zero: ['ghost'] },
  flying:   { two: ['fighting', 'bug', 'grass'],        half: ['rock', 'steel', 'electric'],                            zero: [] },
  poison:   { two: ['grass', 'fairy'],                  half: ['poison', 'ground', 'rock', 'ghost'],                    zero: ['steel'] },
  ground:   { two: ['poison', 'rock', 'steel', 'fire', 'electric'], half: ['bug', 'grass'],                             zero: ['flying'] },
  rock:     { two: ['flying', 'bug', 'fire', 'ice'],    half: ['fighting', 'ground', 'steel'],                          zero: [] },
  bug:      { two: ['grass', 'psychic', 'dark'],        half: ['fighting', 'flying', 'poison', 'ghost', 'steel', 'fire', 'fairy'], zero: [] },
  ghost:    { two: ['ghost', 'psychic'],                half: ['dark'],                                                 zero: ['normal'] },
  steel:    { two: ['rock', 'ice', 'fairy'],            half: ['steel', 'fire', 'water', 'electric'],                   zero: [] },
  fire:     { two: ['bug', 'steel', 'grass', 'ice'],    half: ['rock', 'fire', 'water', 'dragon'],                      zero: [] },
  water:    { two: ['ground', 'rock', 'fire'],          half: ['water', 'grass', 'dragon'],                             zero: [] },
  grass:    { two: ['ground', 'rock', 'water'],         half: ['flying', 'poison', 'bug', 'steel', 'fire', 'grass', 'dragon'], zero: [] },
  electric: { two: ['flying', 'water'],                 half: ['grass', 'electric', 'dragon'],                          zero: ['ground'] },
  psychic:  { two: ['fighting', 'poison'],              half: ['steel', 'psychic'],                                     zero: ['dark'] },
  ice:      { two: ['flying', 'ground', 'grass', 'dragon'], half: ['steel', 'fire', 'water', 'ice'],                    zero: [] },
  dragon:   { two: ['dragon'],                          half: ['steel'],                                                zero: ['fairy'] },
  dark:     { two: ['ghost', 'psychic'],                half: ['fighting', 'dark', 'fairy'],                            zero: [] },
  fairy:    { two: ['fighting', 'dragon', 'dark'],      half: ['poison', 'steel', 'fire'],                              zero: [] }
};

function buildChart() {
  var chart = Object.create(null);
  TYPES.forEach(function (a) {
    chart[a] = Object.create(null);
    TYPES.forEach(function (d) { chart[a][d] = 1; });
  });
  Object.keys(RELATIONS).forEach(function (a) {
    RELATIONS[a].two.forEach(function (d) { chart[a][d] = 2; });
    RELATIONS[a].half.forEach(function (d) { chart[a][d] = 0.5; });
    RELATIONS[a].zero.forEach(function (d) { chart[a][d] = 0; });
  });
  return chart;
}

module.exports = { TYPES: TYPES, buildChart: buildChart };
