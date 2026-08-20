/*
 * data/tiers.js — Table de viabilité compétitive (tier list) utilisée par PokeStats.
 * =================================================================================
 *
 * ⚠️  LIRE AVANT DE MODIFIER — ce fichier est le SEUL endroit de l'application où
 *     des données ne proviennent pas directement d'une API à l'exécution.
 *     Tout le reste (stats de base, types, évolutions, talents, table des types)
 *     est récupéré en direct depuis PokéAPI par le navigateur.
 *
 * SCHÉMA D'UNE ENTRÉE
 * -------------------
 *   "<slug-pokeapi>": [ "<TIER>", <confiance> ]
 *
 *   <slug-pokeapi>  Identifiant PokéAPI en minuscules (ex: "flutter-mane",
 *                   "lycanroc-midday"). La résolution se fait d'abord sur la
 *                   forme exacte, puis sur l'espèce (ex: "lycanroc").
 *
 *   <TIER>          "SS" | "S" | "A" | "B" | "C" | "D"   (voir SCALE plus bas)
 *
 *   <confiance>     2 = HAUTE  → la donnée peut JUSTIFIER une recommandation de
 *                                remplacement.
 *                   1 = MOYENNE→ la donnée peut seulement BLOQUER une
 *                                recommandation (véto), jamais la justifier.
 *
 *   Un Pokémon ABSENT de cette table a un tier "inconnu". Le moteur d'analyse
 *   refuse alors catégoriquement de recommander un remplacement le concernant
 *   (règle « en cas de doute, pas de changement »).
 *
 * POURQUOI DEUX NIVEAUX DE CONFIANCE ?
 * ------------------------------------
 * L'exigence du projet est qu'une recommandation positive ne soit JAMAIS
 * hasardeuse. Une donnée de tier moyennement fiable ne doit donc pas pouvoir
 * pousser l'utilisateur à casser son équipe. Elle peut en revanche servir de
 * garde-fou : si elle suggère que le candidat est faible, on s'abstient.
 * L'asymétrie est volontaire et va toujours dans le sens de la prudence.
 *
 * PROVENANCE
 * ----------
 * Instantané curé à partir des classements de viabilité Génération 9
 * (Écarlate / Violet) : placements Smogon SV (Ubers / OU / UU / RU / NU / PU)
 * et représentation en VGC / Battle Stadium, recoupés avec les tier lists
 * publiques citées dans le README (Game8, RankedBoost, PropelRC,
 * Rosenberry Rooms, Pikalytics).
 *
 * ⚠️  Cet instantané n'a PAS pu être régénéré automatiquement au moment de
 *     l'écriture (les hôtes concernés étaient injoignables depuis
 *     l'environnement de build). Il doit être considéré comme une base de
 *     départ raisonnable, pas comme une vérité figée.
 *
 *     👉  Pour le régénérer à partir de sources lisibles par une machine :
 *            node scripts/build-data.mjs --tiers
 *         (voir README.md, section « Mettre à jour les données »).
 *
 * Les Pokémon non pleinement évolués ne sont volontairement pas notés au-dessus
 * de "D" : le moteur détecte de toute façon leur statut « non évolué » via la
 * chaîne d'évolution PokéAPI, en direct, et raisonne sur leur évolution.
 */
(function (root) {
  'use strict';

  /** Échelle de viabilité, du plus fort au plus faible. */
  var SCALE = {
    SS: { score: 5, label: 'SS', desc: 'Dominant / restreint (banni du jeu standard)' },
    S:  { score: 4, label: 'S',  desc: 'Très fort — pilier du métagame' },
    A:  { score: 3, label: 'A',  desc: 'Fort — parfaitement viable en compétitif' },
    B:  { score: 2, label: 'B',  desc: 'Moyen — viable avec du soutien ou en tier inférieur' },
    C:  { score: 1, label: 'C',  desc: 'Faible — peu utilisé en compétitif' },
    D:  { score: 0, label: 'D',  desc: 'Très faible / non évolué' }
  };

  /* eslint-disable key-spacing, no-multi-spaces */
  var ENTRIES = {
    /* ---------------------------------------------------------------- SS --
     * Légendaires « restreints » et Pokémon interdits en jeu standard.
     * Placement non controversé → confiance haute.
     */
    'koraidon':              ['SS', 2],
    'miraidon':              ['SS', 2],
    'terapagos':             ['SS', 2],
    'terapagos-stellar':     ['SS', 2],
    'calyrex-shadow-rider':  ['SS', 2],
    'calyrex-ice-rider':     ['SS', 2],
    'zacian':                ['SS', 2],
    'zacian-crowned':        ['SS', 2],
    'zamazenta':             ['SS', 2],
    'zamazenta-crowned':     ['SS', 2],
    'kyogre':                ['SS', 2],
    'groudon':               ['SS', 2],
    'rayquaza':              ['SS', 2],
    'mewtwo':                ['SS', 2],
    'arceus':                ['SS', 2],
    'dialga':                ['SS', 2],
    'dialga-origin':         ['SS', 2],
    'palkia':                ['SS', 2],
    'palkia-origin':         ['SS', 2],
    'giratina':              ['SS', 2],
    'giratina-origin':       ['SS', 2],
    'eternatus':             ['SS', 2],
    'lunala':                ['SS', 2],
    'solgaleo':              ['SS', 2],
    'necrozma-dusk':         ['SS', 2],
    'necrozma-dawn':         ['SS', 2],
    'xerneas':               ['SS', 2],
    'yveltal':               ['SS', 2],
    'zygarde':               ['SS', 2],
    'ho-oh':                 ['SS', 2],
    'lugia':                 ['SS', 2],
    'reshiram':              ['SS', 2],
    'zekrom':                ['SS', 2],
    'kyurem-black':          ['SS', 2],
    'kyurem-white':          ['SS', 2],

    /* ----------------------------------------------------------------- S --
     * Piliers du métagame génération 9 (standard) : présence massive,
     * puissance reconnue par toutes les sources.
     */
    'flutter-mane':          ['S', 2],
    'chien-pao':             ['S', 2],
    'chi-yu':                ['S', 2],
    'ting-lu':               ['S', 2],
    'gholdengo':             ['S', 2],
    'great-tusk':            ['S', 2],
    'kingambit':             ['S', 2],
    'dragapult':             ['S', 2],
    'iron-bundle':           ['S', 2],
    'iron-valiant':          ['S', 2],
    'roaring-moon':          ['S', 2],
    'raging-bolt':           ['S', 2],
    'gouging-fire':          ['S', 2],
    'iron-crown':            ['S', 2],
    'iron-boulder':          ['S', 2],
    'walking-wake':          ['S', 2],
    'garchomp':              ['S', 2],
    'baxcalibur':            ['S', 2],
    'dragonite':             ['S', 2],
    'landorus':              ['S', 2],
    'landorus-therian':      ['S', 2],
    'urshifu':               ['S', 2],
    'urshifu-rapid-strike':  ['S', 2],
    'ogerpon':               ['S', 2],
    'ogerpon-wellspring':    ['S', 2],
    'ogerpon-hearthflame':   ['S', 2],
    'incineroar':            ['S', 2],
    'rillaboom':             ['S', 2],
    'volcarona':             ['S', 2],
    'heatran':               ['S', 2],
    'glimmora':              ['S', 2],
    'archaludon':            ['S', 2],
    'samurott-hisui':        ['S', 2],
    'enamorus':              ['S', 2],
    'zapdos':                ['S', 2],
    'kyurem':                ['S', 2],
    'ursaluna':              ['S', 2],
    'ursaluna-bloodmoon':    ['S', 2],
    'iron-moth':             ['S', 2],
    'clodsire':              ['S', 2],
    'corviknight':           ['S', 2],
    'toxapex':               ['S', 2],
    'gliscor':               ['S', 2],
    'slowking-galar':        ['S', 2],
    'hatterene':             ['S', 1],
    'sinistcha':             ['S', 1],
    'basculegion':           ['S', 1],
    'whimsicott':            ['S', 1],
    'pelipper':              ['S', 1],
    'amoonguss':             ['S', 2],

    /* ----------------------------------------------------------------- A --
     * Solides et pleinement viables, sans dominer le métagame.
     */
    'annihilape':            ['A', 2],
    'meowscarada':           ['A', 2],
    'skeledirge':            ['A', 2],
    'quaquaval':             ['A', 2],
    'ceruledge':             ['A', 2],
    'armarouge':             ['A', 2],
    'tinkaton':              ['A', 2],
    'palafin':               ['A', 2],
    'palafin-hero':          ['A', 2],
    'garganacl':             ['A', 2],
    'dondozo':               ['A', 2],
    'tatsugiri':             ['A', 2],
    'maushold':              ['A', 2],
    'espathra':              ['A', 2],
    'kilowattrel':           ['A', 1],
    'bombirdier':            ['A', 1],
    'orthworm':              ['A', 1],
    'scizor':                ['A', 2],
    'gyarados':              ['A', 2],
    'tyranitar':             ['A', 2],
    'salamence':             ['A', 2],
    'metagross':             ['A', 2],
    'hydreigon':             ['A', 2],
    'goodra-hisui':          ['A', 2],
    'lokix':                 ['A', 1],
    'kleavor':               ['A', 2],
    'sneasler':              ['A', 2],
    'iron-hands':            ['A', 2],
    'iron-treads':           ['A', 2],
    'iron-jugulis':          ['A', 1],
    'iron-thorns':           ['A', 1],
    'iron-leaves':           ['A', 1],
    'brute-bonnet':          ['A', 1],
    'sandy-shocks':          ['A', 1],
    'scream-tail':           ['A', 1],
    'slither-wing':          ['A', 1],
    'wo-chien':              ['A', 1],
    'tinkatuff':             ['C', 1],
    'talonflame':            ['A', 1],
    'rotom-wash':            ['A', 2],
    'rotom-heat':            ['A', 1],
    'gardevoir':             ['A', 2],
    'gengar':                ['A', 2],
    'greninja':              ['A', 2],
    'cinderace':             ['A', 2],
    'zoroark-hisui':         ['A', 2],
    'lilligant-hisui':       ['A', 1],
    'arcanine':              ['A', 2],
    'arcanine-hisui':        ['A', 1],
    'pawmot':                ['A', 1],
    'revavroom':             ['A', 1],
    'grimmsnarl':            ['A', 2],
    'mimikyu':               ['A', 2],
    'primarina':             ['A', 2],
    'azumarill':             ['A', 2],
    'excadrill':             ['A', 2],
    'ferrothorn':            ['A', 2],
    'hippowdon':             ['A', 1],
    'skarmory':              ['A', 1],
    'blissey':               ['A', 2],
    'chansey':               ['A', 1],
    'dragalge':              ['B', 1],
    'noivern':               ['B', 1],
    'staraptor':             ['A', 1],
    'lucario':               ['A', 2],
    'togekiss':              ['A', 2],
    'weavile':               ['A', 2],
    'breloom':               ['A', 2],
    'volcanion':             ['A', 1],
    'tapu-koko':             ['A', 2],
    'tapu-fini':             ['A', 2],
    'tapu-lele':             ['A', 2],
    'tapu-bulu':             ['A', 1],
    'thundurus':             ['A', 1],
    'thundurus-therian':     ['A', 1],
    'tornadus':              ['A', 1],
    'tornadus-therian':      ['A', 2],
    'suicune':               ['A', 1],
    'raikou':                ['A', 1],
    'entei':                 ['A', 1],
    'moltres':               ['A', 1],
    'articuno':              ['B', 1],
    'regieleki':             ['A', 1],
    'regidrago':             ['A', 1],
    'glastrier':             ['B', 1],
    'spectrier':             ['A', 1],
    'okidogi':               ['A', 1],
    'munkidori':             ['A', 1],
    'fezandipiti':           ['A', 1],
    'hydrapple':             ['A', 1],
    'gouging':               ['A', 1],

    /* ----------------------------------------------------------------- B --
     * Corrects : jouables, mais nettement moins efficaces que le haut du
     * classement. Le plus souvent cantonnés aux tiers inférieurs.
     */
    'clefable':              ['B', 2],
    'jolteon':               ['B', 1],
    'vaporeon':              ['B', 1],
    'flareon':               ['C', 1],
    'espeon':                ['B', 1],
    'umbreon':               ['B', 1],
    'leafeon':               ['C', 1],
    'glaceon':               ['C', 1],
    'sylveon':               ['B', 2],
    'crobat':                ['B', 1],
    'houndoom':              ['B', 1],
    'flygon':                ['B', 1],
    'altaria':               ['B', 1],
    'ampharos':              ['B', 1],
    'donphan':               ['B', 1],
    'bisharp':               ['B', 1],
    'pangoro':               ['B', 1],
    'toxicroak':             ['B', 1],
    'mudsdale':              ['B', 1],
    'oricorio':              ['B', 1],
    'ribombee':              ['B', 1],
    'garchomp-mega':         ['S', 1],
    'klefki':                ['B', 1],
    'meowstic':              ['C', 1],
    'dachsbun':              ['B', 1],
    'arboliva':              ['B', 1],
    'bellibolt':             ['B', 1],
    'brambleghast':          ['B', 1],
    'cetitan':               ['B', 1],
    'clawitzer':             ['B', 1],
    'dudunsparce':           ['B', 1],
    'farigiraf':             ['B', 1],
    'flamigo':               ['B', 1],
    'glalie':                ['C', 1],
    'grafaiai':              ['B', 1],
    'houndstone':            ['B', 1],
    'kingdra':               ['B', 1],
    'klawf':                 ['B', 1],
    'magnezone':             ['B', 2],
    'mabosstiff':            ['B', 1],
    'oinkologne':            ['C', 1],
    'pincurchin':            ['C', 1],
    'polteageist':           ['B', 1],
    'rabsca':                ['B', 1],
    'scovillain':            ['C', 1],
    'toedscruel':            ['B', 1],
    'veluza':                ['B', 1],
    'wugtrio':               ['C', 1],
    'lycanroc':              ['C', 2],
    'lycanroc-midday':       ['C', 2],
    'lycanroc-midnight':     ['C', 2],
    'lycanroc-dusk':         ['B', 2],
    'passimian':             ['C', 1],
    'oranguru':              ['C', 1],
    'komala':                ['C', 1],
    'turtonator':            ['C', 1],
    'drampa':                ['C', 1],
    'bruxish':               ['C', 1],
    'palossand':             ['C', 1],
    'golisopod':             ['B', 1],
    'mudsdale-x':            ['C', 1],

    /* ------------------------------------------------------------- C / D --
     * Faibles en compétitif, ou Pokémon non pleinement évolués.
     * Rappel : le statut « non évolué » est de toute façon détecté en direct
     * via la chaîne d'évolution PokéAPI ; ces entrées ne sont là que pour
     * l'affichage.
     */
    'rockruff':              ['D', 2],
    'sprigatito':            ['D', 2],
    'floragato':             ['D', 2],
    'fuecoco':               ['D', 2],
    'crocalor':              ['D', 2],
    'quaxly':                ['D', 2],
    'quaxwell':              ['D', 2],
    'pawmi':                 ['D', 2],
    'pawmo':                 ['D', 2],
    'tandemaus':             ['D', 2],
    'nacli':                 ['D', 2],
    'naclstack':             ['D', 2],
    'charcadet':             ['D', 2],
    'tinkatink':             ['D', 2],
    'finizen':               ['D', 2],
    'frigibax':              ['D', 2],
    'arctibax':              ['D', 2],
    'gible':                 ['D', 2],
    'gabite':                ['D', 2],
    'dreepy':                ['D', 2],
    'drakloak':              ['D', 2],
    'larvesta':              ['D', 2],
    'magikarp':              ['D', 2],
    'gyarados-mega':         ['S', 1],
    'wooper-paldea':         ['D', 2],
    'zorua-hisui':           ['D', 2],
    'applin':                ['D', 2],
    'dipplin':               ['B', 1],
    'greavard':              ['D', 2],
    'shroodle':              ['D', 2],
    'maschiff':              ['D', 2],
    'nymble':                ['D', 2],
    'tadbulb':               ['D', 2],
    'varoom':                ['D', 2],
    'bramblin':              ['D', 2],
    'rellor':                ['D', 2],
    'flittle':               ['D', 2],
    'smoliv':                ['D', 2],
    'toedscool':             ['D', 2],
    'capsakid':              ['D', 2],
    'tarountula':            ['D', 2],
    'spidops':               ['D', 2],
    'lechonk':               ['D', 2],
    'wattrel':               ['D', 2],
    'fidough':               ['D', 2],
    'sinistea':              ['D', 2],
    'poltchageist':          ['D', 2],
    'shuckle':               ['C', 1],
    'delibird':              ['D', 2],
    'unown':                 ['D', 2],
    'wobbuffet':             ['C', 1],
    'dunsparce':             ['D', 2]
  };
  /* eslint-enable key-spacing, no-multi-spaces */

  root.POKESTATS_TIERS = {
    meta: {
      generation: 9,
      games: 'Pokémon Écarlate / Violet (+ DLC)',
      snapshot: '2026-08',
      /* ⚠️ HONNÊTETÉ SUR LA PROVENANCE
       * Ces entrées n'ont PAS été extraites des sites ci-dessous : ils étaient
       * injoignables depuis l'environnement de build. Elles reflètent une
       * connaissance générale des placements de viabilité Génération 9, et
       * doivent être considérées comme NON VÉRIFIÉES tant que
       * `npm run build:tiers` n'a pas été lancé.
       *
       * Les sites listés sont donc des références RECOMMANDÉES pour recouper
       * ou régénérer ces données — pas des sources dont elles proviennent. */
      provenance: 'non vérifié — connaissance générale, à régénérer',
      sourcesRecommandees: [
        'Pokémon Showdown / Smogon — formats-data.json (utilisé par build:tiers)',
        'Smogon University — placements de tiers Génération 9 (SV)',
        'Game8 — Best Pokemon Tier List (Scarlet & Violet)',
        'RankedBoost — Pokemon Scarlet & Violet Tier List',
        'PropelRC — Ultimate Pokemon Tier List',
        'Rosenberry Rooms — Pokemon Tier List',
        'Pikalytics — usage VGC / Battle Stadium'
      ],
      regenerate: 'node scripts/build-data.mjs --tiers',
      /* Avertissement affiché tel quel dans l'interface. */
      warning:
        "Instantané NON VÉRIFIÉ de viabilité compétitive : saisi de mémoire, pas " +
        "extrait des sites de référence. Les entrées de confiance moyenne ne servent " +
        "qu'à écarter une recommandation, jamais à la justifier. Un Pokémon absent de " +
        "la table est traité comme « tier inconnu ». Lancer `npm run build:tiers` " +
        "remplace cet instantané par des données vérifiables."
    },
    scale: SCALE,
    entries: ENTRIES
  };
})(typeof window !== 'undefined' ? window : globalThis);
