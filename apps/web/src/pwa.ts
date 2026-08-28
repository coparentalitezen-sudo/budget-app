import { registerSW } from 'virtual:pwa-register';

/**
 * Mise à jour du service worker.
 *
 * Deux mécanismes cumulés, parce qu'aucun des deux seul ne s'est montré
 * fiable en pratique sur une PWA iOS installée sur l'écran d'accueil :
 *
 * 1. Le cycle normal du service worker (`registration.update()` +
 *    `onNeedRefresh`) : correct sur le papier, mais iOS ne relance pas
 *    toujours le contrôle d'octets du fichier `sw.js` de façon fiable en
 *    arrière-plan — l'app peut rester des jours sur une ancienne version
 *    sans qu'aucune erreur ne le signale.
 *
 * 2. Un contrôle direct par le réseau, indépendant du service worker : on
 *    récupère `version.json` (généré à chaque build, jamais précaché — voir
 *    `vite.config.ts`) et on compare son SHA à `__APP_VERSION__`, celui
 *    déjà chargé. S'ils diffèrent, un nouveau déploiement existe — on
 *    recharge la page directement, sans passer par la mécanique (parfois
 *    bloquée) du service worker. Interroger `/index.html` à la place
 *    semblait plus simple, mais c'était un piège : cette URL EST précachée,
 *    donc le service worker déjà installé y répondait depuis SON PROPRE
 *    cache — la vérification comparait alors l'ancienne version à
 *    elle-même, sans jamais rien détecter.
 *
 * Les deux tournent à l'ouverture et à chaque retour au premier plan.
 */
export function installerMiseAJourPwa(): void {
  const recharger = registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      void registration.update();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void registration.update();
      });
    },
    onNeedRefresh() {
      void recharger(true);
    },
  });

  void verifierVersionEnLigne();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void verifierVersionEnLigne();
  });
}

async function verifierVersionEnLigne(): Promise<void> {
  try {
    const reponse = await fetch('/version.json', { cache: 'no-store' });
    if (!reponse.ok) return;
    const distant: unknown = await reponse.json();
    const version = typeof distant === 'object' && distant !== null && 'version' in distant
      ? String((distant as { version: unknown }).version)
      : null;
    // Une vérification manquée (hors ligne, erreur réseau, réponse mal
    // formée) n'est jamais traitée comme une mise à jour : on ne recharge
    // que sur une différence positivement constatée.
    if (version && version !== __APP_VERSION__) window.location.reload();
  } catch {
    // Retentera au prochain passage au premier plan.
  }
}
