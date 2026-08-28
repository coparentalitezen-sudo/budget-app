import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { app } from './src/config/app.config.ts';

/**
 * Identifiant de build, affiché dans l'app pour vérifier qu'un déploiement a
 * bien pris effet (utile avec le cache agressif d'une PWA). Vercel fournit le
 * SHA du commit en variable d'environnement ; en local, on le lit via git.
 */
function shaCourt(): string {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  if (sha) return sha.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'dev';
  }
}

const APP_VERSION = shaCourt();
const BUILD_TIME = new Date().toISOString();

/**
 * `version.json`, généré à chaque build, JAMAIS précaché par le service
 * worker (voir `workbox.globPatterns` ci-dessous — il ne cible que
 * js/css/html/png/svg/woff2, pas json). `src/pwa.ts` le récupère par un
 * `fetch` classique pour savoir si un nouveau déploiement existe : un
 * fichier qui échapperait au précache est indispensable, sinon la requête
 * est interceptée par le SW déjà installé et répondue depuis SON PROPRE
 * cache — comparant alors l'ancienne version à elle-même.
 */
function ecrireVersionJson(): Plugin {
  return {
    name: 'ecrire-version-json',
    apply: 'build',
    writeBundle(options) {
      writeFileSync(
        resolve(options.dir ?? 'dist', 'version.json'),
        JSON.stringify({ version: APP_VERSION }),
      );
    },
  };
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __BUILD_TIME__: JSON.stringify(BUILD_TIME),
  },
  // Le moteur est résolu comme un vrai paquet du workspace (@budget/core),
  // et non par un alias propre au bundler : Vite, Node et TypeScript le
  // trouvent tous de la même façon, y compris pour les tests.
  plugins: [
    react(),
    ecrireVersionJson(),
    VitePWA({
      // 'prompt', pas 'autoUpdate' : avec 'autoUpdate', vite-plugin-pwa
      // génère un service worker qui s'active tout seul (skipWaiting +
      // clientsClaim inconditionnels dès l'installation) — aucune occasion
      // de demander. 'prompt' laisse le nouveau worker EN ATTENTE ; c'est
      // `src/pwa.ts` qui décide quand l'activer (bandeau + bouton).
      registerType: 'prompt',
      // Enregistrement manuel (voir main.tsx) : le script auto-injecté par
      // défaut ne vérifie une mise à jour qu'au chargement de la page, ce
      // qui suffit peu pour une PWA installée sur iPhone — iOS ne relance
      // pas ce contrôle aussi fiablement qu'un onglet de navigateur classique.
      injectRegister: false,
      includeAssets: [app.pwa.icones.icon192, app.pwa.icones.icon512],
      manifest: {
        name: app.identite.nom,
        short_name: app.identite.nomCourt,
        description: app.identite.description,
        lang: app.identite.langue,
        start_url: app.pwa.startUrl,
        display: app.pwa.affichage,
        background_color: app.marque.themeColor,
        theme_color: app.marque.themeColor,
        icons: [
          { src: app.pwa.icones.icon192, sizes: '192x192', type: 'image/png' },
          { src: app.pwa.icones.icon512, sizes: '512x512', type: 'image/png' },
          // Variante `maskable` distincte : le système peut rogner jusqu'à
          // 20 % de chaque côté, d'où une marge intérieure plus large.
          { src: app.pwa.icones.maskable512, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        // pdfjs (≈350 Ko + worker de 1,3 Mo) ne fait PAS partie du shell :
        // le précacher retarderait la première ouverture pour une
        // fonctionnalité utilisée quelques fois par mois. Il est mis en
        // cache au premier import réel, et reste ensuite disponible.
        globIgnores: ['**/pdf-*.js', '**/pdf.worker*.mjs'],
        // Le shell applicatif est précaché : l'app démarre hors ligne.
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: /\/assets\/pdf.*\.(js|mjs)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'pdfjs',
              expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 90 },
            },
          },
          {
            // Les appels Supabase ne sont JAMAIS servis depuis un cache
            // périmé : Dexie est la source de vérité locale, pas le cache HTTP.
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkOnly',
          },
          {
            // Tesseract.js (OCR de ticket, voir lib/ocr/) récupère son
            // worker, son cœur WASM et ses données de langue depuis ce CDN
            // par défaut — jamais empaquetés par Vite. Même logique que
            // pdf.js : rien à précacher, seulement disponible hors ligne
            // après un premier usage réel en ligne.
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/npm\/(tesseract|@tesseract\.js-data)/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tesseract',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 90 },
            },
          },
        ],
      },
    }),
  ],
});
