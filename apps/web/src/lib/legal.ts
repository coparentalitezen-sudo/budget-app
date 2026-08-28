import { app } from '../config/app.config.ts';

/**
 * Identité de l'éditeur (mentions légales) — lue depuis les variables
 * d'environnement, avec repli sur `app.config.ts` tant qu'elles ne sont
 * pas renseignées. Rien ici n'est un secret : ces variables ne sont PAS
 * préfixées `VITE_` par choix (elles restent à compléter côté
 * déploiement, jamais codées en dur dans le dépôt), donc lues via
 * `import.meta.env` uniquement quand présentes.
 *
 * Deux protections reprises du blueprint :
 *  1. Une valeur d'attente affiche « À compléter », jamais une phrase de
 *     consigne recopiée par erreur (déjà arrivé sur le produit dont ce
 *     blueprint est issu).
 *  2. `identiteComplete()` est interrogeable par programme plutôt que de
 *     se fier à une relecture — voir Parametres.tsx / un futur
 *     `/api/diagnostic`.
 */

const lire = (nom: string): string | null => {
  const valeur = (import.meta.env[nom] as string | undefined)?.trim();
  return valeur && valeur.length > 0 ? valeur : null;
};

export const identiteEditeur = {
  denomination: lire('VITE_LEGAL_PUBLISHER_NAME') ?? app.legal.formeParDefaut,
  forme: lire('VITE_LEGAL_PUBLISHER_FORM') ?? app.legal.formeParDefaut,
  siren: lire('VITE_LEGAL_PUBLISHER_SIREN'),
  adresse: lire('VITE_LEGAL_PUBLISHER_ADDRESS'),
  responsablePublication: lire('VITE_LEGAL_PUBLISHER_DIRECTOR'),
  contact: lire('VITE_LEGAL_CONTACT_EMAIL'),
  mediateur: lire('VITE_LEGAL_MEDIATOR'),
  versionTextes: app.legal.versionTextes,
};

/** Neuf chiffres, espaces tolérés — jamais une validation plus stricte que le format réel. */
function sirenPlausible(siren: string | null): boolean {
  if (!siren) return false;
  return /^\d{9}$/.test(siren.replace(/\s/g, ''));
}

export interface EtatIdentite {
  siren: 'renseigne' | 'manquant' | 'valeur_invalide';
  denomination: 'renseigne' | 'manquant';
  adresse: 'renseigne' | 'manquant';
  mediateur: 'renseigne' | 'manquant';
}

/**
 * Chaque champ, individuellement — pour un écran de diagnostic qui montre
 * PRÉCISÉMENT ce qui manque, jamais un simple « incomplet ».
 */
export function etatIdentite(): EtatIdentite {
  return {
    siren: identiteEditeur.siren === null
      ? 'manquant'
      : sirenPlausible(identiteEditeur.siren) ? 'renseigne' : 'valeur_invalide',
    // La dénomination doit être DISTINCTE du nom du produit : tant que la
    // variable n'est pas posée, le repli vaut le nom du produit lui-même,
    // qui ne doit jamais compter comme une identité complète.
    denomination: lire('VITE_LEGAL_PUBLISHER_NAME') !== null ? 'renseigne' : 'manquant',
    adresse: identiteEditeur.adresse && identiteEditeur.adresse.length > 10 ? 'renseigne' : 'manquant',
    mediateur: identiteEditeur.mediateur ? 'renseigne' : 'manquant',
  };
}

/**
 * Vrai seulement si SIREN plausible + dénomination distincte du produit +
 * adresse renseignée. Le médiateur est vérifié séparément
 * (`etatIdentite().mediateur`) : bloquant pour COMMERCIALISER, mais pas
 * pour afficher une identité légale minimale.
 */
export function identiteComplete(): boolean {
  const e = etatIdentite();
  return e.siren === 'renseigne' && e.denomination === 'renseigne' && e.adresse === 'renseigne';
}
