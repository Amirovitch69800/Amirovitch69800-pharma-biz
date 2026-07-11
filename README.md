# PharmaBiz

Cockpit commercial et opérationnel pour piloter le développement terrain de marques en pharmacie.

## Stack

- Vite
- React
- Supabase
- Vercel

## Installation

```bash
npm install
cp .env.example .env
npm run dev
```

## Variables Supabase

```env
VITE_SUPABASE_URL=https://mfgstfazcrpvwxydczrd.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_l4KC_0odqM5NYIuYV1uGQg_Kwz15Gra
```

## Agent 001

Créer le premier compte avec l'email admin configuré côté Supabase :

```text
amir.ounissi69@gmail.com
```

Le trigger Supabase créera automatiquement le profil admin et l'agent AG-001.

## Modules actifs

- Dashboard
- Comptes pharmacies multimarques
- Activités et relances
- Réseau terrain : animateurs et missions
- Commandes
- Commissions
- Marques
- Assistant IA / WhatsApp
- Paramètres

## Réseau terrain

Le front actif est `src/main-v3.jsx`. Le module permet de créer des animateurs, affecter des missions, saisir les résultats sell-out et valider les missions.

Appliquer la migration suivante dans Supabase avant utilisation :

```text
supabase/migrations/20260711_field_missions_v1.sql
```
