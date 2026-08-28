import { somme, round, type Cents } from './money.ts';
import { jourDuMois, joursRestantsMois, periodeDe, type DateISO } from './periode.ts';
import type { Compte, Configuration, Transaction } from './types.ts';
import { situationEpargne, synthetiserMois } from './budget.ts';
import { calculerSoldeTheorique, type SoldeCompte } from './rapprochement.ts';

export interface LigneRecurrente {
  nom: string;
  montant: Cents;
}

interface RecurrentsAVenir {
  revenusAVenir: Cents;
  chargesAVenir: Cents;
  provisionsAVenir: Cents;
  epargneAVenir: Cents;
  /** Détail nominatif, pour l'affichage (« qu'est-ce qui compte, exactement ? »). */
  revenusAVenirDetail: LigneRecurrente[];
  chargesAVenirDetail: LigneRecurrente[];
  provisionsAVenirDetail: LigneRecurrente[];
  /** Flux dont le jour de valeur n'est pas confirmé (traités prudemment). */
  fluxNonDates: string[];
}

/**
 * Opérations récurrentes (revenus, charges, provisions, épargne) attendues
 * d'ici la fin du mois — utilisé à la fois par `projeterSolde` et par
 * `projeterSoldeTheorique`, pour que les deux ne divergent jamais sur ce
 * qui compte comme « à venir ».
 *
 * Hypothèses explicites :
 * - un flux récurrent dont le `jour` est déjà passé est considéré comme
 *   exécuté (le rapprochement bancaire mensuel corrige cet écart) ;
 * - un flux dont le jour n'est PAS confirmé (`jour: null`) est traité
 *   prudemment : un revenu est supposé déjà encaissé (donc aucune rentrée
 *   à venir n'est promise), une charge est supposée encore à décaisser.
 *   L'erreur penche toujours du côté défavorable.
 */
function calculerRecurrentsAVenir(
  config: Configuration,
  transactions: Transaction[],
  aujourdhui: DateISO,
): RecurrentsAVenir {
  const p = periodeDe(aujourdhui);
  const jour = jourDuMois(aujourdhui);

  const fluxNonDates = [
    ...config.revenus.filter((r) => r.jour === null).map((r) => r.nom),
    ...config.charges.filter((c) => c.jour === null).map((c) => c.nom),
    ...config.provisions.filter((pr) => pr.jourDotation === null).map((pr) => pr.nom),
  ];

  const actif = (e: { debut?: string; fin?: string }) =>
    (!e.debut || p >= e.debut) && (!e.fin || p <= e.fin);

  // Revenu sans jour confirmé -> supposé déjà encaissé (prudent).
  const revenusEchus = config.revenus.filter((r) => actif(r) && r.jour !== null && r.jour > jour);
  // Charge sans jour confirmé -> supposée encore à décaisser (prudent).
  const chargesEchues = config.charges.filter(
    (c) => actif(c) && (c.jour === null || c.jour > jour),
  );
  const provisionsEchues = config.provisions.filter(
    (pr) => pr.jourDotation === null || pr.jourDotation > jour,
  );

  const revenusAVenirDetail = revenusEchus.map((r) => ({ nom: r.nom, montant: r.montant }));
  const chargesAVenirDetail = chargesEchues.map((c) => ({ nom: c.nom, montant: c.montant }));
  const provisionsAVenirDetail = provisionsEchues.map((pr) => ({ nom: pr.nom, montant: pr.dotationMensuelle }));

  const revenusAVenir = somme(revenusEchus.map((r) => r.montant));
  const chargesAVenir = somme(chargesEchues.map((c) => c.montant));
  const provisionsAVenir = somme(provisionsEchues.map((pr) => pr.dotationMensuelle));

  const mois = synthetiserMois(config, transactions, p);
  // On projette le versement RÉELLEMENT exécutable, pas l'objectif théorique :
  // projeter 200 € alors que le budget n'en dégage que 10,79 € produirait un
  // faux découvert et masquerait la vraie information (l'écart à l'objectif).
  const epargneAVenir = Math.max(
    0,
    situationEpargne(config, p).versementBudgetaire - mois.epargneRealisee,
  );

  return {
    revenusAVenir, chargesAVenir, provisionsAVenir, epargneAVenir,
    revenusAVenirDetail, chargesAVenirDetail, provisionsAVenirDetail,
    fluxNonDates,
  };
}

export interface ProjectionSolde {
  /** `null` si le solde du compte courant n'est pas renseigné. */
  soldeActuel: Cents | null;
  revenusAVenir: Cents;
  chargesAVenir: Cents;
  provisionsAVenir: Cents;
  epargneAVenir: Cents;
  /** Hypothèse prudente : toutes les enveloppes variables sont consommées. */
  soldeProjetePrudent: Cents | null;
  /** Hypothèse tendancielle : le rythme de dépense actuel se poursuit. */
  soldeProjeteTendanciel: Cents | null;
  rythmeQuotidienConstate: Cents;
  /** Flux dont le jour de valeur n'est pas confirmé (traités prudemment). */
  fluxNonDates: string[];
}

/**
 * Risque de découvert à fin de mois, sous deux hypothèses de dépense
 * variable — sert uniquement à `genererAlertes` (voir `alertes.ts`).
 *
 * Part du solde THÉORIQUE (relevé + opérations non pointées), pas du seul
 * solde du relevé : sans ça, toute opération saisie mais pas encore
 * retrouvée sur un relevé serait invisible de la projection, faisant
 * diverger l'alerte de risque de découvert de la réalité déjà connue de
 * l'application.
 */
export function projeterSolde(
  config: Configuration,
  transactions: Transaction[],
  aujourdhui: DateISO,
): ProjectionSolde {
  const p = periodeDe(aujourdhui);
  const jour = jourDuMois(aujourdhui);
  const jrMois = joursRestantsMois(aujourdhui);
  const joursEcoules = jour;

  const compteCourant = config.comptes.find((c) => c.type === 'courant');
  const soldeActuel = compteCourant ? calculerSoldeTheorique(transactions, compteCourant).soldeTheorique : null;

  const { revenusAVenir, chargesAVenir, provisionsAVenir, epargneAVenir, fluxNonDates } =
    calculerRecurrentsAVenir(config, transactions, aujourdhui);

  const mois = synthetiserMois(config, transactions, p);
  const rythme = joursEcoules > 0 ? round(mois.depensesVariables / joursEcoules) : 0;
  const variablesAVenirTendanciel = rythme * jrMois;
  const variablesAVenirPrudent = Math.max(0, mois.resteADepenser);

  // Sans solde de départ, aucune projection n'est produite : afficher un
  // chiffre calculé sur un solde supposé nul serait trompeur.
  const socle =
    soldeActuel === null
      ? null
      : soldeActuel + revenusAVenir - chargesAVenir - provisionsAVenir - epargneAVenir;

  return {
    soldeActuel,
    revenusAVenir,
    chargesAVenir,
    provisionsAVenir,
    epargneAVenir,
    soldeProjetePrudent: socle === null ? null : socle - variablesAVenirPrudent,
    soldeProjeteTendanciel: socle === null ? null : socle - variablesAVenirTendanciel,
    rythmeQuotidienConstate: rythme,
    fluxNonDates,
  };
}

export interface SoldeTheoriqueProjete extends SoldeCompte {
  revenusAVenir: Cents;
  chargesAVenir: Cents;
  provisionsAVenir: Cents;
  epargneAVenir: Cents;
  revenusAVenirDetail: LigneRecurrente[];
  chargesAVenirDetail: LigneRecurrente[];
  provisionsAVenirDetail: LigneRecurrente[];
  /** Flux dont le jour de valeur n'est pas confirmé (traités prudemment). */
  fluxNonDates: string[];
}

/**
 * Solde théorique du compte courant, enrichi des opérations RÉCURRENTES
 * encore attendues d'ici la fin du mois (revenus, charges, provisions,
 * épargne — jamais les dépenses variables, trop incertaines pour être
 * comptées comme un fait). `soldeTheorique` porte donc :
 *
 *   solde du relevé + opérations non pointées + récurrentes à venir.
 *
 * Volontairement UNE seule valeur, pas deux hypothèses : le prochain relevé
 * importé révèle de lui-même l'écart via le rapprochement bancaire, aucun
 * besoin d'un second chiffre « prudent »/« tendanciel » ici.
 */
export function projeterSoldeTheorique(
  config: Configuration,
  transactions: Transaction[],
  compte: Compte,
  aujourdhui: DateISO,
): SoldeTheoriqueProjete {
  const base = calculerSoldeTheorique(transactions, compte);
  const recurrents = calculerRecurrentsAVenir(config, transactions, aujourdhui);
  const { revenusAVenir, chargesAVenir, provisionsAVenir, epargneAVenir } = recurrents;

  return {
    ...base,
    ...recurrents,
    soldeTheorique:
      base.soldeTheorique === null
        ? null
        : base.soldeTheorique + revenusAVenir - chargesAVenir - provisionsAVenir - epargneAVenir,
  };
}
