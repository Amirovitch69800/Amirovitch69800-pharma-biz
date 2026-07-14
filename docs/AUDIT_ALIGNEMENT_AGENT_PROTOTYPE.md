# Audit d’alignement — Espace agent PharmaBiz

## Verdict

Oui : l’écran agent actuel s’est trop éloigné du prototype fourni.

Le prototype n’est pas seulement une inspiration visuelle. Il définit une vraie grammaire produit : cockpit terrain dense, shell latéral fort, modules rectangulaires, actions immédiates, carte/portefeuille au centre, tiroirs métier complets et navigation orientée exécution.

Notre version actuelle a conservé une partie de la data et des intentions métier, mais elle a réintroduit une logique plus SaaS/CRM générique : hero de dashboard, navigation simplifiée, panneaux plus abstraits, moins de densité opérationnelle et moins de fidélité au prototype.

## Ce que le prototype fait mieux

### 1. Shell agent beaucoup plus affirmé

Le prototype pose immédiatement un produit terrain : rail navy compact, topbar fonctionnelle, recherche globale, statut sync, actions rapides, bordures noires, ombres franches.

À conserver :

- rail latéral fixe très identifiable ;
- topbar utilitaire, pas décorative ;
- boutons rectangulaires contrastés ;
- marque orange comme repère visuel ;
- densité d’information assumée.

### 2. Navigation métier plus complète

Le prototype couvre un vrai cycle agent : accueil, portefeuille/carte, tournée, missions, commandes, commissions.

Notre version actuelle réduit trop le cockpit à quatre onglets : Jour, Comptes, Visite, Commandes. C’est lisible, mais trop pauvre par rapport à la vision terrain.

À réaligner :

- Accueil / cockpit du jour ;
- Portefeuille + carte ;
- Tournée ;
- Missions ;
- Commandes ;
- Commissions / rémunération ;
- Assistant terrain.

### 3. Carte et portefeuille comme cœur produit

Dans le prototype, la carte n’est pas un décor : elle sert à décider où aller, quelle pharmacie traiter, quelles priorités activer.

Notre version actuelle a des départements et listes, mais pas cette sensation de poste de pilotage géographique.

À réaligner :

- carte visible dans l’onglet portefeuille ;
- pins clients / prospects / priorités ;
- panneau compte latéral ;
- filtres secteur, statut, marque ;
- actions directes depuis la fiche.

### 4. Actions terrain mieux incarnées

Le prototype met les actions au centre : visiter, appeler, créer commande, créer mission, préparer tournée, enregistrer note vocale.

Notre version actuelle sait faire plusieurs actions, mais elles sont dispersées et moins scénarisées.

À réaligner :

- un bouton primaire contextuel par pharmacie ;
- actions secondaires lisibles ;
- drawers complets pour visite, commande, mission, appel ;
- compte rendu + prochaine action systématique.

### 5. Design system plus cohérent

Le prototype utilise des tokens simples et forts : crème, navy, bleu, orange, bordures foncées, ombres décalées, radius zéro.

Notre version reprend certains tokens, mais introduit des variations qui diluent l’identité : navy différent, cartes plus dashboard, hero trop marketing, densité moins maîtrisée.

À verrouiller :

- `--paper: #f6f1e7` ;
- `--cream: #fffaf0` ;
- `--navy: #111b34` ;
- `--blue: #155eef` ;
- `--orange: #ff6b00` ;
- `--line: #172033` ;
- `--shadow: 6px 6px 0 var(--line)` ;
- `--radius: 0px`.

## Ce que notre version fait mieux

### 1. Données réelles mieux branchées

Notre version actuelle est plus proche du vrai backend : portfolio agent, pharmacies, relations marque, commandes, produits, follow-ups, historique d’activité.

À conserver absolument :

- hook `useAgentWorkspaceData` ;
- filtrage par portefeuille agent ;
- mémoire client ;
- historique commandes / produits ;
- création d’activité ;
- création de relance ;
- brouillon de commande.

### 2. Logique métier Naali plus avancée

La version actuelle a commencé à intégrer les signaux utiles : remise historique, produits commandés, CA, prochaine action, statut client.

À conserver, mais à re-présenter dans la grammaire du prototype.

## Écarts principaux à corriger

### Écart 1 — Trop dashboard, pas assez cockpit

L’écran actuel démarre comme un dashboard CRM. Le prototype démarre comme un outil de terrain : “voici quoi faire maintenant”.

Correction : remplacer le hero par une carte “prochaine meilleure action” + liste du jour + priorités.

### Écart 2 — Carte absente ou secondaire

Pour un agent terrain, la carte doit être une brique centrale du portefeuille.

Correction : reconstruire l’onglet portefeuille en deux colonnes : carte à gauche, fiche pharmacie à droite, liste en dessous ou dans un panneau.

### Écart 3 — Navigation trop simplifiée

Les quatre onglets actuels ne reflètent pas tout le workflow agent.

Correction : reprendre la navigation prototype, quitte à masquer certains modules si les données ne sont pas encore prêtes.

### Écart 4 — Fiches pharmacie pas assez “terrain”

La fiche actuelle est utile, mais elle doit ressembler davantage à un brief de visite : signal, historique, contact, dernière commande, panier conseillé, objections, prochaine action.

Correction : fiche latérale structurée en “Décider / Préparer / Exécuter / Suite”.

### Écart 5 — Commande pas assez connectée au parcours visite

La commande existe, mais doit être un prolongement naturel de la visite.

Correction : depuis une pharmacie, ouvrir un drawer commande avec catalogue, historique client, remise historique, panier conseillé et création brouillon.

## Plan de recalage recommandé

### Étape 1 — Verrouiller le shell prototype

Objectif : remplacer la structure visuelle actuelle de l’espace agent par le shell du prototype, sans changer les données.

Livrables :

- rail latéral prototype ;
- topbar prototype ;
- tokens CSS alignés ;
- boutons, panels, badges, drawer de base ;
- suppression du hero/dashboard actuel.

### Étape 2 — Refaire l’accueil agent

Objectif : faire de l’accueil un vrai cockpit du jour.

Modules :

- prochaine meilleure action ;
- planning / relances du jour ;
- priorités portefeuille ;
- résumé CA / commandes / clients actifs ;
- assistant terrain rapide.

### Étape 3 — Refaire portefeuille + carte

Objectif : retrouver le cœur du prototype.

Modules :

- filtres secteur / marque / statut ;
- carte portefeuille ;
- pins uniquement sur les clients agent ;
- fiche compte latérale ;
- table portefeuille dense ;
- actions : visiter, appeler, itinéraire, commande, mission.

### Étape 4 — Refaire visite

Objectif : transformer la visite en workflow complet.

États :

- briefing avant visite ;
- checklist pendant visite ;
- compte rendu ;
- création prochaine action ;
- création commande ou mission si nécessaire.

### Étape 5 — Refaire commandes

Objectif : rendre la commande terrain rapide et crédible.

Modules :

- catalogue marque ;
- recherche produit ;
- sélection multi-produits ;
- quantités ;
- remise historique ;
- total HT/TTC ;
- brouillon commande ;
- synchronisation HubSpot si marque Naali.

### Étape 6 — Réintroduire missions / commissions

Objectif : couvrir la vraie économie PharmaBiz côté agent.

Modules :

- missions animation / formation ;
- statut mission ;
- commissions / rémunération ;
- historique actions terrain.

## Règle de décision

On ne doit plus ajouter de nouvelles fonctionnalités à l’écran agent actuel.

La bonne stratégie est : reprendre la structure du prototype, puis brancher progressivement nos données réelles dedans.

Autrement dit : le prototype gagne sur l’interface, notre code gagne sur la donnée. La refonte doit fusionner les deux, pas continuer à faire évoluer l’ancien écran.
