# PokeStats

**Analyseur d'équipe pour Pokémon Écarlate / Violet.**
Tu viens de capturer un Pokémon&nbsp;? Cet outil te dit — de façon vérifiable —
s'il mérite une place dans ton équipe, s'il vaut mieux que l'un de tes membres
actuels, et si son évolution justifie de l'entraîner.

> Application 100 % côté client : HTML + CSS + JavaScript, sans framework et
> sans backend. Il suffit d'ouvrir `index.html` dans un navigateur.

---

## Sommaire

- [Principe : un outil volontairement prudent](#principe--un-outil-volontairement-prudent)
- [Tester l'app en local](#tester-lapp-en-local)
- [Mettre l'app en ligne](#mettre-lapp-en-ligne)
- [Sources de données](#sources-de-données)
- [Comment la recommandation est calculée](#comment-la-recommandation-est-calculée)
- [Mettre à jour les données](#mettre-à-jour-les-données)
- [Vérifier les données toi-même](#vérifier-les-données-toi-même)
- [Tests](#tests)
- [Structure du projet](#structure-du-projet)
- [Limites connues](#limites-connues)
- [Mentions légales](#mentions-légales)

---

## Principe : un outil volontairement prudent

Deux règles de conception, et tout le reste en découle.

> **1. Une recommandation positive doit être démontrable.** Dans tous les autres
> cas, l'outil répond « pas de changement recommandé ».
>
> **2. Un Pokémon hors équipe ne gagne aucune expérience.** Un candidat non
> évolué est donc jugé sur sa **forme finale**, jamais sur ses stats du moment.

Concrètement, l'application ne dira jamais « remplace X par ce Pokémon » sur la
base d'une intuition. Une recommandation doit franchir deux barrières
successives :

1. **Six conditions obligatoires**, toutes requises. Un seul échec bloque
   définitivement la recommandation.
3. **Un faisceau d'au moins deux indices** objectifs et indépendants.

Avec un seul indice, la conclusion devient « à tester en combat, mais pas
objectivement meilleur ». Avec zéro indice, ou dès qu'une condition obligatoire
échoue&nbsp;: « pas de changement recommandé ».

Cette asymétrie est délibérée. L'outil accepte de rater une bonne suggestion,
mais pas d'en faire une mauvaise.

**La règle de l'expérience.** Un Pokémon qui n'est pas dans l'équipe ne monte
jamais de niveau, donc n'évolue jamais. « Il n'est pas encore évolué » ne peut
donc pas servir de motif pour l'écarter — c'est au contraire la raison de
l'intégrer. Un candidat non évolué est jugé sur sa forme **terminale**, qui doit
franchir exactement les mêmes barrières que n'importe quel autre candidat : le
potentiel n'assouplit aucune règle, il déplace seulement l'objet de la
comparaison. Quand la forme finale passe, la réponse est « intègre-le
maintenant », avec le coût annoncé (équipe temporairement plus faible, condition
d'évolution à remplir).

**Corollaire important** : quand une donnée manque (tier inconnu, PokéAPI
injoignable, chaîne d'évolution illisible), l'application le dit et s'abstient.
Elle ne comble jamais un trou par une estimation.

---

## Tester l'app en local

### Le plus simple

Clone le dépôt et ouvre `index.html` dans ton navigateur — double-clic suffit.

```bash
git clone <url-du-depot>
cd Pokestats
# puis ouvre index.html
```

Aucune étape de build, aucune dépendance à installer. Les scripts sont chargés
en `<script>` classiques (pas de modules ES) précisément pour que l'ouverture en
`file://` fonctionne.

Une connexion Internet est nécessaire : toutes les données Pokémon sont
récupérées en direct depuis PokéAPI.

### Avec un serveur local (recommandé)

Certains navigateurs restreignent `localStorage` en `file://`, ce qui désactive
le cache et la sauvegarde de ton équipe. Un petit serveur local évite ça :

```bash
npm run serve          # http://localhost:8080
# ou, sans Node :
python3 -m http.server 8080
```

---

## Mettre l'app en ligne

Le site est entièrement statique : n'importe quel hébergeur de fichiers fait
l'affaire.

### GitHub Pages

1. Pousse le dépôt sur GitHub.
2. *Settings* → *Pages* → *Source* : `Deploy from a branch`.
3. Choisis ta branche et le dossier `/ (root)`, puis *Save*.
4. Le site est publié sur `https://<utilisateur>.github.io/<depot>/`.

### Netlify

- **Glisser-déposer** : dépose le dossier du projet sur
  [app.netlify.com/drop](https://app.netlify.com/drop).
- **Depuis Git** : connecte le dépôt, laisse la commande de build vide et mets
  `.` comme *publish directory*.

### Vercel

```bash
npx vercel
```

Réponds « other » au framework et `.` au répertoire de sortie — il n'y a rien à
compiler.

---

## Sources de données

### Données objectives — PokéAPI, en direct

Tout ce qui est factuel est récupéré à l'exécution depuis
[PokéAPI](https://pokeapi.co), par le navigateur de l'utilisateur.
**Rien n'est codé en dur.**

| Donnée | Endpoint |
| --- | --- |
| Stats de base, types, talents, sprites | `/pokemon/{nom}` |
| Nom français officiel, statut légendaire | `/pokemon-species/{nom}` |
| Chaîne d'évolution et conditions | `/evolution-chain/{id}` |
| Noms de formes localisés (Diurne, Crépusculaire…) | `/pokemon-form/{nom}` |
| **Table d'efficacité des types** | `/type/{nom}` |

Le dernier point mérite d'être souligné : même la table des faiblesses et
résistances est reconstruite depuis les `damage_relations` officielles, plutôt
que saisie de mémoire. Elle correspond donc toujours à la génération courante.

Les réponses sont mises en cache (mémoire + `localStorage`) pour rester
raisonnable vis-à-vis d'une API publique et gratuite.

### Données de viabilité — instantané curé

La notion de « tier » n'existe pas dans PokéAPI : elle vient de la communauté
compétitive. Elle est stockée dans [`data/tiers.js`](data/tiers.js), au format :

```js
"<slug-pokeapi>": ["<TIER>", <confiance>]
```

| Tier | Signification |
| --- | --- |
| `SS` | Dominant / restreint (banni du jeu standard) |
| `S`  | Très fort — pilier du métagame |
| `A`  | Fort — parfaitement viable en compétitif |
| `B`  | Moyen — viable avec du soutien ou en tier inférieur |
| `C`  | Faible — peu utilisé en compétitif |
| `D`  | Très faible / non pleinement évolué |

**Le champ « confiance » est le cœur du dispositif de sûreté :**

| Valeur | Sens | Effet sur les recommandations |
| --- | --- | --- |
| `2` (haute) | Placement non contesté | Peut **justifier** une recommandation |
| `1` (moyenne) | Placement plausible mais discutable | Peut seulement **bloquer** une recommandation, jamais la justifier |
| *absent de la table* | Tier inconnu | **Interdit** toute recommandation de remplacement |

L'asymétrie est volontaire : une donnée incertaine peut servir de garde-fou,
jamais d'argument. Dans l'interface, un tier de confiance moyenne est signalé
par le symbole `≈`.

Sources de cette table :

| | |
| --- | --- |
| **Source** | [`@pkmn/dex`](https://www.npmjs.com/package/@pkmn/dex), paquet npm à version exacte |
| **Origine des données** | Pokémon Showdown, qui est la référence d'implémentation de [Smogon](https://www.smogon.com/) |
| **Couverture** | 925 entrées, dont 178 formes alternatives |
| **Régénérer** | `npm run build:tiers` |

**Pourquoi un paquet npm plutôt qu'un site.** Bulbapédia, Poképédia, Serebii ou
PokémonDB sont d'excellentes sources *humaines*, mais de mauvaises sources
*machine* : leur HTML change sans préavis, il n'y a ni version ni somme de
contrôle, et rien ne garantit qu'une régénération dans six mois donnera le même
résultat. Un paquet npm épinglé donne exactement l'inverse — version exacte,
contenu immuable, génération déterministe, et aucun réseau requis. C'est ce qui
rend ces données **stables**.

Correspondance appliquée entre les tiers Smogon et l'échelle de l'application :

| Smogon | PokeStats | Effectif |
| --- | --- | --- |
| AG, Uber | `SS` | 75 |
| OU, UUBL | `S` | 62 |
| UU, RUBL | `A` | 55 |
| RU, NUBL | `B` | 55 |
| NU, PUBL | `C` | 52 |
| PU, ZU, ZUBL, NFE, LC | `D` | le reste |
| CAP, CAP LC, CAP NFE | *exclu* | Pokémon inventés par la communauté, absents du jeu |
| Illegal | *exclu* | indisponible en Génération 9 |

**~292 Pokémon réels n'ont volontairement aucun tier** : ceux qui ne sont pas
jouables en Génération 9 (Papilusion, Roucarnage…). Smogon ne les classe pas,
donc l'outil les traite comme « tier inconnu » et refuse toute recommandation
les concernant. C'est le comportement voulu : on ne peut pas les mettre dans une
équipe d'Écarlate / Violet de toute façon.

Les sites suivants restent d'excellentes références pour **recouper** un
placement à la main : [Smogon](https://www.smogon.com/),
[Poképédia](https://www.pokepedia.fr/),
[Bulbapedia](https://bulbapedia.bulbagarden.net/),
[PokémonDB](https://pokemondb.net/), [Serebii](https://www.serebii.net/),
[Pikalytics](https://www.pikalytics.com/) (usage VGC réel).

### Second avis : la tier list Game8

[`data/tiers-game8.json`](data/tiers-game8.json) contient la
[tier list Game8 pour le Combat Classé](https://game8.co/games/Pokemon-Scarlet-Violet/archives/397587)
(98 Pokémon), récupérée par `npm run build:game8`. Elle est affichée à côté du
tier Smogon, dans l'infobulle du badge.

> **Elle ne conditionne aucune décision — et c'est délibéré.**
>
> L'intuition de départ était : « si les deux listes divergent de deux crans,
> la donnée est douteuse, abaissons la confiance ». Les chiffres l'ont
> infirmée — **52 divergences sur 96**, ce qui n'est pas du bruit.
>
> La raison est structurelle. Le tier S de Game8 est peuplé de légendaires
> restreints (Zacian, Groudon, Kyogre, Koraidon, Miraidon, les deux Sylveroy)
> parce que le Combat Classé officiel les autorise ; le ladder singles de
> Smogon les bannit. Dans un classement où figurent Miraidon et Calyrex, tout
> Pokémon ordinaire descend mécaniquement d'un ou deux crans.
>
> Traiter ce décalage d'échelle comme un désaccord de fond aurait dégradé
> 52 des Pokémon les plus pertinents sans rien corriger. Ce n'est pas de la
> prudence, c'est un biais importé. Game8 reste donc un **contexte affiché**,
> utile si tu joues en Combat Classé, jamais un critère de décision.

### Noms français

[`data/names-fr.js`](data/names-fr.js) traduit ce que tu tapes (« Rocabot ») en
identifiant PokéAPI (`rockruff`).

| | |
| --- | --- |
| **Source** | [`pokemon`](https://www.npmjs.com/package/pokemon), paquet npm à version exacte |
| **Couverture** | 1025 noms — l'intégralité du Pokédex national |
| **Régénérer** | `npm run build:names` |

Ordre de résolution d'une saisie :

1. Index complet construit en direct depuis PokéAPI (une requête GraphQL), mis
   en cache dans `localStorage`.
2. L'index embarqué ci-dessus, si le premier échoue.
3. La saisie brute comme identifiant — ce qui couvre nativement l'anglais
   (`rockruff`, `great-tusk`…).

**Garde-fou :** le nom affiché à l'écran provient *toujours* de PokéAPI, jamais
de cet index. Et aucune analyse ne porte sur les noms — uniquement sur les
données renvoyées par l'API. Une erreur de nom ne peut donc pas fausser une
recommandation.

### Table d'efficacité des types

Construite en priorité depuis PokéAPI (`/type/{nom}` → `damage_relations`).
Si PokéAPI est injoignable, l'application bascule sur
[`data/type-chart.js`](data/type-chart.js) — la même table, générée depuis
`@pkmn/dex` — et le signale à l'écran. Sans ce repli, une panne de PokéAPI
bloquerait toute l'analyse de couverture.

Les tests utilisent exactement ce fichier, et non une copie indépendante qui
pourrait diverger.

## Comment la recommandation est calculée

### Étape 1 — Rôle et statistiques clés

Le rôle est déduit des seules stats de base, par des règles ordonnées et
chiffrées (aucun jugement subjectif) :

| Rôle | Détection | Stats clés comparées |
| --- | --- | --- |
| Sweeper physique | Vitesse ≥ 90 et meilleure offense ≥ 95, Att ≥ Att.Spé | Attaque + Vitesse |
| Sweeper spécial | Vitesse ≥ 90 et meilleure offense ≥ 95, Att.Spé > Att | Att. Spé. + Vitesse |
| Attaquant physique / spécial | Meilleure offense ≥ 110 (ou ≥ 100 sans robustesse) | Offense + robustesse associée |
| Mur / Tank | Robustesse ≥ 280 et Vitesse < 80 | PV + Déf + Déf. Spé. |
| Polyvalent | Aucun des cas ci-dessus | Total des six stats |

L'ordre compte : un Pokémon comme Scalpereur (135 d'Attaque mais très robuste)
est lu comme un attaquant, pas comme un mur.

**Double lecture.** Pour comparer un candidat C à un membre M, l'écart de stats
clés est mesuré *deux fois* : sous le rôle de M (C doit tenir son poste) et sous
le rôle de C. **C'est la valeur la plus défavorable qui est retenue.** Un
avantage doit être vrai dans les deux lectures.

### Étape 2 — Analyse de types de l'équipe

Pour chacun des 18 types d'attaque, l'outil compte combien de membres y sont
faibles. Un type auquel `max(3, moitié de l'équipe)` membres ou plus sont
faibles est une **faiblesse critique**.

### Étape 3 — Conditions obligatoires (toutes requises)

| # | Condition | Pourquoi |
| --- | --- | --- |
| 1 | Le tier du candidat **et** celui du membre visé sont connus | Sans référence de viabilité, aucun jugement |
| 2 | Le candidat est pleinement évolué | Un Pokémon non évolué ne remplace pas un membre en l'état |
| 3 | Son tier n'est pas inférieur | Ne jamais descendre en gamme |
| 4 | Ses stats clés ne sont inférieures sous **aucune** des deux lectures de rôle | Empêche les faux gains liés au choix du rôle |
| 5 | Pas de BST inférieur sans tier supérieur pour compenser (tolérance : 10 points) | Règle explicite anti-régression |
| 6 | Le remplacement n'augmente pas le nombre de faiblesses critiques | Ne pas casser l'équipe pour gagner un slot |

### Étape 4 — Faisceau d'indices (2 requis)

| Indice | Seuil |
| --- | --- |
| Tier nettement supérieur | ≥ 1 cran, **et** confiance haute des deux côtés |
| Stats clés supérieures | ≥ +12 % (dans la fourchette 10–15 % visée) |
| Total de stats supérieur | ≥ +30 de BST |
| Comble une faiblesse critique | Le candidat résiste à un type critique que le membre visé ne couvrait pas |

### Étape 5 — Verdict

Les verdicts sont examinés dans cet ordre ; le premier qui s'applique gagne.

| # | Situation | Réponse |
| --- | --- | --- |
| 1 | Une place est libre et le candidat (ou sa forme finale) est viable | **Ajout recommandé** — ou **À intégrer pour son évolution** si c'est une forme de base. On ne demande jamais d'écarter quelqu'un s'il reste un emplacement vacant |
| 2 | Le candidat, tel quel, franchit toutes les barrières | **Remplacement recommandé**, avec le membre nommé |
| 3 | Sa **forme finale** franchit toutes les barrières | **À intégrer pour son évolution** — avec le membre visé, la condition d'évolution et le creux temporaire annoncés |
| 4 | L'évolution est bien classée, sans supériorité démontrée | **À garder et entraîner** |
| 5 | Conditions obligatoires OK + 1 seul indice | **À tester, sans garantie** |
| 6 | Une condition obligatoire échoue, ou 0 indice | **Pas de changement recommandé** |
| — | PokéAPI injoignable | **Analyse impossible** — aucune conclusion |

Au cas 6, si le candidat est une forme de base, le motif affiché porte
toujours sur la **forme finale** (« même une fois évolué en X, il ne dépasse
aucun membre ») — jamais sur le fait qu'il ne soit pas encore évolué, ce qui
serait un argument circulaire.

Chaque verdict est accompagné, dans l'interface, du détail des arguments
retenus, des points bloquants et des chiffres qui les fondent. Le bloc
« Comment cette conclusion a-t-elle été obtenue&nbsp;? » rappelle l'intégralité
des règles et des seuils appliqués.

### Évolutions

Quand le candidat peut encore évoluer, l'outil :

1. Récupère la chaîne complète via PokéAPI, **y compris les formes alternatives
   jouables** (Lougaroc Diurne / Nocturne / Crépusculaire).
2. Écarte les formes non obtenables en Écarlate / Violet (Méga-Évolutions,
   Dynamax, formes de raid) — les inclure fausserait l'analyse.
3. Retient la **forme terminale** : une forme intermédiaire ne passe jamais
   devant, même si son tier est mieux renseigné. Griknot se juge sur Carchacrok,
   jamais sur Carmache. À égalité (lignées qui branchent, comme Évoli), on
   départage par le tier fiable puis par le BST.
4. Rejoue **la totalité** de l'analyse avec cette forme finale — mêmes six
   conditions obligatoires, mêmes deux indices requis.
5. Si elle passe, recommande de l'intégrer **maintenant**, en rappelant la
   contrainte d'expérience, la condition d'évolution et le fait que l'équipe
   sera temporairement plus faible sur cet emplacement.

C'est ce qui permet à l'outil de dire « prends ce Pokémon médiocre, c'est ce
qu'il devient qui compte » — sans jamais relâcher les garanties : un potentiel
faible reste un refus.

---

## Mettre à jour les données

```bash
npm run build:tiers     # table de viabilité, depuis Pokémon Showdown / Smogon
npm run build:names     # index des noms français, depuis PokéAPI
npm run build:data      # les deux
npm run export:json     # exporte les .js en .json (hors ligne, sans réseau)
node scripts/build-data.mjs --self-test   # vérifie la logique sans réseau
```

`build:tiers` s'appuie sur
[`formats-data.json`](https://play.pokemonshowdown.com/data/formats-data.json)
de Pokémon Showdown : c'est la seule source de viabilité à la fois publique,
structurée et mise à jour en continu. Les tier lists rédactionnelles (Game8,
RankedBoost…) ne sont pas exploitables automatiquement et servent de
recoupement manuel.

Correspondance appliquée :

| Smogon | PokeStats |
| --- | --- |
| AG, Uber | `SS` |
| OU, UUBL | `S` |
| UU, RUBL | `A` |
| RU, NUBL | `B` |
| NU, PUBL | `C` |
| PU, ZU, NFE, LC | `D` |
| Illegal / inconnu | *ignoré — jamais deviné* |

En cas d'échec réseau, les scripts n'écrasent rien et expliquent le problème.

---

## Vérifier les données toi-même

Ne me crois pas sur parole — confronte les fichiers à PokéAPI :

```bash
npm run verify:data                     # tout (~1866 requêtes, quelques minutes)
node scripts/verify-data.mjs --names    # noms français uniquement
node scripts/verify-data.mjs --tiers    # identifiants uniquement
node scripts/verify-data.mjs --json     # sortie machine
```

Le script signale, entrée par entrée, tout identifiant inconnu de PokéAPI et
tout nom français divergent du nom officiel. Code de sortie `1` s'il trouve un
écart, `2` si PokéAPI est injoignable.

> **Derrière un proxy ?** `fetch` de Node ignore `HTTPS_PROXY` par défaut, ce
> qui fait échouer toutes les requêtes en `403` sans explication. Le script
> détecte la variable et se relance tout seul avec `NODE_USE_ENV_PROXY=1` — tu
> n'as rien à faire.

> **Ce que le script ne peut pas vérifier : le tier lui-même.** PokéAPI n'expose
> aucune notion de viabilité — c'est une donnée communautaire, pas une donnée de
> jeu. Sa source est `@pkmn/dex`, dont la version exacte figure dans
> `data/tiers.js`. Pour la rafraîchir : `npm run build:tiers`.

### Récapitulatif de fiabilité

Dernier audit : **1866 entrées vérifiées contre PokéAPI, 0 écart.**

| Donnée | Provenance | Vérifié | Écarts |
| --- | --- | --- | --- |
| Stats, types, talents, évolutions, noms affichés | PokéAPI, en direct | — | par construction |
| Noms français (1025) | PokéAPI GraphQL | 1025 | **0** |
| Identifiants de tiers (841) | `@pkmn/dex@0.10.11`, filtrés sur PokéAPI | 841 | **0** |
| Table d'efficacité des types | PokéAPI, repli `@pkmn/dex@0.10.11` | 18 types | — |
| Second avis Game8 (98) | Game8, apparié sur PokéAPI | 98 | **0** non résolu |
| Images des Pokémon | PokéAPI (artwork officiel 475×475) | testé en navigateur | — |

Aucune donnée du dépôt n'est saisie à la main, et **aucun identifiant ne repose
sur une supposition de nommage** : chaque clé de `data/tiers.js` a été
confrontée aux référentiels réels de PokéAPI au moment de la génération. Les
formes que PokéAPI ne connaît pas (motifs de Prismillon, casquettes de Pikachu,
types d'Arceus…) sont volontairement omises — l'entrée de l'espèce de base les
couvre, et le moteur y retombe.

Chaque fichier de `data/` porte un champ `meta.provenance` et `meta.source` ; un
test vérifie qu'ils sont présents et commencent par `vérifié`.

---

## Tests

```bash
npm test
```

38 tests, sans réseau, portant en priorité sur les **garanties de sûreté** —
c'est-à-dire tout ce que l'outil promet de ne jamais faire :

- un Pokémon non pleinement évolué n'est jamais proposé en remplacement ;
- un tier inconnu bloque toute recommandation ;
- un candidat de tier inférieur n'est jamais recommandé ;
- des stats clés inférieures bloquent le remplacement ;
- deux Pokémon quasi identiques ne déclenchent jamais de changement ;
- une donnée de confiance moyenne ne peut jamais servir de preuve ;
- **900 tirages aléatoires** vérifient qu'aucun verdict « remplacer » ne viole
  un seul des invariants ci-dessus.

Une section entière couvre le **potentiel d'évolution** :

- la forme terminale est bien celle retenue, jamais une forme intermédiaire —
  même quand l'intermédiaire a un meilleur tier connu ;
- un Pokémon faible dont la forme finale est excellente **est** recommandé ;
- la conclusion mentionne explicitement la contrainte d'expérience et la
  condition d'évolution ;
- « pas encore évolué » n'est jamais le motif final d'un refus ;
- la prudence tient : une évolution médiocre ne déclenche rien, et aucun verdict
  « à intégrer » ne sort sans un verdict « remplacer » démontré sur la forme
  finale.

S'y ajoutent le cas d'usage du cahier des charges (Rocabot → Lougaroc), les cas
positifs (l'outil doit aussi savoir dire oui), la détection des rôles, la table
des types et l'intégrité des données embarquées.

---

## Structure du projet

```
index.html              Structure de la page
style.css               Styles (responsive, thème sombre)

js/
  api.js                Accès PokéAPI : requêtes, cache, erreurs typées
  names.js              Résolution des noms FR/EN, autocomplétion, suggestions
  types.js              Table d'efficacité des types (construite depuis PokéAPI)
  dex.js                Fiche Pokémon normalisée + chaîne d'évolution
  analysis.js           ★ Moteur de comparaison et de recommandation
  ui.js                 Rendu HTML (aucune décision)
  app.js                État de l'équipe et branchement de l'interface

data/
  tiers.js / .json      Table de viabilité (tier + confiance)
  names-fr.js / .json   Index de secours des noms français

scripts/
  build-data.mjs        Régénération des données depuis des sources structurées

test/
  engine.test.js        Tests du moteur
  type-chart.fixture.js Table des types figée, pour des tests hors réseau
```

Le découpage suit une règle stricte : **`analysis.js` ne touche jamais au DOM et
ne fait jamais d'appel réseau**. C'est ce qui permet de tester intégralement la
logique de décision en Node, sans navigateur.

---

## Limites connues

À lire avant d'accorder trop d'importance à un verdict.

1. **Le temps d'entraînement n'est pas chiffré.** L'outil dit qu'une évolution
   vaut l'investissement, et à quelle condition elle se déclenche, mais pas
   combien de combats il te faudra. Un « à intégrer pour son évolution » sur un
   Pokémon de niveau 5 face à une condition « niveau 54 » demande beaucoup de
   patience — c'est à toi d'arbitrer.
2. **IV, EV, natures et objets ne sont pas pris en compte.** L'analyse porte sur
   les stats de base. Un Pokémon bien entraîné peut largement dépasser un membre
   d'équipe mieux classé sur le papier.
3. **Les capacités (moves) ne sont pas analysées.** Seuls les talents sont
   affichés, à titre informatif. Un moveset médiocre peut ruiner un Pokémon
   excellent sur le papier — et inversement.
4. **Le Téracristal n'est pas modélisé.** Il peut changer radicalement le profil
   défensif d'un Pokémon, donc l'analyse de types.
5. **Les tiers reflètent le compétitif, pas l'aventure solo.** Pour finir
   l'histoire d'Écarlate / Violet, un Pokémon tier C fait parfaitement l'affaire.
   Un tier bas n'est pas un verdict sur ton plaisir de jeu.
6. **L'analyse de types est purement défensive.** La couverture offensive
   (quels types ton équipe peut frapper) n'est pas évaluée, faute d'analyser les
   capacités.
7. **Aucune synergie d'équipe fine.** Météo, terrains, redirection, relais de
   stats : rien de tout cela n'est modélisé.
8. **Une connexion Internet est requise.** Sans PokéAPI, l'outil refuse
   d'analyser plutôt que de deviner.
9. **Les tiers évoluent avec le métagame.** `@pkmn/dex` est épinglé à une
   version : relance `npm run build:tiers` après un `npm update` pour suivre
   les reclassements de Smogon.

Ces limites vont toutes dans le même sens : elles sont des raisons de considérer
un « pas de changement recommandé » comme définitif, et un « remplacement
recommandé » comme une piste solide — mais à confirmer en combat.

---

## Mentions légales

**Français —** Ce projet est un outil fan non officiel. Pokémon et tous les
noms, images et éléments associés sont des marques déposées de leurs
propriétaires respectifs (Nintendo, Game Freak, The Pokémon Company). Ce site
n'est ni affilié ni approuvé par ces entités. Les données Pokémon proviennent de
PokéAPI et de tier lists publiques à titre informatif.

**English —** This project is an unofficial fan tool. Pokémon and all associated
names, images and elements are registered trademarks of their respective owners
(Nintendo, Game Freak, The Pokémon Company). This site is neither affiliated
with nor endorsed by these entities. Pokémon data comes from PokéAPI and from
public tier lists, for informational purposes only.

Le code de ce dépôt est distribué sous licence MIT.
