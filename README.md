# PharmaBiz

Cockpit commercial terrain pour gérer pharmacies, marques, produits, commandes, commissions, notes de frais et imports.

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

## Modules V1

- Dashboard
- Pharmacies
- Produits
- Commandes
- Commissions
- Notes de frais
- Imports
