# Mise en ligne — V1

Le dépôt Git est **complet et vérifié** : un clone neuf passe 215
vérifications et produit un build propre sans aucune intervention.

Il n'a pas été poussé sur GitHub : cela exige une authentification que je
n'ai pas, et que je ne dois pas manipuler. Toutes les commandes sont
ci-dessous.

## 1. Récupérer le dépôt

Deux options selon ce que vous avez téléchargé.

**Depuis le bundle Git** (conserve l'historique et les deux branches) :

```bash
git clone budget-app.bundle budget-app
cd budget-app
git remote remove origin
```

**Depuis le dossier** (si vous avez pris l'arborescence) :

```bash
cd budget-app
git init && git add -A && git commit -m "V1"
git branch -M main
```

## 2. Créer le dépôt GitHub privé

Nom suggéré : **`budget-app`** — Visibilité : **privée**.
Ne pas initialiser avec un README, il en existe déjà un.

Via l'interface : github.com/new. Ou en ligne de commande :

```bash
gh repo create budget-app --private --source=. --remote=origin
```

Puis pousser les deux branches :

```bash
git remote add origin git@github.com:<votre-compte>/budget-app.git   # si non fait par gh
git push -u origin main
git checkout -b develop && git push -u origin develop && git checkout main
```

Enfin, *Settings → Branches → Add rule* sur `main` : exiger une pull
request, interdire les push directs.

### Vérification avant le premier push

```bash
git ls-files | grep -E "^\.env$|node_modules|/dist/"   # doit ne rien renvoyer
```

Le `.gitignore` exclut `.env`, `.env.*`, `*.pem`, `*.key`, `secrets.json`,
`node_modules/` et `dist/`. Seul `.env.example` est versionné, et il ne
contient que des valeurs factices.

## 3. Supabase

```bash
supabase link --project-ref <ref>
supabase db push          # applique les 10 migrations
```

Puis dans l'interface Supabase :

1. **Authentication → Providers** : activer *Email*, et y activer les liens
   magiques (l'application n'utilise aucun mot de passe).
2. **Authentication → URL Configuration → Redirect URLs** : ajouter l'URL
   Vercel de production **et** `http://localhost:5173` pour le développement.
   Sans cela, le lien de connexion renvoie vers une page introuvable.
3. **Settings → API** : relever `Project URL`, la clé `anon` et la clé
   `service_role`.

## 4. Variables d'environnement Vercel

À créer pour les environnements **Production** et **Preview**.

| Variable | Nature | Valeur |
|---|---|---|
| `VITE_SUPABASE_URL` | Publique | Supabase → Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Publique | Supabase → Settings → API → clé `anon` |
| `SUPABASE_URL` | Serveur | Même URL, sans le préfixe `VITE_` |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secrète** | Supabase → Settings → API → `service_role` |
| `AI_ASSISTANT_API_TOKEN` | **Secrète** | `openssl rand -hex 32` |
| `AI_ASSISTANT_USER_ID` | Serveur | Votre UUID, après la première connexion |

Toute variable préfixée `VITE_` est **intégrée au bundle JavaScript et
publiquement lisible**. Les deux clés secrètes ne doivent jamais l'être.

Les deux dernières lignes ne servent qu'à l'API d'assistance. Sans elles,
`/api/*` répond `503` : les routes refusent de servir plutôt que de s'ouvrir.

## 5. Déploiement Vercel

```bash
npm i -g vercel
vercel login
vercel link                    # Root Directory : apps/web

vercel env add VITE_SUPABASE_URL production
vercel env add VITE_SUPABASE_ANON_KEY production
vercel env add SUPABASE_URL production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add AI_ASSISTANT_API_TOKEN production
vercel env add AI_ASSISTANT_USER_ID production

vercel --prod
```

`vercel.json` fixe déjà la commande de build, le répertoire de sortie et les
en-têtes de sécurité — dont `Cache-Control: max-age=0` sur `/sw.js`, sans
lequel un service worker périmé peut rester actif plusieurs jours.

## 6. Seed

**Après** une première connexion dans l'application déployée, qui crée la
ligne `auth.users`. Relevez votre UUID dans Supabase → Authentication →
Users, puis :

```bash
npm run db:seed     # régénère seed.sql depuis la fixture du moteur
psql "$DATABASE_URL" -v user_id="'<votre-uuid>'" -f supabase/seed.sql
```

`DATABASE_URL` se trouve dans Supabase → Settings → Database → Connection
string (URI). Le seed est **idempotent** : le rejouer ne duplique rien.

Charge : 4 comptes, 19 catégories, 3 revenus, 4 charges, 3 provisions, la
taxe foncière 2026 en dette ponctuelle, 2 objectifs d'épargne, 1 crédit
détaillé, 10 règles de catégorisation et 12 mois d'enveloppes.

Aucune valeur inconnue n'est fabriquée : les soldes restent `NULL`.

## 7. Vérifications

Voir `CHECKLIST_DEPLOIEMENT.md` — huit contrôles, dont le test décisif :
saisir une dépense en mode avion, puis vérifier que le compteur « en
attente » retombe à zéro au retour du réseau.

## En cas de reprise par un tiers

`AI_HANDOFF.md` contient tout ce qu'il faut pour reprendre le projet sans
cette conversation. `ACCESS_FOR_AI.md` décrit comment donner un accès
révocable et minimal à un assistant externe.
