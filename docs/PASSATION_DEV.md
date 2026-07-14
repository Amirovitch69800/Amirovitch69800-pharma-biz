# PharmaBiz — Passation développeur

Date : 2026-07-14  
Projet Supabase : `mfgstfazcrpvwxydczrd` (`Pharmabiz`, statut `ACTIVE_HEALTHY`)  
Repository GitHub : `https://github.com/Amirovitch69800/Amirovitch69800-pharma-biz`

## 1. Résumé exécutif

PharmaBiz est en transition entre une première version CRM généraliste et une vraie plateforme d’exécution terrain pharmacie.

La priorité actuelle est l’espace agent Naali :

- portefeuille Amir Ounissi ;
- pharmacies clientes Naali issues de HubSpot ;
- commandes/deals HubSpot ;
- line items HubSpot ;
- agenda Google ;
- géocodage des pharmacies ;
- briefing terrain orienté visite.

Le projet fonctionne localement et le build passe, mais le dépôt n’est pas encore proprement stabilisé pour une équipe dev.

Verdict :

- Supabase est bien structuré dans l’intention, mais encore en phase d’assemblage.
- GitHub/local contient beaucoup de changements non commités.
- Les Edge Functions sont nombreuses et certaines viennent d’être ajoutées.
- Avant passation complète, il faut faire un commit organisé, vérifier les fonctions déployées, puis clarifier le workflow de sync HubSpot.

## 2. Stack technique

- Front-end : Vite + React.
- Styles : CSS global `src/app-v2.css` + CSS spécifiques existants.
- Auth : Supabase Auth.
- Base : Supabase Postgres.
- Sécurité : RLS activée sur les tables publiques.
- Backend : Supabase Edge Functions.
- Déploiement front : Vercel.
- Connecteurs :
  - HubSpot pour Naali ;
  - Google Calendar pour agenda agent ;
  - géocodage via API Adresse ;
  - WhatsApp/Twilio prévu ou partiellement amorcé.

## 3. État GitHub / dépôt local

Remote :

```bash
origin https://github.com/Amirovitch69800/Amirovitch69800-pharma-biz.git
```

Branche actuelle :

```bash
main
```

État important :

- Beaucoup de fichiers modifiés.
- Beaucoup de fichiers non suivis.
- Le travail n’est pas encore commité.
- Ne pas faire de `reset`.
- Ne pas supprimer les prototypes HTML sans validation.

Fichiers/dossiers importants non encore stabilisés :

- `src/features/agent/`
- `src/features/admin/`
- `src/features/brand/`
- `src/features/provider/`
- `src/lib/roles.js`
- `supabase/functions/geocode-pharmacies/`
- `supabase/functions/google-calendar-sync/`
- `supabase/functions/google-calendar-create-event/`
- `supabase/functions/hubspot-line-items-sync/`
- migrations Supabase du `20260714`
- documents dans `docs/`

Fichiers locaux à ne pas versionner :

- `.supabase-home`
- `supabase/.temp`
- `dist`
- `node_modules`
- `.env`
- `.env.local`
- `.vercel`

`.gitignore` a été mis à jour pour ignorer `.supabase-home` et `supabase/.temp`.

## 4. État Supabase

Projet actif :

```text
mfgstfazcrpvwxydczrd
```

Nom :

```text
Pharmabiz
```

Région :

```text
eu-west-1
```

Tables publiques observées :

- `profiles`
- `agents`
- `user_capabilities`
- `agent_brand_assignments`
- `agent_portfolios`
- `brands`
- `brand_users`
- `brand_integrations`
- `pharmacies`
- `pharmacy_brand_relations`
- `products`
- `orders`
- `order_items`
- `activities`
- `follow_up_tasks`
- `integration_connections`
- `integration_events`
- `integration_sync_jobs`
- `external_sync_links`
- `field_missions`
- `mission_assignments`
- `mission_reports`
- `mission_proofs`
- `whatsapp_messages`
- autres tables CRM/finance/imports.

RLS :

- Activée sur les tables `public`.
- Les tables privées `integration_private.oauth_credentials` et `integration_private.oauth_states` sont dans un schéma non exposé.

Fonctions RPC importantes :

- `create_integration_oauth_state`
- `consume_integration_oauth_state`
- `store_integration_oauth_credentials`
- `get_integration_oauth_credentials`
- `current_agent_id`
- `has_brand_access`

Point de vigilance :

- Les fonctions `SECURITY DEFINER` doivent être relues par un dev Supabase senior.
- Ne jamais désactiver RLS pour contourner un bug.
- Les accès doivent rester basés sur `profiles`, `agents`, `brand_users`, `agent_portfolios`, `user_capabilities`.

## 5. Edge Functions Supabase

Fonctions présentes :

```text
geocode-pharmacies
google-calendar-create-event
google-calendar-sync
hubspot-catalog-sync
hubspot-customer-context
hubspot-line-items-sync
hubspot-sync
integration-oauth-callback
integration-oauth-start
sync-order-to-hubspot
```

### 5.1 `hubspot-sync`

Rôle :

- synchroniser les pharmacies clientes Naali depuis HubSpot ;
- reconstruire le portefeuille Naali ;
- importer les deals/commandes HubSpot ;
- éviter les précommandes ;
- limiter le risque `WORKER_RESOURCE_LIMIT`.

État :

- Fonction déjà corrigée pour éviter une explosion d’appels HubSpot.
- Les line items sont désormais sortis de la sync principale.

Commande de déploiement :

```bash
cd /Users/amirounissi/Documents/Codex/2026-07-10/ph/pharma-biz
HOME=/private/tmp/supabase-home SUPABASE_TELEMETRY_DISABLED=1 supabase functions deploy hubspot-sync --project-ref mfgstfazcrpvwxydczrd
```

### 5.2 `hubspot-line-items-sync`

Rôle :

- importer les lignes produits des deals HubSpot déjà importés ;
- traiter par lots de 50 commandes ;
- ne pas bloquer la sync principale.

État :

- Fonction ajoutée localement.
- À déployer avant utilisation.

Commande de déploiement :

```bash
cd /Users/amirounissi/Documents/Codex/2026-07-10/ph/pharma-biz
HOME=/private/tmp/supabase-home SUPABASE_TELEMETRY_DISABLED=1 supabase functions deploy hubspot-line-items-sync --project-ref mfgstfazcrpvwxydczrd
```

Après déploiement :

1. Ouvrir l’espace agent.
2. Cliquer `Lignes HubSpot`.
3. Répéter si nécessaire jusqu’à couvrir l’historique.
4. Vérifier le volume `order_items`.

Requête de contrôle :

```sql
select count(*)::int as orders_total,
  count(*) filter (where external_deal_id is not null)::int as hubspot_orders,
  count(distinct oi.order_id)::int as orders_with_items,
  count(oi.id)::int as line_items_total
from public.orders o
left join public.order_items oi on oi.order_id = o.id;
```

### 5.3 Google Calendar

Fonctions :

- `integration-oauth-start`
- `integration-oauth-callback`
- `google-calendar-sync`
- `google-calendar-create-event`

État :

- OAuth Google fonctionne si le projet Google Cloud est bien configuré.
- `prompt=consent` a été ajouté pour forcer l’obtention du `refresh_token`.
- Le callback préserve l’ancien `refresh_token` si Google ne renvoie pas de nouveau refresh token.

Commandes de déploiement :

```bash
cd /Users/amirounissi/Documents/Codex/2026-07-10/ph/pharma-biz
HOME=/private/tmp/supabase-home SUPABASE_TELEMETRY_DISABLED=1 supabase functions deploy integration-oauth-start --project-ref mfgstfazcrpvwxydczrd
HOME=/private/tmp/supabase-home SUPABASE_TELEMETRY_DISABLED=1 supabase functions deploy integration-oauth-callback --project-ref mfgstfazcrpvwxydczrd
HOME=/private/tmp/supabase-home SUPABASE_TELEMETRY_DISABLED=1 supabase functions deploy google-calendar-sync --project-ref mfgstfazcrpvwxydczrd
HOME=/private/tmp/supabase-home SUPABASE_TELEMETRY_DISABLED=1 supabase functions deploy google-calendar-create-event --project-ref mfgstfazcrpvwxydczrd
```

### 5.4 Géocodage

Fonction :

- `geocode-pharmacies`

Rôle :

- géocoder les pharmacies via l’API Adresse ;
- stocker latitude/longitude ;
- permettre une meilleure carte et de meilleures suggestions `Sur ton trajet`.

Commande :

```bash
cd /Users/amirounissi/Documents/Codex/2026-07-10/ph/pharma-biz
HOME=/private/tmp/supabase-home SUPABASE_TELEMETRY_DISABLED=1 supabase functions deploy geocode-pharmacies --project-ref mfgstfazcrpvwxydczrd
```

## 6. Front-end actuel

Entrée :

- `src/main-v2.jsx`

Espace agent :

- `src/features/agent/AgentV3Root.jsx`
- `src/features/agent/useAgentWorkspaceData.js`
- `src/features/agent/franceDepartments.js`

Styles principaux :

- `src/app-v2.css`

Connecteurs :

- `src/lib/integrations.js`
- `src/lib/supabase.js`

Rôles :

- `src/lib/roles.js`

Espaces préparés :

- `src/features/admin/AdminWorkspace.jsx`
- `src/features/brand/BrandWorkspace.jsx`
- `src/features/provider/ProviderWorkspace.jsx`

## 7. Fonctionnalités agent déjà en place

Dans l’espace agent :

- affichage du portefeuille agent ;
- affichage uniquement des départements avec pharmacies ;
- carte portefeuille ;
- géocodage GPS ;
- suggestions `Sur ton trajet` ;
- création de visite ;
- création de visite avec Google Calendar ;
- lecture des événements Google Calendar ;
- affichage des activités PharmaBiz dans `Ma journée` ;
- style spécifique pour visite planifiée ;
- sync HubSpot companies/deals ;
- bouton dédié `Lignes HubSpot` ;
- briefing recommandé avec :
  - CA YTD ;
  - croissance vs N-1 ;
  - DN produit ;
  - top 3 produits ;
  - produits manquants.

Point important :

- Le top 3 utilise les `order_items` quand ils existent.
- Tant que les line items HubSpot ne sont pas tous importés, le top produit peut être incomplet.
- La DN Naali repose sur le champ entreprise HubSpot `catalogue_naali_reference`.

## 8. Données Naali / HubSpot

Règles métier validées :

- Naali est en mode CRM connecté.
- La source CRM principale est HubSpot.
- Il faut charger uniquement les pharmacies :
  - de l’owner HubSpot configuré ;
  - avec le champ entreprise `client_naali = true`.
- Le portefeuille Amir cible est de 55 pharmacies.
- La DN produit Naali doit venir du champ entreprise `catalogue_naali_reference`.
- Les précommandes ne doivent pas entrer dans les commandes clôturées.
- Les deals clôturés doivent alimenter :
  - CA ;
  - historique commandes ;
  - top produits si line items disponibles ;
  - briefing terrain ;
  - dashboard futur.

Points en cours :

- Les commandes HubSpot sont importées.
- Les line items sont insuffisants tant que `hubspot-line-items-sync` n’est pas déployée et exécutée.

## 9. Variables/secrets nécessaires

Ne pas mettre ces valeurs dans le front-end ni dans GitHub.

Supabase Edge Functions :

- `HUBSPOT_PRIVATE_APP_TOKEN`
- `HUBSPOT_OWNER_ID` ou `HUBSPOT_OWNER_EMAIL`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `INTEGRATION_OAUTH_CALLBACK_URL`
- éventuellement `HUBSPOT_MIN_REQUEST_INTERVAL_MS`
- éventuellement `HUBSPOT_DEALS_MAX_PAGES`
- éventuellement `HUBSPOT_SYNC_LINE_ITEMS`
- éventuellement `HUBSPOT_LINE_ITEMS_REQUEST_DELAY_MS`

Front-end Vite :

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

## 10. Commandes utiles

Installation :

```bash
cd /Users/amirounissi/Documents/Codex/2026-07-10/ph/pharma-biz
npm install
```

Dev :

```bash
npm run dev
```

Build :

```bash
npm run build
```

Preview Vite :

```bash
npm run preview
```

Serveur statique local alternatif :

```bash
python3 -m http.server 8165 -d dist
```

Déploiement Vercel :

```bash
cd /Users/amirounissi/Documents/Codex/2026-07-10/ph/pharma-biz
npx vercel@55.0.0 --prod --yes
```

URL Vercel observée précédemment :

```text
https://pharma-biz.vercel.app
```

## 11. Checklist avant passation à un dev

### Git

- [ ] Relire tous les fichiers modifiés.
- [ ] Retirer ou classer les fichiers prototype HTML si non nécessaires.
- [ ] Vérifier que `.supabase-home`, `supabase/.temp`, `.env`, `.env.local`, `dist`, `node_modules` sont ignorés.
- [ ] Faire un commit structuré.
- [ ] Pousser sur GitHub.
- [ ] Créer une branche de travail si un dev externe intervient.

### Supabase

- [ ] Déployer `hubspot-line-items-sync`.
- [ ] Déployer/re-déployer les fonctions OAuth Google si pas déjà fait.
- [ ] Vérifier les secrets Supabase.
- [ ] Vérifier que `agent_portfolios` contient bien 55 pharmacies pour `amir.ounissipro@gmail.com`.
- [ ] Vérifier le nombre de commandes HubSpot.
- [ ] Vérifier le nombre de line items après import.
- [ ] Vérifier les politiques RLS sur les nouvelles tables.
- [ ] Lancer les advisors Supabase si disponible.

### Front

- [ ] Vérifier mobile.
- [ ] Vérifier desktop.
- [ ] Vérifier l’espace agent uniquement avant d’élargir marque/admin.
- [ ] Tester création visite.
- [ ] Tester création visite + Google Calendar.
- [ ] Tester sync agenda.
- [ ] Tester sync HubSpot.
- [ ] Tester sync line items.
- [ ] Vérifier briefing recommandé.
- [ ] Vérifier commandes / historique.

### Vercel

- [ ] Vérifier variables d’environnement Vercel.
- [ ] Rebuild production.
- [ ] Tester auth sur production.
- [ ] Tester Supabase callbacks OAuth avec URL production.
- [ ] Vérifier domaines autorisés Google OAuth.

## 12. Risques actuels

### Risque 1 — Trop de travail non commité

Le dépôt local contient beaucoup de modifications. Un dev qui arrive maintenant peut se perdre.

Action recommandée :

- faire un commit `checkpoint-agent-naali-hubspot-calendar`;
- puis ouvrir des issues/tickets pour la suite.

### Risque 2 — Sync HubSpot fragile

HubSpot impose des limites d’API. La sync principale a déjà rencontré :

- `WORKER_RESOURCE_LIMIT`;
- `429 rate limit`;
- imports partiels.

Action recommandée :

- garder la sync principale légère ;
- traiter les line items par lots dédiés ;
- créer une table ou un champ de progression de sync si besoin.

### Risque 3 — Data métier mélangée

Certaines données Naali sont encore dans `pharmacies`, alors qu’à terme elles devraient être dans la relation marque/pharmacie.

Action recommandée :

- documenter `pharmacy_brand_relations` comme relation marque ;
- ne pas renommer en V1 si cela casse trop de code ;
- prévoir migration propre plus tard.

### Risque 4 — UI encore monolithique

`AgentV3Root.jsx` devient gros.

Action recommandée :

- extraire progressivement :
  - `TodayView`;
  - `PortfolioView`;
  - `ActionDrawer`;
  - helpers business ;
  - helpers map.

### Risque 5 — OAuth Google

Le refresh token peut manquer si l’utilisateur ne reconsent pas.

Action recommandée :

- conserver `prompt=consent`;
- afficher clairement `Reconnecter`;
- vérifier les scopes Google côté Cloud Console.

## 13. Prochaines actions recommandées

Ordre recommandé :

1. Déployer `hubspot-line-items-sync`.
2. Cliquer `Lignes HubSpot` plusieurs fois jusqu’à importer l’historique.
3. Vérifier le brief recommandé sur plusieurs pharmacies.
4. Faire un commit Git propre.
5. Pousser sur GitHub.
6. Déployer Vercel.
7. Vérifier production.
8. Ouvrir un sprint “stabilisation agent”.

## 14. Commandes de contrôle SQL

Portefeuille Amir :

```sql
with target_agent as (
  select a.id
  from public.agents a
  join public.profiles p on p.id = a.user_id
  where p.email = 'amir.ounissipro@gmail.com'
  limit 1
)
select count(*)::int
from public.agent_portfolios ap
join target_agent ta on ta.id = ap.agent_id
where ap.status = 'active';
```

Commandes + line items :

```sql
select count(*)::int as orders_total,
  count(*) filter (where external_deal_id is not null)::int as hubspot_orders,
  count(distinct oi.order_id)::int as orders_with_items,
  count(oi.id)::int as line_items_total
from public.orders o
left join public.order_items oi on oi.order_id = o.id;
```

Google refresh token sans exposer le secret :

```sql
select c.provider,
  c.status,
  exists (
    select 1
    from integration_private.oauth_credentials oc
    where oc.connection_id = c.id
      and oc.provider = 'google'
      and oc.refresh_token is not null
      and length(oc.refresh_token) > 0
  ) as has_refresh_token
from public.integration_connections c
where c.provider = 'google';
```

Derniers jobs HubSpot :

```sql
select status, object_type, records_processed, error_message, metadata, finished_at
from public.integration_sync_jobs
where object_type = 'hubspot_companies'
order by finished_at desc nulls last
limit 10;
```

## 15. Ce qu’un dev doit absolument comprendre

PharmaBiz ne doit pas devenir une copie de HubSpot.

Le bon modèle :

- PharmaBiz est la couche terrain.
- HubSpot est une source/sortie pour Naali.
- D’autres marques pourront utiliser :
  - leur CRM ;
  - ou PharmaBiz comme CRM natif.

La brique agent doit rester centrée sur :

1. décider quoi faire ;
2. préparer la visite ;
3. exécuter ;
4. enregistrer le résultat ;
5. planifier la suite.

Toute fonctionnalité qui ne sert pas cette boucle doit être repoussée.
