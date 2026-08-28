import { registerSW } from 'virtual:pwa-register';

/**
 * Mise à jour du service worker — mode « bandeau + bouton » (06-PWA.md :
 * « le worker écoute SKIP_WAITING ; le composant ServiceWorker détecte une
 * nouvelle version et propose de recharger. Ne pas recharger d'autorité,
 * l'utilisateur perdrait sa saisie en cours »).
 *
 * Le nouveau worker reste EN ATTENTE ; il n'est activé (SKIP_WAITING) que
 * sur appui explicite du bouton « Actualiser » du bandeau — voir
 * `appliquerMiseAJour`. `registerType: 'prompt'` dans `vite.config.ts` est
 * ce qui empêche le service worker de s'auto-activer : `autoUpdate`
 * générerait un `self.skipWaiting()` inconditionnel, sans jamais laisser
 * l'occasion de demander.
 *
 * Deux détecteurs, un seul signal (le bandeau) :
 *
 * 1. `onNeedRefresh`, fourni par `registerSW` : se déclenche quand le
 *    cycle normal du service worker trouve un nouveau worker et le met en
 *    attente.
 * 2. Un contrôle réseau direct sur `version.json` (jamais précaché — voir
 *    `vite.config.ts`), en secours si le cycle du service worker traîne.
 *
 * `registration.update()` est forcé à l'ouverture ET à chaque retour au
 * premier plan (`visibilitychange`) : une PWA installée n'est jamais
 * rechargée, seulement mise en arrière-plan puis reprise — sans ce
 * forçage, aucune mise à jour ne serait jamais détectée sur mobile.
 *
 * Rien n'est signalé à la toute première installation
 * (`navigator.serviceWorker.controller` encore vide : il n'y a rien à
 * « mettre à jour », seulement une première mise en cache) ni deux fois
 * pour la même mise à jour.
 */

const EVENEMENT_MISE_A_JOUR = 'pwa:mise-a-jour-disponible';

let dejaSignale = false;
let dejaRecharge = false;
let declencherSkipWaiting: ((reload?: boolean) => Promise<void>) | null = null;
let registrationActuelle: ServiceWorkerRegistration | null = null;

export function installerMiseAJourPwa(): void {
  const signaler = () => {
    if (dejaSignale) return;
    if (!navigator.serviceWorker?.controller) return;
    dejaSignale = true;
    window.dispatchEvent(new Event(EVENEMENT_MISE_A_JOUR));
  };

  if ('serviceWorker' in navigator) {
    // Garde anti-boucle : un seul rechargement, déclenché UNIQUEMENT une
    // fois que le nouveau worker a réellement pris le contrôle (jamais à
    // l'appui du bouton lui-même, qui ne fait qu'activer le worker).
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (dejaRecharge) return;
      dejaRecharge = true;
      window.location.reload();
    });
  }

  declencherSkipWaiting = registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      registrationActuelle = registration;
      void registration.update();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void registration.update();
      });
    },
    onNeedRefresh() {
      signaler();
    },
  });

  void verifierVersionEnLigne(signaler);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void verifierVersionEnLigne(signaler);
  });
}

/** S'abonne à la disponibilité d'une mise à jour. Renvoie la fonction de désabonnement. */
export function ecouterMiseAJourDisponible(gestionnaire: () => void): () => void {
  window.addEventListener(EVENEMENT_MISE_A_JOUR, gestionnaire);
  return () => window.removeEventListener(EVENEMENT_MISE_A_JOUR, gestionnaire);
}

/** Appelé UNIQUEMENT par l'appui explicite sur « Actualiser » du bandeau. */
export function appliquerMiseAJour(): void {
  void registrationActuelle?.update();
  void declencherSkipWaiting?.(true);
}

async function verifierVersionEnLigne(signaler: () => void): Promise<void> {
  try {
    const reponse = await fetch('/version.json', { cache: 'no-store' });
    if (!reponse.ok) return;
    const distant: unknown = await reponse.json();
    const version = typeof distant === 'object' && distant !== null && 'version' in distant
      ? String((distant as { version: unknown }).version)
      : null;
    // Une vérification manquée (hors ligne, erreur réseau, réponse mal
    // formée) n'est jamais traitée comme une mise à jour : on ne signale
    // que sur une différence positivement constatée.
    if (version && version !== __APP_VERSION__) signaler();
  } catch {
    // Retentera au prochain passage au premier plan.
  }
}
