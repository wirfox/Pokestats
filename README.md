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

Sources de référence de cet instantané :

- [Smogon University](https://www.smogon.com/) — placements de tiers Génération 9
- [Game8 — Best Pokemon Tier List (SV)](https://game8.co/games/Pokemon-Scarlet-Violet/archives/397587)
- [RankedBoost — Pokemon Scarlet & Violet Tier List](https://rankedboost.com/pokemon-scarlet-violet/best-pokemon-tier-list/)
- PropelRC — Ultimate Pokemon Tier List
- Rosenberry Rooms — Pokemon Tier List
- [Pikalytics](https://www.pikalytics.com/) — usage réel en VGC / Battle Stadium

> ⚠️ **À lire avant de faire confiance aux tiers.**
> L'instantané livré dans ce dépôt n'a **pas** pu être généré automatiquement :
> l'environnement de build n'avait pas d'accès réseau vers ces hôtes. C'est une
> base de départ curée, à jour de la génération 9, mais elle n'a pas été validée
> ligne à ligne contre les sources en ligne.
>
> Avant tout usage sérieux, régénère-la depuis une source structurée et
> vérifiable&nbsp;:
>
> ```bash
> npm run build:tiers
> ```
>
> Les Pokémon qui disparaîtraient de la table à cette occasion deviennent
> « tier inconnu » — ce qui, par construction, rend l'outil *plus* prudent,
> jamais moins.

### Noms français

[`data/names-fr.js`](data/names-fr.js) sert à traduire ce que tu tapes
(« Rocabot ») en identifiant PokéAPI (`rockruff`). Ordre de résolution :

1. Index complet construit en direct depuis PokéAPI (une requête GraphQL,
   ~1025 espèces), mis en cache dans `localStorage`.
2. Index de secours embarqué, si le premier échoue.
3. La saisie brute comme identifiant — ce qui couvre nativement l'anglais
   (`rockruff`, `great-tusk`…).

**Garde-fou :** le nom affiché à l'écran provient *toujours* de PokéAPI, jamais
de cet index. Une entrée erronée serait donc immédiatement visible (le nom
affiché ne correspondrait pas à ta saisie), et surtout : aucune analyse ne porte
sur les noms — uniquement sur les données renvoyées par l'API.

---

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

## Tests

```bash
npm test
```

33 tests, sans réseau, portant en priorité sur les **garanties de sûreté** —
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
9. **L'instantané de tiers doit être régénéré** pour être pleinement fiable
   (voir l'avertissement plus haut).

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
