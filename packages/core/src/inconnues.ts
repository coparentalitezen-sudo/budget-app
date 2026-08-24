import type { Configuration } from './types.ts';

/**
 * Inventaire exhaustif des données financières inconnues.
 *
 * Sert de garde-fou testable à la règle « inconnu ≠ zéro » : tout champ
 * listé ici DOIT valoir `null` dans la configuration, et aucun calcul du
 * moteur ne doit produire un chiffre en le remplaçant par 0.
 */
export interface Inconnue {
  chemin: string;
  libelle: string;
  /** Ce que le moteur refuse de calculer tant que la donnée manque. */
  consequence: string;
}

export function inventaireInconnues(config: Configuration): Inconnue[] {
  const inconnues: Inconnue[] = [];

  for (const compte of config.comptes) {
    if (compte.solde === null) {
      inconnues.push({
        chemin: `comptes[${compte.id}].solde`,
        libelle: `Solde du compte « ${compte.nom} »`,
        consequence:
          compte.type === 'courant'
            ? 'Projections de solde et montant transférable indisponibles'
            : 'Ressource non mobilisable dans les scénarios de financement',
      });
    }
  }

  for (const objectif of config.objectifsEpargne) {
    if (objectif.montantActuel === null) {
      inconnues.push({
        chemin: `objectifsEpargne[${objectif.id}].montantActuel`,
        libelle: `Solde constitué de « ${objectif.nom} »`,
        consequence: 'Reste à constituer, progression et date d’atteinte indisponibles',
      });
    }
    if (objectif.objectifTotal === null && objectif.type !== 'urgence') {
      inconnues.push({
        chemin: `objectifsEpargne[${objectif.id}].objectifTotal`,
        libelle: `Cible de « ${objectif.nom} »`,
        consequence: 'Aucune date d’atteinte projetée',
      });
    }
  }

  for (const revenu of config.revenus) {
    if (revenu.jour === null) {
      inconnues.push({
        chemin: `revenus[${revenu.id}].jour`,
        libelle: `Jour de versement — ${revenu.nom}`,
        consequence: 'Revenu exclu des encaissements à venir (hypothèse prudente)',
      });
    }
  }

  for (const charge of config.charges) {
    if (charge.jour === null) {
      inconnues.push({
        chemin: `charges[${charge.id}].jour`,
        libelle: `Jour de prélèvement — ${charge.nom}`,
        consequence: 'Charge comptée comme restant à décaisser (hypothèse prudente)',
      });
    }
    if (charge.moisExclus === undefined && charge.id === 'chg_impot') {
      inconnues.push({
        chemin: `charges[${charge.id}].moisExclus`,
        libelle: 'Impôt sur le revenu — calendrier exact (10 ou 12 mois)',
        consequence: 'Aucun mois d’exonération appliqué tant que le calendrier n’est pas confirmé',
      });
    }
  }

  for (const provision of config.provisions) {
    if (provision.prochaineEcheance === null) {
      inconnues.push({
        chemin: `provisions[${provision.id}].prochaineEcheance`,
        libelle: `Date d’échéance — ${provision.nom}`,
        consequence: 'Couverture indéterminée (jamais présumée suffisante)',
      });
    }
    if (provision.montantProvisionne === null) {
      inconnues.push({
        chemin: `provisions[${provision.id}].montantProvisionne`,
        libelle: `Montant déjà provisionné — ${provision.nom}`,
        consequence: 'Reste à provisionner et déficit indisponibles',
      });
    }
    if (provision.montantEstime) {
      inconnues.push({
        chemin: `provisions[${provision.id}].montantAnnuel`,
        libelle: `Montant annuel estimé — ${provision.nom}`,
        consequence: 'Dotation calculée sur une estimation, à réviser à réception de l’avis',
      });
    }
  }

  for (const echeance of config.echeancesExceptionnelles) {
    if (echeance.dateEcheance === null) {
      inconnues.push({
        chemin: `echeancesExceptionnelles[${echeance.id}].dateEcheance`,
        libelle: `Date d’échéance — ${echeance.nom}`,
        consequence: 'Aucun mois de rattachement présumé, scénarios datés non calculés',
      });
    }
    if (echeance.dejaProvisionne === null) {
      inconnues.push({
        chemin: `echeancesExceptionnelles[${echeance.id}].dejaProvisionne`,
        libelle: `Montant déjà mis de côté — ${echeance.nom}`,
        consequence: 'Reste à décaisser indisponible ; scénarios chiffrés sur une borne supérieure',
      });
    }
    if (echeance.montantEstime) {
      inconnues.push({
        chemin: `echeancesExceptionnelles[${echeance.id}].montant`,
        libelle: `Montant estimé — ${echeance.nom}`,
        consequence: 'Chiffrage indicatif tant que l’avis n’est pas reçu',
      });
    }
  }

  for (const credit of config.credits) {
    if (credit.capitalRestant === null) {
      inconnues.push({
        chemin: `credits[${credit.id}].capitalRestant`,
        libelle: `Capital restant dû — ${credit.nom}`,
        consequence: 'Aucun tableau d’amortissement ni intérêt calculé',
      });
    }
  }

  return inconnues;
}
