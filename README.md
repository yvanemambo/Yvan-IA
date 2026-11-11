# Yvan.IA

Assistant IA personnel avec une interface web responsive, authentification Supabase, conversations privées et génération de réponses via Gemini côté serveur.

## Stack
- React + Vite
- Supabase Auth et Postgres (RLS)
- Supabase Edge Function pour appeler Gemini sans exposer la clé API

## Configuration
1. Copier `.env.example` vers `.env.local` et renseigner l'URL Supabase et la clé publishable.
2. Configurer `GEMINI_API_KEY` comme secret de la fonction Edge `yvan-chat` dans Supabase.
3. Déployer la fonction Edge puis lancer `npm install` et `npm run dev`.

Ne jamais placer une clé Gemini ou une clé Supabase `service_role` dans le navigateur.

## État
Première base applicative en construction. L'application doit être testée avec un vrai compte avant toute mise en production.
