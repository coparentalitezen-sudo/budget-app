# DEPLOYMENT.md

## Vue d'ensemble

| Composant | Hébergement |
|---|---|
| PWA React | Vercel (production + preview par branche) |
| Base PostgreSQL, Auth, Edge Functions | Supabase |
| Code | GitHub — `main` protégée, `develop` d'intégration |

## Prérequis

- Node.js 22 ou plus (le moteur exécute TypeScript nativement)
- Un projet Supabase
- Un compte Vercel relié au dépôt GitHub

## Variables d'environnement

### Côté client (exposées au navigateur — jamais de secret ici)

| Variable | Rôle |
|---|---|
| `VITE_SUPABASE_URL` | URL du projet Supabase |
| `VITE_SUPABASE_ANON_KEY` | Clé publique `anon`. Sans danger : la RLS fait la sécurité |

### Côté serveur uniquement (Vercel → Settings → Environment Variables)

| Variable | Rôle |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Administration. **Jamais préfixée `VITE_`** |
| `AI_ASSISTANT_API_TOKEN` | Jeton d'assistance externe, révocable |

Toute variable préfixée `VITE_` est **intégrée au bundle et publiquement
lisible**. Cette règle à elle seule évite la fuite la plus courante.

## Déploiement de la base

```bash
supabase link --project-ref <ref>
supabase db push          # applique supabase/migrations/ dans l'ordre
```

Avant tout `push`, valider localement :

```bash
npm run db:test           # exécute les 8 migrations + 33 vérifications
```

Les migrations sont **additives et versionnées**. Ne jamais éditer une
migration déjà appliquée en production : en créer une nouvelle. Une migration
rétroactive rend les environnements irréconciliables.

## Déploiement du frontend

```bash
cd apps/web
npm run build             # typecheck + build Vite
```

Réglages Vercel : *Framework* Vite, *Root directory* `apps/web`,
*Build command* `npm run build`, *Output* `dist`.

Chaque branche produit un déploiement de preview avec sa propre URL.
`main` produit la production.

## Installation sur iPhone

Safari → Partager → « Sur l'écran d'accueil ». Le service worker prend la main
au second lancement. Le manifeste fixe `display: standalone` afin que
l'application s'ouvre sans barre d'adresse.

À savoir : iOS purge le stockage des sites web non utilisés pendant sept
jours — **sauf** les applications ajoutées à l'écran d'accueil. La
synchronisation avec Supabase reste donc la garantie de durabilité des
données ; IndexedDB est un cache de travail, pas un coffre-fort.

## Sauvegarde

Supabase assure des sauvegardes automatiques selon le plan souscrit. Le
Google Sheet reste la référence jusqu'à validation complète de
l'application ; aucune écriture n'est faite dessus.

## Rollback

- **Frontend** : Vercel → Deployments → *Promote to Production* sur un
  déploiement antérieur. Immédiat.
- **Base** : pas de rollback automatique. Écrire une migration inverse et la
  tester avec `npm run db:test` avant application.

---

## Déploiement effectif — marche à suivre

Ces étapes n'ont **pas** été exécutées : elles exigent vos identifiants
Supabase, GitHub et Vercel. Le dépôt est prêt à les recevoir.

### 1. GitHub

```bash
git init && git add . && git commit -m "V1 : moteur, base, PWA"
git branch -M main && git remote add origin git@github.com:<vous>/budget-app.git
git push -u origin main
git checkout -b develop && git push -u origin develop
```

Puis *Settings → Branches* : protéger `main` (revue exigée, pas de push direct).

### 2. Supabase

```bash
supabase link --project-ref <ref>
supabase db push
```

Dans *Authentication → URL Configuration*, ajouter l'URL Vercel aux
*Redirect URLs*, sinon le lien magique renverra vers `localhost`.

### 3. Seed

Se connecter une fois dans l'application pour créer la ligne `auth.users`,
relever son UUID dans *Authentication → Users*, puis :

```bash
npm run db:seed
psql "$DATABASE_URL" -v user_id="'<uuid>'" -f supabase/seed.sql
```

### 4. Vercel

```bash
npm i -g vercel
vercel link
vercel env add VITE_SUPABASE_URL production
vercel env add VITE_SUPABASE_ANON_KEY production
vercel --prod
```

*Root Directory* : `apps/web`. `vercel.json` fixe déjà la commande de build,
le répertoire de sortie et les en-têtes de sécurité — dont un
`Cache-Control: max-age=0` sur `/sw.js`, sans lequel un service worker
périmé peut rester actif plusieurs jours.

### 5. Vérification

- Ouvrir l'URL sur iPhone, *Partager → Sur l'écran d'accueil*.
- Passer en mode avion, saisir une dépense : elle doit apparaître aussitôt.
- Réactiver le réseau : le compteur « en attente » doit retomber à zéro.
