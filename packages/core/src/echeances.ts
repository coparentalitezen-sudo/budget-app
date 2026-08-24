import { clampPositif, formatEUR, somme, type Cents } from './money.ts';
import { ecartMois, periodeDe, type DateISO, type Periode } from './periode.ts';
import type { Configuration, EcheanceExceptionnelle } from './types.ts';
import { budgetVariableTotal, capaciteEpargne } from './budget.ts';

/**
 * Règle de calendrier de la mensualisation de la taxe foncière :
 * l'adhésion doit être demandée avant le 30 juin pour s'appliquer à
 * l'imposition de l'année en cours. Passée cette date, elle ne prend effet
 * qu'à partir de l'année suivante.
 *
 * Conséquence : au 23 août 2026, la mensualisation NE PEUT PLUS concerner la
 * taxe foncière 2026. Elle relève de la préparation des années futures et
 * n'est jamais présentée comme une solution de financement pour 2026.
 *
 * À vérifier auprès de la DGFiP avant toute démarche.
 */
export const DATE_LIMITE_MENSUALISATION = '30 juin';

export function mensualisationPossiblePour(annee: number, aujourdhui: DateISO): boolean {
  const anneeCourante = Number(aujourdhui.slice(0, 4));
  if (annee > anneeCourante) return true;
  if (annee < anneeCourante) return false;
  return aujourdhui.slice(5, 10) <= '06-30';
}

export type FaisabiliteScenario =
  | 'faisable'
  | 'insuffisant'
  /** Ressources réellement disponibles inconnues : ni oui, ni non. */
  | 'indetermine'
  /** Dépend d'un tiers (administration) : jamais promis par le moteur. */
  | 'a_verifier';

export interface ScenarioEcheance {
  id: string;
  libelle: string;
  faisabilite: FaisabiliteScenario;
  /** `null` = ressource inconnue. Jamais 0 par défaut. */
  montantMobilisable: Cents | null;
  /** `null` dès qu'une ressource du scénario est inconnue. */
  resteAFinancer: Cents | null;
  detail: string;
}

export interface AnalyseEcheance {
  echeanceId: string;
  nom: string;
  montant: Cents;
  montantEstime: boolean;
  dejaProvisionne: Cents | null;
  /** `null` si le montant déjà provisionné est inconnu. */
  resteADecaisser: Cents | null;
  /** Montant servant de base aux scénarios. */
  baseFinancement: Cents;
  /** true si la base est une borne supérieure faute de connaître le provisionné. */
  baseEstBorneSuperieure: boolean;
  dateEcheance: DateISO | null;
  moisAvantEcheance: number | null;
  note?: string;
  scenarios: ScenarioEcheance[];
}

/**
 * Analyse une échéance exceptionnelle et chiffre les moyens de la financer.
 *
 * Le moteur CHIFFRE, il ne décide pas. Et il ne comble aucune inconnue : une
 * épargne de solde inconnu donne `montantMobilisable: null`, pas `0 €`.
 */
export function analyserEcheance(
  config: Configuration,
  echeance: EcheanceExceptionnelle,
  aujourdhui: DateISO,
): AnalyseEcheance {
  const reste =
    echeance.dejaProvisionne === null
      ? null
      : clampPositif(echeance.montant - echeance.dejaProvisionne);
  const base = reste ?? echeance.montant;
  const baseEstBorne = reste === null;

  const periodeEcheance: Periode | null = echeance.dateEcheance
    ? periodeDe(echeance.dateEcheance)
    : null;
  const moisAvant = periodeEcheance
    ? Math.max(0, ecartMois(periodeDe(aujourdhui), periodeEcheance))
    : null;

  const scenarios: ScenarioEcheance[] = [];
  const mention = baseEstBorne
    ? ' Montant déjà mis de côté inconnu : le besoin réel peut être inférieur.'
    : '';

  /* 1. Puiser dans l'épargne déjà constituée --------------------- */
  const soldesInconnus = config.objectifsEpargne.some((o) => o.montantActuel === null);
  const epargneDisponible = soldesInconnus
    ? null
    : somme(config.objectifsEpargne.map((o) => o.montantActuel!));

  scenarios.push({
    id: 'epargne_disponible',
    libelle: 'Paiement depuis l’épargne existante',
    faisabilite:
      epargneDisponible === null
        ? 'indetermine'
        : epargneDisponible >= base
          ? 'faisable'
          : 'insuffisant',
    montantMobilisable: epargneDisponible,
    resteAFinancer: epargneDisponible === null ? null : clampPositif(base - epargneDisponible),
    detail:
      epargneDisponible === null
        ? 'Solde de l’épargne inconnu : impossible de dire si elle couvre l’échéance. ' +
          'Ce scénario ne peut être ni retenu ni écarté avant saisie des soldes réels.'
        : epargneDisponible >= base
          ? 'L’épargne constituée couvre l’échéance. Le fonds serait à reconstituer ensuite.'
          : `L’épargne constituée ne couvre pas l’échéance. Manque : ${formatEUR(base - epargneDisponible)}.${mention}`,
  });

  /* 2. Marge budgétaire du mois de l'échéance -------------------- */
  if (periodeEcheance) {
    const marge = capaciteEpargne(config, periodeEcheance);
    scenarios.push({
      id: 'marge_budgetaire_du_mois',
      libelle: 'Absorption par la marge budgétaire du mois d’échéance',
      faisabilite: marge >= base ? 'faisable' : 'insuffisant',
      montantMobilisable: Math.max(0, marge),
      resteAFinancer: clampPositif(base - Math.max(0, marge)),
      detail:
        `Marge budgétaire en ${periodeEcheance} : ${formatEUR(marge)}. ` +
        (marge >= base
          ? 'Le mois absorbe l’échéance.'
          : `Il manquerait ${formatEUR(base - Math.max(0, marge))} sur ce seul mois.${mention}`),
    });
  }

  /* 3. Compression temporaire des dépenses variables ------------- */
  const compressible = somme(
    config.budgetVariable
      .filter((l) => {
        const c = config.categories.find((x) => x.id === l.categorieId);
        return c?.criticite === 'non_essentielle' || c?.criticite === 'semi_essentielle';
      })
      .map((l) => l.montantPrevu),
  );
  scenarios.push({
    id: 'compression_variables',
    libelle: 'Compression temporaire des dépenses non essentielles',
    faisabilite:
      moisAvant === null
        ? 'indetermine'
        : compressible * moisAvant >= base
          ? 'faisable'
          : 'insuffisant',
    montantMobilisable: moisAvant === null ? null : compressible * moisAvant,
    resteAFinancer:
      moisAvant === null ? null : clampPositif(base - compressible * moisAvant),
    detail:
      `Enveloppes compressibles (semi- et non essentielles) : ${formatEUR(compressible)}/mois ` +
      `sur ${formatEUR(budgetVariableTotal(config))} de budget variable. ` +
      (moisAvant === null
        ? 'Nombre de mois disponibles inconnu faute de date d’échéance.'
        : `Sur ${moisAvant} mois : ${formatEUR(compressible * moisAvant)} mobilisables au maximum, ` +
          'ce qui suppose de supprimer intégralement restaurants, sorties, vêtements et achats plaisir.'),
  });

  /* 4. Délai ou étalement auprès de l'administration -------------- */
  scenarios.push({
    id: 'delai_administratif',
    libelle: 'Demande de délai ou d’étalement de paiement',
    faisabilite: 'a_verifier',
    montantMobilisable: null,
    resteAFinancer: null,
    detail:
      'Une demande de délai de paiement peut être déposée auprès du service des impôts ' +
      'des particuliers. L’octroi n’est pas automatique et dépend de la situation. ' +
      'À instruire directement auprès de l’administration.',
  });

  return {
    echeanceId: echeance.id,
    nom: echeance.nom,
    montant: echeance.montant,
    montantEstime: echeance.montantEstime ?? false,
    dejaProvisionne: echeance.dejaProvisionne,
    resteADecaisser: reste,
    baseFinancement: base,
    baseEstBorneSuperieure: baseEstBorne,
    dateEcheance: echeance.dateEcheance,
    moisAvantEcheance: moisAvant,
    note: echeance.note,
    scenarios,
  };
}

export function analyserEcheances(
  config: Configuration,
  aujourdhui: DateISO,
): AnalyseEcheance[] {
  return config.echeancesExceptionnelles.map((e) => analyserEcheance(config, e, aujourdhui));
}


