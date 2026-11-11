# Yvan.IA

Assistant IA personnel avec une interface web responsive, des comptes Supabase, un historique privé de plusieurs conversations et des réponses Gemini exécutées côté serveur.

## Stack
- React 19 + Vite
- Supabase Auth pour les comptes
- Supabase Postgres avec Row Level Security (RLS) pour l'historique
- Supabase Edge Function pour appeler Gemini sans exposer la clé API
- Vercel prêt pour l'hébergement du frontend

## Base de données déjà préparée
Le projet Supabase associé est `rrxlyhtrdykbngtkqszq`. Il contient notamment la table `chat_history`, avec une ligne par utilisateur et un tableau JSON de conversations. Les politiques RLS SELECT/INSERT/UPDATE vérifient `auth.uid() = user_id`. Les conversations ne sont donc accessibles qu'au compte connecté propriétaire.

## Configuration locale
1. Copier `.env.example` vers `.env.local`.
2. Renseigner l'URL Supabase et la clé publishable (ou ancienne clé anon) depuis Supabase > Project Settings > API Keys.
3. Créer une clé Gemini dans [Google AI Studio](https://aistudio.google.com/app/apikey), puis ouvrir Supabase > Edge Functions > Secrets et ajouter le secret nommé exactement `GEMINI_API_KEY` avec cette clé comme valeur. Ne jamais mettre cette clé dans `.env.local`, dans une variable `VITE_*` ou dans GitHub.
4. Déployer la fonction Edge `yvan-chat` avec `supabase functions deploy yvan-chat` après avoir lié le projet Supabase.
5. Installer et lancer le frontend :

```bash
npm install
npm run dev
```

## Vérifications à faire avant mise en ligne
- Tester la création de compte, la confirmation e-mail et la connexion.
- Tester un échange Gemini avec une clé valide.
- Tester la création de plusieurs conversations, leur rechargement et la séparation entre deux comptes.
- Lancer `npm run build`.
- Configurer les variables d'environnement du frontend sur l'hébergeur.

## Sécurité
- La clé Gemini reste dans les secrets de l'Edge Function.
- La fonction exige un JWT valide et vérifie l'utilisateur connecté.
- L'historique est protégé par RLS au niveau de Postgres.
- Ne jamais ajouter une clé Supabase `service_role` au frontend.
- Aucun déploiement de production n'est effectué par ce dépôt automatiquement pour le moment.

## État
Première base applicative déposée. Le code n'a pas encore été exécuté dans un navigateur ni validé par un build complet.