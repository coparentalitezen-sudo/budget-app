import { clampPositif, round, type Cents } from './money.ts';
import { ecartMois, periodeDe, type DateISO } from './periode.ts';
import type { Provision } from './types.ts';

/**
 * Dérive d'arrondi maximale de la mensualisation : au pire 1 centime par mois.
 * Ex. 1 600 € / 12 = 133,33 € → 12 dotations = 1 599,96 €, soit 4 centimes
 * manquants. On ne déclenche pas d'alerte pour cela ; la dernière dotation
 * avant l'échéance absorbe le reliquat.
 */
export const TOLERANCE_ARRONDI = 12;

export interface EtatProvision {
  provisionId: string;
  nom: string;
  montantAnnuel: Cents;
  montantEstime: boolean;
  /** `null` = solde du compte de provisions inconnu. */
  montantProvisionne: Cents | null;
  /** `null` tant que le montant déjà provisionné est inconnu. */
  restantAProvisionner: Cents | null;
  dotationMensuelle: Cents;
  /** `null` si la date d'échéance n'est pas confirmée. */
  prochaineEcheance: DateISO | null;
  moisAvantEcheance: number | null;
  /** Dotation requise pour couvrir l'échéance à temps. `null` si date inconnue. */
  dotationRequise: Cents | null;
  /** Manque prévisible au jour de l'échéance. `null` si date inconnue. */
  deficitPrevisionnel: Cents | null;
  /**
   * `true` couverte, `false` insuffisante, `null` indéterminable faute de date
   * d'échéance confirmée. Le `null` n'est jamais interprété comme `true`.
   */
  couverte: boolean | null;
}

/**
 * État d'une provision à une date donnée.
 * Le déficit prévisionnel est LE calcul important : il révèle les échéances
 * qui arrivent avant que la provision ait eu le temps de se constituer.
 */
export function etatProvision(provision: Provision, aujourdhui: DateISO): EtatProvision {
  const restant =
    provision.montantProvisionne === null
      ? null
      : clampPositif(provision.montantAnnuel - provision.montantProvisionne);

  const base: EtatProvision = {
    provisionId: provision.id,
    nom: provision.nom,
    montantAnnuel: provision.montantAnnuel,
    montantEstime: provision.montantEstime ?? false,
    montantProvisionne: provision.montantProvisionne,
    restantAProvisionner: restant,
    dotationMensuelle: provision.dotationMensuelle,
    prochaineEcheance: provision.prochaineEcheance,
    moisAvantEcheance: null,
    dotationRequise: null,
    deficitPrevisionnel: null,
    couverte: null,
  };

  // Deux inconnues possibles, traitées séparément : sans date d'échéance OU
  // sans montant déjà provisionné, la couverture reste indéterminée.
  if (provision.prochaineEcheance === null || provision.montantProvisionne === null) return base;

  const moisAvant = Math.max(
    0,
    ecartMois(periodeDe(aujourdhui), periodeDe(provision.prochaineEcheance)),
  );

  const provisionneALEcheance =
    provision.montantProvisionne + provision.dotationMensuelle * moisAvant;
  const deficit = clampPositif(provision.montantAnnuel - provisionneALEcheance);

  return {
    ...base,
    moisAvantEcheance: moisAvant,
    dotationRequise: moisAvant > 0 ? round(restant! / moisAvant) : restant!,
    deficitPrevisionnel: deficit,
    couverte: deficit <= TOLERANCE_ARRONDI,
  };
}

export function etatProvisions(
  provisions: Provision[],
  aujourdhui: DateISO,
): EtatProvision[] {
  return provisions.map((p) => etatProvision(p, aujourdhui));
}
