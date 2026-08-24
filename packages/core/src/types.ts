import type { Cents } from './money.ts';
import type { DateISO, Periode } from './periode.ts';

/* ------------------------------------------------------------------ */
/* Transactions                                                        */
/* ------------------------------------------------------------------ */

export type TypeTransaction =
  | 'revenu'
  | 'depense'
  | 'facture'
  | 'remboursement'
  | 'epargne'
  | 'reprise_epargne'
  | 'transfert';

export type SourceTransaction =
  | 'manual'
  | 'csv_import'
  | 'pdf_import'
  | 'bank_api'
  | 'google_sheet_import';

export type StatutTransaction = 'pending' | 'validated';

export interface Transaction {
  id: string;
  date: DateISO;
  /** Toujours POSITIF. Le sens est porté par `type`. */
  montant: Cents;
  type: TypeTransaction;
  categorieId: string | null;
  compteId: string;
  compteDestinationId?: string | null; // transferts et provisions réelles
  description?: string;
  commercant?: string;
  source: SourceTransaction;
  statut: StatutTransaction;
}

/* ------------------------------------------------------------------ */
/* Catégories et budget                                                */
/* ------------------------------------------------------------------ */

/**
 * fixe      : charge récurrente contrainte (prêts, impôt)
 * variable  : enveloppe pilotable au quotidien (courses, essence...)
 * provision : dotation vers le compte de provisions (charge annuelle lissée)
 * epargne   : versement vers un objectif d'épargne
 */
export type NatureCategorie = 'fixe' | 'variable' | 'provision' | 'epargne';

export interface Categorie {
  id: string;
  nom: string;
  nature: NatureCategorie;
  /**
   * Criticité pour le calcul « N mois de dépenses essentielles » du fonds
   * d'urgence :
   * - `essentielle`      : à couvrir intégralement (santé, courses, énergie…)
   * - `semi_essentielle` : compressible mais pas supprimable (vêtements…)
   * - `non_essentielle`  : arrêtable en cas de coup dur (loisirs, plaisir)
   *
   * `undefined` = non classée : EXCLUE du calcul et signalée. On ne devine
   * jamais à la place de l'utilisateur ce qui est vital.
   */
  criticite?: 'essentielle' | 'semi_essentielle' | 'non_essentielle';
}

export interface LigneBudget {
  categorieId: string;
  montantPrevu: Cents;
}

/* ------------------------------------------------------------------ */
/* Revenus et charges récurrentes                                      */
/* ------------------------------------------------------------------ */

export interface RevenuRecurrent {
  id: string;
  nom: string;
  montant: Cents;
  /**
   * Jour du mois où le revenu tombe. `null` = non confirmé : la projection
   * de trésorerie l'exclut des encaissements à venir (hypothèse prudente).
   */
  jour: number | null;
  debut?: Periode;
  fin?: Periode; // incluse
}

export interface ChargeRecurrente {
  id: string;
  nom: string;
  montant: Cents;
  /**
   * Jour du prélèvement. `null` = non confirmé : la projection le compte
   * comme restant à décaisser (hypothèse prudente).
   */
  jour: number | null;
  categorieId: string;
  /**
   * Mois de l'année (1-12) où la charge N'EST PAS prélevée.
   * Ex. un impôt étalé sur 10 mois. `undefined` = prélevé les 12 mois.
   */
  moisExclus?: number[];
  debut?: Periode;
  /** Dernière période où la charge est prélevée (incluse). */
  fin?: Periode;
}

/* ------------------------------------------------------------------ */
/* Provisions annuelles                                                */
/* ------------------------------------------------------------------ */

export interface Provision {
  id: string;
  nom: string;
  montantAnnuel: Cents;
  /** true si le montant annuel est une estimation et non un montant facturé. */
  montantEstime?: boolean;
  /** Dotation mensuelle cible (par défaut montantAnnuel / 12). */
  dotationMensuelle: Cents;
  /**
   * Prochaine échéance de paiement réel.
   * `null` = date non confirmée : aucune couverture n'est calculée et le
   * paramètre est signalé, plutôt que d'inventer une date.
   */
  prochaineEcheance: DateISO | null;
  /** Déjà mis de côté sur le compte de provisions. `null` = inconnu. */
  montantProvisionne: Cents | null;
  /** Jour du mois du virement vers le compte de provisions. */
  jourDotation: number | null;
}

/* ------------------------------------------------------------------ */
/* Épargne                                                             */
/* ------------------------------------------------------------------ */

export interface ObjectifEpargne {
  id: string;
  nom: string;
  type: 'urgence' | 'vacances' | 'autre';
  objectifTotal: Cents | null;
  /**
   * Solde réellement constitué. `null` = INCONNU, jamais 0.
   * Un fonds d'urgence dont le solde est inconnu n'est pas un fonds vide :
   * la différence est décisive pour tout scénario de financement.
   */
  montantActuel: Cents | null;
  /** Poids de répartition du versement mensuel global. */
  versementMensuelCible: Cents;
  priorite: number;
}

export interface ReglageEpargne {
  /**
   * Objectif d'épargne THÉORIQUE. Il ne doit jamais être abaissé
   * automatiquement parce que la capacité calculée est insuffisante :
   * c'est l'écart entre les deux qui porte l'information utile.
   */
  objectif: Cents;
  /**
   * Plafonds de versement saisis MANUELLEMENT par l'utilisateur.
   * Ils limitent le virement réel, jamais l'objectif affiché.
   */
  plafondsManuels: { debut: Periode; fin: Periode; montant: Cents }[];
}

/* ------------------------------------------------------------------ */
/* Crédits                                                             */
/* ------------------------------------------------------------------ */

export interface Credit {
  id: string;
  nom: string;
  organisme?: string;
  capitalInitial?: Cents;
  capitalRestant: Cents;
  /** Mensualité HORS assurance. */
  mensualite: Cents;
  assuranceMensuelle?: Cents;
  /** Taux annuel nominal, ex. 0.0593 pour 5,93 %. */
  tauxAnnuel: number;
  dateDebut?: DateISO;
  /** Date de fin contractuelle déclarée par l'utilisateur. */
  dateFinPrevue?: DateISO;
}

/* ------------------------------------------------------------------ */
/* Échéances exceptionnelles (dettes ponctuelles, non lissables)        */
/* ------------------------------------------------------------------ */

/**
 * Une somme à payer qui n'a PAS pu être provisionnée à temps.
 * Volontairement distincte de `Provision` : une provision se constitue
 * pour l'avenir, une échéance exceptionnelle doit être financée maintenant.
 * Les confondre reviendrait à afficher une dotation mensuelle irréaliste.
 */
export interface EcheanceExceptionnelle {
  id: string;
  nom: string;
  montant: Cents;
  montantEstime?: boolean;
  dateEcheance: DateISO | null;
  /** Somme déjà mise de côté pour cette échéance précise. `null` = inconnu. */
  dejaProvisionne: Cents | null;
  /** Contexte à afficher tel quel (contraintes de calendrier, démarches…). */
  note?: string;
}

/* ------------------------------------------------------------------ */
/* Comptes                                                             */
/* ------------------------------------------------------------------ */

export interface Compte {
  id: string;
  nom: string;
  type: 'courant' | 'provisions' | 'epargne';
  /** `null` = solde non encore renseigné. Aucune projection n'est produite. */
  solde: Cents | null;
}

/* ------------------------------------------------------------------ */
/* Configuration globale du foyer                                      */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Fonds d'urgence : cible configurable                                */
/* ------------------------------------------------------------------ */

export type ReglageFondUrgence =
  /** N mois de dépenses essentielles (charges fixes + provisions + enveloppes essentielles). */
  | {
      mode: 'depenses_essentielles';
      nombreDeMois: number;
      periodeReference?: Periode;
      /** Inclure aussi les enveloppes semi-essentielles. Défaut : false. */
      inclureSemiEssentielles?: boolean;
    }
  /** N mois de revenus réguliers. */
  | { mode: 'revenus'; nombreDeMois: number; periodeReference?: Periode }
  /** Montant saisi à la main. */
  | { mode: 'manuel'; montant: Cents };

/**
 * Seuil de sécurité laissé sur le compte courant : aucun virement d'épargne
 * ne doit descendre le solde en dessous. `null` = non paramétré.
 */
export interface ReglageTresorerie {
  seuilSecurite: Cents;
}

export interface Configuration {
  comptes: Compte[];
  categories: Categorie[];
  revenus: RevenuRecurrent[];
  charges: ChargeRecurrente[];
  provisions: Provision[];
  echeancesExceptionnelles: EcheanceExceptionnelle[];
  objectifsEpargne: ObjectifEpargne[];
  reglageEpargne: ReglageEpargne;
  credits: Credit[];
  /** Enveloppes variables cibles. */
  budgetVariable: LigneBudget[];
  /** Mode de calcul de la cible du fonds d'urgence. */
  reglageFondUrgence: ReglageFondUrgence;
  reglageTresorerie: ReglageTresorerie;
  /**
   * Paramètres explicitement non confirmés. Remontés en alertes `info`
   * pour qu'aucune inconnue ne reste invisible.
   */
  parametresAConfirmer: string[];
}
