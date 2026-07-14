# PharmaBiz — État de passation du 2026-07-14

## Résumé

Le projet est prêt pour une passation supervisée, mais pas encore prêt pour une reprise sans contexte.

Ce qui est prêt :

- documentation de passation ;
- checklist supervision ;
- README mis à jour ;
- build front validé ;
- `.gitignore` renforcé ;
- structure Supabase documentée ;
- commandes de déploiement Supabase/Vercel documentées.

Ce qui reste à faire avant passation définitive :

- faire un commit checkpoint ;
- pousser sur GitHub ;
- déployer les Edge Functions modifiées depuis un terminal authentifié ;
- vérifier la sync line items HubSpot ;
- vérifier la production Vercel.

## État Git local

Branche :

```text
main
```

Remote :

```text
origin https://github.com/Amirovitch69800/Amirovitch69800-pharma-biz.git
```

Important :

- beaucoup de fichiers sont modifiés ou non suivis ;
- ne pas faire de reset ;
- traiter l’état actuel comme un checkpoint produit.

## Fichiers de passation

- `README.md`
- `docs/PASSATION_DEV.md`
- `docs/CHECKLIST_SUPERVISION_DEV.md`
- `docs/ETAT_PASSATION_2026-07-14.md`
- `docs/ARCHITECTURE_TECHNIQUE_CIBLE.md`
- `docs/PLAN_EXECUTION_V1.md`
- `docs/AUDIT_ALIGNEMENT_AGENT_PROTOTYPE.md`

## Fichiers critiques ajoutés ou modifiés

Front :

- `src/features/agent/AgentV3Root.jsx`
- `src/features/agent/useAgentWorkspaceData.js`
- `src/features/agent/franceDepartments.js`
- `src/lib/integrations.js`
- `src/lib/roles.js`
- `src/app-v2.css`
- `src/main-v2.jsx`

Supabase :

- `supabase/functions/hubspot-sync/index.ts`
- `supabase/functions/hubspot-line-items-sync/index.ts`
- `supabase/functions/integration-oauth-start/index.ts`
- `supabase/functions/integration-oauth-callback/index.ts`
- `supabase/functions/google-calendar-sync/index.ts`
- `supabase/functions/google-calendar-create-event/index.ts`
- `supabase/functions/geocode-pharmacies/index.ts`

Migrations :

- `supabase/migrations/20260714113801_v1_roles_capabilities_portfolios.sql`
- `supabase/migrations/20260714114252_v1_order_sources_validation.sql`
- `supabase/migrations/20260714134816_allow_hubspot_order_type_labels.sql`
- `supabase/migrations/20260714142043_make_order_type_crm_flexible.sql`
- `supabase/migrations/20260714142517_add_naali_catalogue_reference_to_pharmacies.sql`
- `supabase/migrations/20260714152446_add_pharmacy_geocoding_fields.sql`
- `supabase/migrations/20260714173052_add_oauth_credentials_reader.sql`
- `supabase/migrations/20260714173758_grant_oauth_credentials_reader_to_service_role.sql`

## Dernière validation locale

Commande :

```bash
npm run build
```

Résultat :

```text
✓ built
```

Note :

- Vite signale un bundle > 500 kB.
- Ce n’est pas bloquant pour la passation.
- À traiter plus tard avec du code splitting.

## Déploiement Supabase

La CLI Supabase dans l’environnement Codex a échoué avec :

```text
failed to list functions: TransportError
```

Donc le déploiement des fonctions doit être fait depuis le terminal utilisateur authentifié.

Commandes prioritaires :

```bash
cd /Users/amirounissi/Documents/Codex/2026-07-10/ph/pharma-biz
HOME=/private/tmp/supabase-home SUPABASE_TELEMETRY_DISABLED=1 supabase functions deploy hubspot-sync --project-ref mfgstfazcrpvwxydczrd
HOME=/private/tmp/supabase-home SUPABASE_TELEMETRY_DISABLED=1 supabase functions deploy hubspot-line-items-sync --project-ref mfgstfazcrpvwxydczrd
HOME=/private/tmp/supabase-home SUPABASE_TELEMETRY_DISABLED=1 supabase functions deploy integration-oauth-start --project-ref mfgstfazcrpvwxydczrd
HOME=/private/tmp/supabase-home SUPABASE_TELEMETRY_DISABLED=1 supabase functions deploy integration-oauth-callback --project-ref mfgstfazcrpvwxydczrd
```

## Commit recommandé

Message recommandé :

```text
checkpoint: stabilize agent workspace and dev handoff
```

Avant commit :

```bash
npm run build
git status
git diff --stat
```

Commit :

```bash
git add README.md .gitignore docs src supabase
git commit -m "checkpoint: stabilize agent workspace and dev handoff"
git push origin main
```

À décider avant `git add` :

- conserver ou ignorer `agent-local.html` ;
- conserver ou ignorer `audit-v3.html` ;
- conserver ou ignorer `refonte-local.html`.

Ces fichiers semblent être des prototypes/audits locaux. Ils ne doivent pas être supprimés sans validation.
