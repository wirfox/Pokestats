/*
 * data/names-fr.js — Index de secours « nom français → identifiant PokéAPI ».
 * ===========================================================================
 *
 * RÔLE EXACT DE CE FICHIER
 * ------------------------
 * Ce n'est PAS la source de vérité des noms français. C'est un simple index de
 * SECOURS, utilisé uniquement quand l'index complet ne peut pas être construit.
 *
 * L'application résout un nom saisi par l'utilisateur dans cet ordre :
 *
 *   1. Index complet construit en direct depuis PokéAPI (GraphQL), qui couvre
 *      les ~1025 espèces dans toutes les langues. Mis en cache dans
 *      localStorage. → source de vérité.
 *   2. Cet index de secours, si (1) est indisponible (hors ligne, endpoint
 *      GraphQL en panne, navigateur bloquant la requête).
 *   3. La saisie brute utilisée directement comme identifiant PokéAPI, ce qui
 *      couvre nativement les noms anglais ("rockruff", "great-tusk", ...).
 *
 * GARDE-FOU ANTI-ERREUR
 * ---------------------
 * Quelle que soit la voie de résolution, l'application ré-interroge PokéAPI et
 * AFFICHE TOUJOURS le nom français canonique renvoyé par l'API
 * (/pokemon-species → names[fr]). Une entrée erronée de cet index de secours
 * est donc immédiatement visible par l'utilisateur : le nom affiché ne
 * correspondrait pas à ce qu'il a tapé. Aucune analyse n'est faite sur les
 * noms — uniquement sur les données renvoyées par PokéAPI.
 *
 * Pour régénérer un index complet et hors ligne :
 *     node scripts/build-data.mjs --names
 *
 * Les clés sont normalisées à la lecture (minuscules, accents et
 * ponctuation retirés), on peut donc les écrire naturellement.
 */
(function (root) {
  'use strict';

  var SEED = {
    /* --- Départs de Paldea (Écarlate / Violet) --- */
    'Poussacha': 'sprigatito',      'Matourgeon': 'floragato',     'Miascarade': 'meowscarada',
    'Chochodile': 'fuecoco',        'Crocogril': 'crocalor',       'Flambusard': 'skeledirge',
    'Coiffeton': 'quaxly',          'Canarbello': 'quaxwell',      'Palmaval': 'quaquaval',

    /* --- Paldea : lignées courantes --- */
    'Pomdorochi': 'applin',         'Pomdepik': 'flapple',         'Dratatin': 'appletun',
    'Tissenlin': 'flittle',         'Cleopsytra': 'espathra',
    'Compagnol': 'tandemaus',       'Famignol': 'maushold',
    'Selutin': 'nacli',             'Amassel': 'naclstack',        'Gigansel': 'garganacl',
    'Charbambin': 'charcadet',      'Carmadura': 'armarouge',      'Malvalame': 'ceruledge',
    'Forgerette': 'tinkatink',      'Forgella': 'tinkatuff',       'Forgelina': 'tinkaton',
    'Dofin': 'finizen',             'Superdofin': 'palafin',
    'Frigodo': 'frigibax',          'Cryodo': 'arctibax',          'Glaivodo': 'baxcalibur',
    'Oyacata': 'dondozo',           'Nigirigon': 'tatsugiri',
    'Terraiste': 'clodsire',        'Axoloto': 'wooper',
    'Chiend': 'greavard',           'Tomberro': 'houndstone',
    'Pohm': 'pawmi',                'Pohmotte': 'pawmo',           'Pohmarmotte': 'pawmot',
    'Gorafarigue': 'farigiraf',     'Girafarig': 'girafarig',
    'Deusolourdo': 'dudunsparce',   'Insolourdo': 'dunsparce',
    'Fongus': 'toedscool',          'Fongus-Roi': 'toedscruel',
    'Tapatoès': 'nymble',           'Lokix': 'lokix',
    'Mordudor': 'gimmighoul',       'Gromago': 'gholdengo',

    /* --- Paradoxes & Trésors du Fléau --- */
    'Fort-Ivoire': 'great-tusk',    'Hurle-Queue': 'flutter-mane',
    'Rugit-Lune': 'roaring-moon',   'Pelage-Sablé': 'sandy-shocks',
    'Hotte-de-Fer': 'iron-bundle',  'Garde-de-Fer': 'iron-valiant',
    'Paume-de-Fer': 'iron-hands',   'Roue-de-Fer': 'iron-treads',
    'Chongjian': 'wo-chien',        'Baojian': 'chien-pao',
    'Dinglu': 'ting-lu',            'Yuyu': 'chi-yu',

    /* --- Lignée de démonstration (Rocabot) --- */
    'Rocabot': 'rockruff',          'Lougaroc': 'lycanroc',

    /* --- Gen 1 --- */
    'Bulbizarre': 'bulbasaur',      'Herbizarre': 'ivysaur',       'Florizarre': 'venusaur',
    'Salamèche': 'charmander',      'Reptincel': 'charmeleon',     'Dracaufeu': 'charizard',
    'Carapuce': 'squirtle',         'Carabaffe': 'wartortle',      'Tortank': 'blastoise',
    'Pikachu': 'pikachu',           'Raichu': 'raichu',            'Évoli': 'eevee',
    'Aquali': 'vaporeon',           'Voltali': 'jolteon',          'Pyroli': 'flareon',
    'Mentali': 'espeon',            'Noctali': 'umbreon',          'Phyllali': 'leafeon',
    'Givrali': 'glaceon',           'Nymphali': 'sylveon',
    'Ronflex': 'snorlax',           'Magicarpe': 'magikarp',       'Léviator': 'gyarados',
    'Minidraco': 'dratini',         'Draco': 'dragonair',          'Dracolosse': 'dragonite',
    'Mewtwo': 'mewtwo',             'Mew': 'mew',
    'Artikodin': 'articuno',        'Électhor': 'zapdos',          'Sulfura': 'moltres',
    'Abra': 'abra',                 'Kadabra': 'kadabra',          'Alakazam': 'alakazam',
    'Fantominus': 'gastly',         'Spectrum': 'haunter',         'Ectoplasma': 'gengar',
    'Machoc': 'machop',             'Machopeur': 'machoke',        'Mackogneur': 'machamp',
    'Insécateur': 'scyther',        'Scarabrute': 'pinsir',
    'Onix': 'onix',                 'Lokhlass': 'lapras',          'Métamorph': 'ditto',
    'Ptéra': 'aerodactyl',          'Kangourex': 'kangaskhan',     'Ossatueur': 'marowak',
    'Tauros': 'tauros',             'Nidoking': 'nidoking',        'Nidoqueen': 'nidoqueen',
    'Élektek': 'electabuzz',        'Magmar': 'magmar',            'Porygon': 'porygon',
    'Rhinocorne': 'rhyhorn',        'Rhinoféros': 'rhydon',        'Rhinastoc': 'rhyperior',

    /* --- Gen 2 --- */
    'Germignon': 'chikorita',       'Méganium': 'meganium',
    'Héricendre': 'cyndaquil',      'Typhlosion': 'typhlosion',
    'Kaiminus': 'totodile',         'Aligatueur': 'feraligatr',
    'Noarfang': 'noctowl',          'Airmure': 'skarmory',
    'Malosse': 'houndour',          'Démolosse': 'houndoom',
    'Scarhino': 'heracross',        'Cizayox': 'scizor',
    'Embrylex': 'larvitar',         'Ymphect': 'pupitar',          'Tyranocif': 'tyranitar',
    'Steelix': 'steelix',           'Lugia': 'lugia',              'Ho-Oh': 'ho-oh',
    'Raikou': 'raikou',             'Entei': 'entei',              'Suicune': 'suicune',
    'Corayon': 'corsola',           'Farfuret': 'sneasel',         'Dimoret': 'weavile',

    /* --- Gen 3 --- */
    'Arcko': 'treecko',             'Massko': 'grovyle',           'Jungko': 'sceptile',
    'Poussifeu': 'torchic',         'Galifeu': 'combusken',        'Braségali': 'blaziken',
    'Gobou': 'mudkip',              'Flobio': 'marshtomp',         'Laggron': 'swampert',
    'Draby': 'bagon',               'Drackhaus': 'shelgon',        'Drattak': 'salamence',
    'Terhal': 'beldum',             'Métang': 'metang',            'Métalosse': 'metagross',
    'Absol': 'absol',               'Ténéfix': 'sableye',          'Mysdibule': 'mawile',
    'Tarsal': 'ralts',              'Kirlia': 'kirlia',            'Gardevoir': 'gardevoir',
    'Gallame': 'gallade',           'Milobellus': 'milotic',       'Ludicolo': 'ludicolo',
    'Groudon': 'groudon',           'Kyogre': 'kyogre',            'Rayquaza': 'rayquaza',
    'Latias': 'latias',             'Latios': 'latios',            'Jirachi': 'jirachi',
    'Deoxys': 'deoxys',             'Métang-Mega': 'metagross-mega',

    /* --- Gen 4 --- */
    'Tortipouss': 'turtwig',        'Boskara': 'grotle',           'Torterra': 'torterra',
    'Ouisticram': 'chimchar',       'Chimpenfeu': 'monferno',      'Simiabraz': 'infernape',
    'Tiplouf': 'piplup',            'Prinplouf': 'prinplup',       'Pingoléon': 'empoleon',
    'Riolu': 'riolu',               'Lucario': 'lucario',
    'Griknot': 'gible',             'Carmache': 'gabite',          'Carchacrok': 'garchomp',
    'Togekiss': 'togekiss',         'Roserade': 'roserade',
    'Étourmi': 'starly',            'Étourvol': 'staravia',        'Étouraptor': 'staraptor',
    'Mammochon': 'mamoswine',       'Blizzaroi': 'abomasnow',      'Motisma': 'rotom',
    'Dialga': 'dialga',             'Palkia': 'palkia',            'Giratina': 'giratina',
    'Darkrai': 'darkrai',           'Cresselia': 'cresselia',      'Heatran': 'heatran',
    'Élecsprint': 'blitzle',        'Lixy': 'shinx',               'Luxray': 'luxray',

    /* --- Gen 5 --- */
    'Vipélierre': 'snivy',          'Lianaja': 'servine',          'Majaspic': 'serperior',
    'Gruikui': 'tepig',             'Grotichon': 'pignite',        'Roitiflam': 'emboar',
    'Moustillon': 'oshawott',       'Mateloutre': 'dewott',        'Clamiral': 'samurott',
    'Solochi': 'deino',             'Diamat': 'zweilous',          'Trioxhydre': 'hydreigon',
    'Pyronille': 'larvesta',        'Pyrax': 'volcarona',
    'Funécire': 'litwick',          'Mélancolux': 'lampent',       'Lugulabre': 'chandelure',
    'Gringolem': 'golett',          'Golemastoc': 'golurk',
    'Scalpion': 'pawniard',         'Scalproie': 'bisharp',        'Scalpereur': 'kingambit',
    'Coupenotte': 'axew',           'Incisache': 'fraxure',        'Tranchodon': 'haxorus',
    'Cobaltium': 'cobalion',        'Terrakium': 'terrakion',      'Viridium': 'virizion',
    'Boréas': 'tornadus',           'Fulguris': 'thundurus',       'Démétéros': 'landorus',
    'Zekrom': 'zekrom',             'Reshiram': 'reshiram',        'Kyurem': 'kyurem',
    'Nucléos': 'solosis',           'Symbios': 'reuniclus',        'Nanméouïe': 'audino',

    /* --- Gen 6 --- */
    'Marisson': 'chespin',          'Boguérisse': 'quilladin',     'Blindépique': 'chesnaught',
    'Feunnec': 'fennekin',          'Roussil': 'braixen',          'Goupelin': 'delphox',
    'Grenousse': 'froakie',         'Croâporal': 'frogadier',      'Amphinobi': 'greninja',
    'Xerneas': 'xerneas',           'Yveltal': 'yveltal',          'Zygarde': 'zygarde',
    'Trousselin': 'klefki',         'Rubombelle': 'ribombee',      'Dedenne': 'dedenne',
    'Noacier': 'ferrothorn',        'Mistigrix': 'meowstic',

    /* --- Gen 7 --- */
    'Brindibou': 'rowlet',          'Efflèche': 'dartrix',         'Archéduc': 'decidueye',
    'Flamiaou': 'litten',           'Matoufeu': 'torracat',        'Félinferno': 'incineroar',
    'Otaquin': 'popplio',           'Otarlette': 'brionne',        'Oratoria': 'primarina',
    'Mimiqui': 'mimikyu',           'Bacabouh': 'sandygast',       'Trépassable': 'palossand',
    'Tokorico': 'tapu-koko',        'Tokopiyon': 'tapu-lele',      'Tokotoro': 'tapu-bulu',
    'Tokopisco': 'tapu-fini',       'Sarmuraï': 'golisopod',

    /* --- Gen 8 --- */
    'Ouistempo': 'grookey',         'Badabouin': 'thwackey',       'Gorythmic': 'rillaboom',
    'Flambino': 'scorbunny',        'Lapyro': 'raboot',            'Pyrobut': 'cinderace',
    'Larméléon': 'sobble',          'Arrozard': 'drizzile',        'Lézargus': 'inteleon',
    'Fantyrm': 'dreepy',            'Dispareptil': 'drakloak',     'Lanssorien': 'dragapult',
    'Corvaillus': 'corviknight',    'Angoliath': 'grimmsnarl',
    'Zacian': 'zacian',             'Zamazenta': 'zamazenta',      'Éthernatos': 'eternatus',
    'Blizzeval': 'calyrex-ice-rider', 'Spectreval': 'calyrex-shadow-rider',
    'Sylveroy': 'calyrex',          'Wushours': 'urshifu',
    'Regieleki': 'regieleki',       'Regidrago': 'regidrago',

    /* --- Gen 9 : DLC --- */
    'Ogerpon': 'ogerpon',           'Terapagos': 'terapagos',
    'Koraidon': 'koraidon',         'Miraidon': 'miraidon',
    'Chaflamme': 'poltchageist',    'Théffroi': 'sinistcha',
    'Pomdorochi-Dipplin': 'dipplin','Pomdramour': 'hydrapple',
    'Archaludon': 'archaludon',     'Gastrodon': 'gastrodon'
  };

  root.POKESTATS_NAMES_FR = {
    meta: {
      role: 'index de secours (fallback) — la source de vérité est PokéAPI',
      regenerate: 'node scripts/build-data.mjs --names',
      note:
        "Le nom français affiché par l'application provient TOUJOURS de PokéAPI " +
        "(/pokemon-species → names[fr]), jamais de cet index."
    },
    seed: SEED
  };
})(typeof window !== 'undefined' ? window : globalThis);
