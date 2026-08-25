import { registerSW } from 'virtual:pwa-register';

/**
 * Mise à jour du service worker.
 *
 * L'enregistrement auto-injecté par défaut ne revérifie une mise à jour
 * qu'à la navigation vers la page — sur iPhone, une PWA installée sur
 * l'écran d'accueil ne redéclenche pas ce contrôle aussi fiablement qu'un
 * onglet Safari classique : l'app peut rester bloquée sur une ancienne
 * version pendant des jours. On force donc une vérification explicite à
 * chaque ouverture ET à chaque retour au premier plan, et on recharge
 * immédiatement dès qu'une nouvelle version est trouvée plutôt que
 * d'attendre une improbable prochaine navigation.
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
}
