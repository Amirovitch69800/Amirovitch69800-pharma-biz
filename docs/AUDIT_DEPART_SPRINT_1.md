# PharmaBiz — Audit de départ Sprint 1

Date : 2026-07-14

Références :

- `docs/ARCHITECTURE_TECHNIQUE_CIBLE.md`
- `docs/PLAN_EXECUTION_V1.md`

## 1. Synthèse

Le projet possède déjà une base exploitable, mais elle est encore dans un état intermédiaire.

Points positifs :

- Vite / React / Supabase / Vercel sont en place.
- L'espace agent a été isolé de l'ancienne UI.
- Le build passe.
- La base Supabase contient déjà une partie du modèle cible : pharmacies globales, relations marque/pharmacie, agents, produits, commandes, intégrations, missions, WhatsApp.
- RLS est activée sur toutes les tables publiques observées.
- Naali dispose déjà d'une intégration HubSpot enregistrée.

Points bloquants avant développement lourd :

- Le modèle cible n'est pas encore complètement aligné avec le schéma réel.
- `pharmacy_brand_relations` joue déjà le rôle de `brand_pharmacies`, mais le nom et certains champs doivent être normalisés.
- `pharmacies.assigned_agent_id` mélange encore portefeuille agent et identité globale.
- Il manque `agent_portfolios`, `user_capabilities`, `agent_brand_assignments`, règles de validation commandes et liens sécurisés pharmacie.
- Le hook `useWorkspaceData` charge trop de données et reste trop global.
- Les fonctions SECURITY DEFINER Supabase ont plusieurs alertes de sécurité.
- La sync HubSpot est fonctionnelle mais encore trop spécifique à Naali dans certains chemins.

## 2. État Git et build

Commande exécutée :

```bash
npm run build
```

Résultat :

- build Vite OK ;
- 78 modules transformés ;
- bundle généré sans erreur.

État Git notable :

- nombreux fichiers modifiés avant cet audit ;
- nouveaux documents dans `docs/` ;
- fichiers locaux de prototype HTML non versionnés ;
- nouvelles features `admin`, `agent`, `brand`, `provider` non encore commités ;
- migrations récentes non encore commités.

Décision :

> Ne pas faire de reset global. Les changements existants doivent être traités comme travail utilisateur en cours.

## 3. Schéma Supabase observé

Projet Supabase : `mfgstfazcrpvwxydczrd`

Tables publiques observées : 43.

Toutes les tables publiques listées ont RLS activée.

Volumes clés :

| Table | Lignes |
| --- | ---: |
| `profiles` | 3 |
| `agents` | 2 |
| `brands` | 2 |
| `brand_users` | 1 |
| `pharmacies` | 259 |
| `pharmacy_brand_relations` | 57 |
| `products` | 140 |
| `orders` | 1 |
| `order_items` | 0 |
| `brand_integrations` | 1 |
| `field_missions` | 1 |
| `whatsapp_messages` | 13 |

## 4. Tables déjà proches du modèle cible

### `pharmacies`

Rôle actuel :

- établissement pharmacie global ;
- contient aussi des données Naali / HubSpot ;
- contient encore `assigned_agent_id`.

Champs utiles :

- identité : nom, adresse, ville, CP, département ;
- contact : téléphone, email, titulaire ;
- HubSpot : `hubspot_company_id`, `hubspot_owner_id`, revenus, sync status ;
- suivi : `last_contact_at`, `next_follow_up_at`.

Écart cible :

- conserver comme table globale ;
- éviter d'y stocker trop de données spécifiques Naali ;
- sortir la logique portefeuille vers `agent_portfolios`.

### `pharmacy_brand_relations`

Rôle actuel :

- relation marque/pharmacie ;
- équivalent fonctionnel de `brand_pharmacies`.

Champs utiles :

- `pharmacy_id`
- `brand_id`
- `agent_id`
- `status`
- `segment`
- `potential`
- `last_order_at`
- `annual_revenue_ht`
- `next_action_at`

Écart cible :

- nom cible conceptuel : `brand_pharmacies` ;
- peut rester nommé `pharmacy_brand_relations` en V1 si on documente l'alias ;
- ajouter ou normaliser les champs CRM externes si nécessaires ;
- ne pas dupliquer `agent_portfolios`.

### `agents`

Rôle actuel :

- profil agent commercial ;
- lié à `profiles` via `user_id`.

Champs utiles :

- code agent ;
- display name ;
- secteur ;
- départements ;
- commission par défaut.

Écart cible :

- conserver ;
- compléter avec `agent_brand_assignments` ;
- ne pas l'utiliser comme unique logique de portefeuille.

### `brands` + `brand_users`

Rôle actuel :

- marques ;
- appartenance utilisateur/marque.

Écart cible :

- `brand_users` couvre une partie de `brand_memberships` ;
- ajouter `brands.operating_mode` ;
- ajouter éventuellement des capacités marque plus fines.

### `products`

Rôle actuel :

- catalogue produit par marque ;
- champs HubSpot déjà présents.

Champs utiles :

- `brand_id`
- `name`
- `reference`
- `ean`
- `pcb`
- `unit_price_ht`
- `public_price_ttc`
- `vat_rate`
- `hubspot_product_id`
- `source_provider`

Écart cible :

- OK pour catalogue marque ;
- prix HT officiel doit rester source de vérité ;
- ajouter règles commerciales séparées plutôt que logique UI.

### `orders` + `order_items`

Rôle actuel :

- commande + lignes de commande.

Écart cible :

- manque `mission_id` ;
- manque `source` ;
- manque `created_by_type` ;
- manque `attributed_agent_id` ;
- manque validation status / raison ;
- sync HubSpot se lance aujourd'hui directement dans `createOrder`.

### `brand_integrations` + `external_sync_links`

Rôle actuel :

- intégration marque/provider ;
- liens objets externes.

Écart cible :

- base saine ;
- `brand_integrations.config` contient déjà les paramètres Naali ;
- ajouter `sync_runs` / `sync_errors` plus lisibles ou utiliser `integration_sync_jobs` / `integration_events` comme socle.

### `field_missions`

Rôle actuel :

- missions animation/formation/merchandising/audit ;
- enrichi avec campagne, preuves, objectifs.

Écart cible :

- utilisable pour V1 ;
- devra être relié plus proprement aux demandes marque, assignations et résultats ;
- actuellement orienté intervenant plus que mission commerciale agent.

### `whatsapp_messages` + `ai_actions`

Rôle actuel :

- tests WhatsApp/Twilio déjà présents ;
- messages, média, transcription, statut IA.

Écart cible :

- bon embryon V1.5 ;
- manque séparation `ai_action_drafts`, `ai_action_policies`, confirmations, audit détaillé.

## 5. Tables manquantes ou à créer

Priorité haute :

- `user_capabilities`
- `agent_portfolios`
- `agent_brand_assignments`
- `brand_order_rules`
- champs de validation sur `orders`

Priorité moyenne :

- `commercial_terms` ou extension de `commercial_conditions` pour conditions par `pharmacy_brand_relation`;
- `public_action_links`
- `pharmacy_link_events`
- `sync_runs` / `sync_errors` si on ne réutilise pas `integration_sync_jobs`.

Priorité V1.5 :

- `ai_action_policies`
- `ai_action_drafts`
- `ai_action_confirmations`
- `ai_audit_logs`
- `whatsapp_conversations` ou enrichissement de `whatsapp_messages`.

## 6. RLS et sécurité

Constat positif :

- RLS est activée sur les tables publiques observées.

Alertes Supabase Advisors :

- fonctions avec `search_path` mutable ;
- fonctions `SECURITY DEFINER` exécutables par `anon` et/ou `authenticated` ;
- leaked password protection désactivée côté Auth.

Fonctions sensibles signalées :

- `current_agent_id`
- `has_brand_access`
- `is_admin`
- `handle_new_user`
- `recalculate_order_totals`
- fonctions WhatsApp CRM
- fonctions AI follow-up

Risque :

> Certaines fonctions exposées via RPC peuvent être appelées plus largement que nécessaire.

Action recommandée avant ouverture large :

- révoquer `EXECUTE` sur fonctions sensibles pour `anon` quand non nécessaire ;
- limiter les RPC publiques au strict minimum ;
- ajouter `set search_path` aux fonctions ;
- vérifier que les fonctions SECURITY DEFINER contrôlent explicitement l'utilisateur.

## 7. Front-end observé

### `src/main-v2.jsx`

Rôle :

- auth Supabase ;
- routage par rôle ;
- chargement profil + field animator ;
- message d'erreur login rendu lisible.

À garder :

- structure de routage simple ;
- `readableAuthError`.

À changer :

- ne plus utiliser `user_metadata` comme source d'autorisation durable ;
- basculer vers `profiles.primary_role` + `user_capabilities` à terme.

### `src/lib/roles.js`

Rôle :

- normalise admin, brand, provider, agent.

À garder temporairement :

- utile pour compatibilité.

À remplacer :

- par un resolver basé sur `profiles` + capacités.

### `src/hooks/useWorkspaceData.js`

Rôle :

- charge quasiment toutes les données du workspace ;
- utilisé par agent, marque, admin, provider.

Problème :

- trop large ;
- mélange données agent, marque, admin, provider ;
- difficile à sécuriser côté UX ;
- charge des vues/tables non nécessaires selon rôle ;
- `createOrder` déclenche directement la sync HubSpot.

Décision :

> À scinder progressivement en hooks par espace : agent, marque, admin, intervenant.

### `src/features/agent/AgentV3Root.jsx`

Rôle :

- brique agent isolée ;
- ancienne UI coupée ;
- placeholder propre.

À garder :

- isolation agent ;
- classes `agent-zero`.

À faire :

- remplacer placeholder par shell agent V1 complet ;
- ne pas réintroduire `CrmShell` dans l'agent.

### `src/BrandPortal.jsx`

Rôle :

- espace marque riche ;
- demande marque ;
- territoire ;
- performance ;
- commandes ;
- finance.

À garder :

- logique demandé → qualifié → exécuté → résultat ;
- dashboard marque orienté valeur.

À surveiller :

- composant très gros ;
- beaucoup de logique UI + métier dans le même fichier ;
- données HubSpot affichées si disponibles, sinon messages d'attente.

### `src/FieldMissions.jsx`

Rôle :

- missions terrain/intervenants ;
- création animateurs ;
- création mission ;
- suivi statut.

À garder :

- socle missions/intervenants.

À revoir :

- séparer mode admin et mode intervenant ;
- brancher sur le futur modèle capacités ;
- éviter insertion large si RLS admin seulement.

## 8. Edge Functions observées

Fonctions existantes :

- `hubspot-sync`
- `hubspot-catalog-sync`
- `hubspot-customer-context`
- `sync-order-to-hubspot`
- `integration-oauth-start`
- `integration-oauth-callback`

Constats :

- HubSpot est déjà bien avancé.
- Les secrets sont lus côté Edge Function.
- `hubspot-sync` fait entreprises + produits + portefeuille Naali.
- `sync-order-to-hubspot` crée deal + line items.
- `hubspot-customer-context` récupère les deals et remises.

Risques :

- fallback `HUBSPOT_CLIENT_ID` comme token privé peut créer de la confusion ;
- la sync Naali reste codée très spécifiquement ;
- `createOrder` appelle la sync immédiatement, avant futur moteur de validation ;
- logs sync utilisateur encore insuffisamment lisibles.

## 9. Décisions de migration

### Décision 1 — Ne pas renommer `pharmacy_brand_relations` tout de suite

La table correspond déjà à `brand_pharmacies`.

Pour limiter le risque V1 :

- garder le nom physique ;
- documenter l'alias métier `brand_pharmacies`;
- ajouter les champs manquants dessus.

### Décision 2 — Créer `agent_portfolios`

Ne pas remplacer immédiatement `pharmacies.assigned_agent_id`.

Plan :

- créer `agent_portfolios`;
- backfill depuis `pharmacies.assigned_agent_id` et/ou `pharmacy_brand_relations.agent_id`;
- adapter les lectures agent ;
- garder `assigned_agent_id` en compat temporaire.

### Décision 3 — Scinder les hooks avant grosse UI agent

Créer un hook agent dédié avant de construire l'interface :

- `useAgentWorkspaceData`
- charge profil, agent, portefeuille, relations, actions, commandes utiles.

### Décision 4 — Retarder la refonte complète commandes

Avant de modifier le tunnel commande :

- ajouter champs validation/source/attribution ;
- empêcher sync HubSpot automatique directe ;
- faire passer par fonction `order-submit` ou équivalent.

### Décision 5 — Corriger les warnings Supabase sécurité

Avant ouverture à de nouveaux utilisateurs :

- révoquer fonctions SECURITY DEFINER non publiques ;
- définir `search_path` ;
- vérifier explicitement `auth.uid()`.

## 10. Prochain lot technique recommandé

Lot 1 — Migration socle minimale :

1. Ajouter `user_capabilities`.
2. Ajouter `agent_brand_assignments`.
3. Ajouter `agent_portfolios`.
4. Ajouter `brands.operating_mode`.
5. Ajouter champs V1 commandes : `mission_id`, `source`, `created_by_type`, `attributed_agent_id`, `validation_status`, `validation_required_reason`.

Lot 2 — Backfill :

1. Remplir `agent_portfolios` depuis données existantes.
2. Remplir `agent_brand_assignments` depuis relations existantes.
3. Marquer Naali comme `connected_crm`.

Lot 3 — Front :

1. Créer `useAgentWorkspaceData`.
2. Brancher `AgentV3Root` sur ce hook.
3. Construire shell agent mobile.
4. Construire portefeuille et fiche pharmacie 360.

## 11. Définition du départ validé

Le Sprint 1 peut avancer vers les premières migrations car :

- le schéma live est identifié ;
- les tables déjà proches du modèle cible sont connues ;
- les écarts critiques sont listés ;
- le build passe ;
- les risques RLS/fonctions sont identifiés ;
- l'espace agent est déjà isolé visuellement.
