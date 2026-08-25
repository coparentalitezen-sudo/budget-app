import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

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
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Budget',
        short_name: 'Budget',
        description: 'Gestion budgétaire personnelle',
        lang: 'fr-FR',
        start_url: '/',
        display: 'standalone',
        background_color: '#0f1115',
        theme_color: '#0f1115',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          // Variante `maskable` distincte : le système peut rogner jusqu'à
          // 20 % de chaque côté, d'où une marge intérieure plus large.
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
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
        ],
      },
    }),
  ],
});
