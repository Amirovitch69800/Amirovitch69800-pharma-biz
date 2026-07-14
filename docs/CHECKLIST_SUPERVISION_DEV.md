# PharmaBiz — Checklist supervision développeur

Date : 2026-07-14

Cette checklist sert à superviser un dev externe ou à organiser une passation rapide.

## 1. Avant de coder

- [ ] Lire `docs/PASSATION_DEV.md`.
- [ ] Lire `docs/ARCHITECTURE_TECHNIQUE_CIBLE.md`.
- [ ] Lire `docs/AUDIT_ALIGNEMENT_AGENT_PROTOTYPE.md`.
- [ ] Vérifier `git status`.
- [ ] Ne faire aucun `reset`.
- [ ] Confirmer la branche de travail.
- [ ] Créer une branche dédiée si besoin.

## 2. Vérifications locales

```bash
cd /Users/amirounissi/Documents/Codex/2026-07-10/ph/pharma-biz
npm install
npm run build
npm run dev
```

À vérifier dans le navigateur :

- [ ] Connexion agent.
- [ ] Onglet `Jour`.
- [ ] RDV PharmaBiz dans `Ma journée`.
- [ ] Briefing recommandé.
- [ ] Carte / GPS.
- [ ] Bouton `Sync HubSpot`.
- [ ] Bouton `Lignes HubSpot`.
- [ ] Création visite.
- [ ] Création commande brouillon.

## 3. Supabase

Projet :

```text
mfgstfazcrpvwxydczrd
```

À vérifier :

- [ ] Projet `ACTIVE_HEALTHY`.
- [ ] RLS activée sur tables publiques.
- [ ] Secrets configurés.
- [ ] Fonctions Edge déployées.
- [ ] Portefeuille Amir = 55 pharmacies actives.
- [ ] HubSpot orders importées.
- [ ] HubSpot line items importées.
- [ ] Google refresh token présent si agenda connecté.

## 4. Fonctions à déployer si manquantes

```bash
cd /Users/amirounissi/Documents/Codex/2026-07-10/ph/pharma-biz

HOME=/private/tmp/supabase-home SUPABASE_TELEMETRY_DISABLED=1 supabase functions deploy hubspot-sync --project-ref mfgstfazcrpvwxydczrd
HOME=/private/tmp/supabase-home SUPABASE_TELEMETRY_DISABLED=1 supabase functions deploy hubspot-line-items-sync --project-ref mfgstfazcrpvwxydczrd
HOME=/private/tmp/supabase-home SUPABASE_TELEMETRY_DISABLED=1 supabase functions deploy integration-oauth-start --project-ref mfgstfazcrpvwxydczrd
HOME=/private/tmp/supabase-home SUPABASE_TELEMETRY_DISABLED=1 supabase functions deploy integration-oauth-callback --project-ref mfgstfazcrpvwxydczrd
HOME=/private/tmp/supabase-home SUPABASE_TELEMETRY_DISABLED=1 supabase functions deploy google-calendar-sync --project-ref mfgstfazcrpvwxydczrd
HOME=/private/tmp/supabase-home SUPABASE_TELEMETRY_DISABLED=1 supabase functions deploy google-calendar-create-event --project-ref mfgstfazcrpvwxydczrd
HOME=/private/tmp/supabase-home SUPABASE_TELEMETRY_DISABLED=1 supabase functions deploy geocode-pharmacies --project-ref mfgstfazcrpvwxydczrd
```

## 5. Requêtes de contrôle

Portefeuille Amir :

```sql
with target_agent as (
  select a.id
  from public.agents a
  join public.profiles p on p.id = a.user_id
  where p.email = 'amir.ounissipro@gmail.com'
  limit 1
)
select count(*)::int as active_portfolio
from public.agent_portfolios ap
join target_agent ta on ta.id = ap.agent_id
where ap.status = 'active';
```

Commandes et lignes :

```sql
select count(*)::int as orders_total,
  count(*) filter (where external_deal_id is not null)::int as hubspot_orders,
  count(distinct oi.order_id)::int as orders_with_items,
  count(oi.id)::int as line_items_total
from public.orders o
left join public.order_items oi on oi.order_id = o.id;
```

Google Calendar :

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

## 6. Critères de validation avant déploiement prod

- [ ] `npm run build` OK.
- [ ] Pas de clé secrète dans le front.
- [ ] `.env` non versionné.
- [ ] `.supabase-home` non versionné.
- [ ] `supabase/.temp` non versionné.
- [ ] Fonctions Edge critiques déployées.
- [ ] Sync HubSpot testée.
- [ ] Sync line items testée.
- [ ] Briefing recommandé cohérent.
- [ ] Création visite + agenda testée.
- [ ] Production Vercel testée après déploiement.

## 7. Ce qu’il ne faut pas faire

- [ ] Ne pas désactiver RLS.
- [ ] Ne pas exposer `service_role`.
- [ ] Ne pas transformer PharmaBiz en simple clone HubSpot.
- [ ] Ne pas supprimer les prototypes sans validation.
- [ ] Ne pas merger une grosse refonte sans test mobile.
- [ ] Ne pas importer toutes les pharmacies HubSpot hors owner configuré.

## 8. Ordre de travail recommandé

1. Stabiliser Git.
2. Déployer `hubspot-line-items-sync`.
3. Importer les line items.
4. Vérifier le briefing agent.
5. Refactoriser progressivement `AgentV3Root.jsx`.
6. Stabiliser l’espace marque.
7. Préparer production.
