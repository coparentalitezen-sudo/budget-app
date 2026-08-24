import { repartir, type Cents } from './money.ts';
import { ajouterMois, finDeMois, type Periode } from './periode.ts';
import type { Configuration, ObjectifEpargne } from './types.ts';
import { situationEpargne } from './budget.ts';
import { resoudreObjectifs } from './fondUrgence.ts';

export interface RepartitionEpargne {
  objectifId: string;
  nom: string;
  montant: Cents;
}

/**
 * Répartit le versement mensuel entre les objectifs, au prorata de leur
 * versement cible (150 / 50 -> 75 % / 25 %), sans perte de centime.
 */
export function repartirVersement(
  objectifs: ObjectifEpargne[],
  montantTotal: Cents,
): RepartitionEpargne[] {
  const actifs = [...objectifs].sort((a, b) => a.priorite - b.priorite);
  const parts = repartir(
    montantTotal,
    actifs.map((o) => o.versementMensuelCible),
  );
  return actifs.map((o, i) => ({ objectifId: o.id, nom: o.nom, montant: parts[i] }));
}

/** Répartition de l'OBJECTIF théorique (150 / 50 sur 200 €). */
export function repartitionObjectif(
  config: Configuration,
  p: Periode,
): RepartitionEpargne[] {
  return repartirVersement(config.objectifsEpargne, situationEpargne(config, p).objectifEpargne);
}

/**
 * Répartition du versement RÉELLEMENT exécutable ce mois-ci.
 * Distincte de l'objectif : en septembre 2026, l'objectif reste 200 €
 * mais seuls 10,79 € peuvent être virés.
 */
export function repartitionDuMois(
  config: Configuration,
  p: Periode,
): RepartitionEpargne[] {
  return repartirVersement(config.objectifsEpargne, situationEpargne(config, p).versementBudgetaire);
}

export interface ProjectionObjectif {
  objectifId: string;
  nom: string;
  /** `null` = solde réel inconnu. Ce n'est PAS 0 €. */
  montantActuel: Cents | null;
  objectifTotal: Cents | null;
  /** `null` tant que le solde actuel est inconnu. */
  restantAConstituer: Cents | null;
  /** `null` tant que le solde actuel est inconnu. */
  progression: number | null;
  moisRestants: number | null;
  dateAtteinte: string | null;
}

/**
 * Date prévisionnelle d'atteinte d'un objectif.
 * Hypothèse explicite : versement mensuel constant, aucun intérêt capitalisé.
 * (Les intérêts d'un Livret A ne sont PAS modélisés : ils rendraient la
 * projection optimiste, ce qui est le mauvais sens de l'erreur.)
 */
export function projeterObjectif(
  objectif: ObjectifEpargne,
  versementMensuel: Cents,
  periodeDepart: Periode,
): ProjectionObjectif {
  const base: ProjectionObjectif = {
    objectifId: objectif.id,
    nom: objectif.nom,
    montantActuel: objectif.montantActuel,
    objectifTotal: objectif.objectifTotal,
    restantAConstituer: null,
    progression: null,
    moisRestants: null,
    dateAtteinte: null,
  };

  if (objectif.objectifTotal === null || objectif.objectifTotal <= 0) return base;

  // Solde inconnu : on connaît la cible, mais ni le reste à constituer,
  // ni la progression, ni la date d'atteinte. Aucun de ces champs ne doit
  // être rempli en supposant un solde de 0 €.
  if (objectif.montantActuel === null) return base;

  const restant = objectif.objectifTotal - objectif.montantActuel;
  base.restantAConstituer = restant > 0 ? restant : 0;
  base.progression = Math.min(1, objectif.montantActuel / objectif.objectifTotal);

  if (restant <= 0) {
    base.moisRestants = 0;
    base.dateAtteinte = finDeMois(periodeDepart);
    return base;
  }

  if (versementMensuel <= 0) return base; // jamais atteint au rythme actuel

  const mois = Math.ceil(restant / versementMensuel);
  base.moisRestants = mois;
  base.dateAtteinte = finDeMois(ajouterMois(periodeDepart, mois - 1));
  return base;
}

export function projeterTousLesObjectifs(
  config: Configuration,
  p: Periode,
): ProjectionObjectif[] {
  const repartition = repartitionDuMois(config, p);
  // La cible du fonds d'urgence est résolue dynamiquement, jamais figée.
  return resoudreObjectifs(config, p).map((o) => {
    const versement = repartition.find((r) => r.objectifId === o.id)?.montant ?? 0;
    return projeterObjectif(o, versement, p);
  });
}
