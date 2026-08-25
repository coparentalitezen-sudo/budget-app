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
 *    récupère `index.html` sans cache et on compare le nom du script
 *    JavaScript qu'il référence à celui réellement chargé. S'ils diffèrent,
 *    un nouveau déploiement existe — on recharge la page directement,
 *    sans passer par la mécanique (parfois bloquée) du service worker.
 *    C'est un simple `fetch`, donc nettement plus prévisible.
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
  const actuel = document
    .querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]')
    ?.getAttribute('src');
  if (!actuel) return;

  try {
    const reponse = await fetch('/', { cache: 'no-store' });
    if (!reponse.ok) return;
    const html = await reponse.text();
    const distant = /\/assets\/index-[\w-]+\.js/.exec(html)?.[0];
    // Une vérification manquée (hors ligne, erreur réseau) n'est jamais
    // traitée comme une mise à jour : on ne recharge que sur une différence
    // positivement constatée.
    if (distant && distant !== actuel) window.location.reload();
  } catch {
    // Retentera au prochain passage au premier plan.
  }
}
