# PharmaBiz

Plateforme d’exécution commerciale spécialisée pharmacie.

PharmaBiz n’est pas pensé comme un CRM générique : c’est une couche terrain entre les marques santé, les agents commerciaux, les intervenants et les pharmacies.

## État du projet

Date de passation : `2026-07-14`

Statut :

- front React/Vite fonctionnel ;
- Supabase actif ;
- espace agent Naali en cours de stabilisation ;
- intégration HubSpot Naali en place ;
- Google Calendar en place ;
- passation dev documentée.

Point important :

> Le dépôt contient beaucoup de changements non commités. Ne pas faire de `reset`. Lire la passation avant toute intervention.

## Stack

- Vite
- React
- Supabase Auth
- Supabase Postgres
- Supabase Edge Functions
- Vercel

## Documentation de passation

À lire en priorité :

1. `docs/PASSATION_DEV.md`
2. `docs/CHECKLIST_SUPERVISION_DEV.md`
3. `docs/ARCHITECTURE_TECHNIQUE_CIBLE.md`
4. `docs/AUDIT_ALIGNEMENT_AGENT_PROTOTYPE.md`
5. `docs/PLAN_EXECUTION_V1.md`

## Installation locale

```bash
cd /Users/amirounissi/Documents/Codex/2026-07-10/ph/pharma-biz
npm install
cp .env.example .env
npm run dev
```

## Build

```bash
npm run build
```

Le build est la vérification minimale avant toute passation ou déploiement.

## Variables front-end

```env
VITE_SUPABASE_URL=https://mfgstfazcrpvwxydczrd.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

Ne jamais mettre de `service_role` ou secret HubSpot/Google dans le front-end.

## Supabase

Projet :

```text
mfgstfazcrpvwxydczrd
```

Nom :

```text
Pharmabiz
```

Fonctions Edge principales :

- `hubspot-sync`
- `hubspot-line-items-sync`
- `integration-oauth-start`
- `integration-oauth-callback`
- `google-calendar-sync`
- `google-calendar-create-event`
- `geocode-pharmacies`
- `sync-order-to-hubspot`

## Déploiement Edge Functions

Exemple :

```bash
cd /Users/amirounissi/Documents/Codex/2026-07-10/ph/pharma-biz
HOME=/private/tmp/supabase-home SUPABASE_TELEMETRY_DISABLED=1 supabase functions deploy hubspot-line-items-sync --project-ref mfgstfazcrpvwxydczrd
```

Toutes les commandes critiques sont dans `docs/PASSATION_DEV.md`.

## Déploiement Vercel

```bash
cd /Users/amirounissi/Documents/Codex/2026-07-10/ph/pharma-biz
npx vercel@55.0.0 --prod --yes
```

Production observée :

```text
https://pharma-biz.vercel.app
```

## Règles de développement

- Ne pas désactiver RLS.
- Ne pas exposer de secrets dans le front.
- Ne pas transformer PharmaBiz en clone HubSpot.
- Ne pas supprimer les prototypes HTML sans validation.
- Priorité à l’espace agent mobile.
- Toute action doit servir le cycle : décider, préparer, exécuter, enregistrer, planifier.

## Prochaine action recommandée

1. Commit checkpoint propre.
2. Déployer `hubspot-line-items-sync`.
3. Importer les line items HubSpot.
4. Vérifier le briefing agent.
5. Déployer Vercel.
