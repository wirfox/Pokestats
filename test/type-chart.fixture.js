/*
 * test/type-chart.fixture.js — Table d'efficacité pour les tests hors réseau.
 * ===========================================================================
 * GÉNÉRÉ AUTOMATIQUEMENT — ne pas éditer à la main.
 *   Régénérer : npm run build:types
 *
 * Réexporte simplement data/type-chart.js afin que les tests s'exécutent
 * contre les mêmes données que l'application, et non contre une copie
 * indépendante qui pourrait diverger.
 */
'use strict';

require('../data/type-chart.js');

var TABLE = globalThis.POKESTATS_TYPE_CHART;

module.exports = {
  TYPES: TABLE.types,
  buildChart: function () { return TABLE.chart; },
  meta: TABLE.meta
};
