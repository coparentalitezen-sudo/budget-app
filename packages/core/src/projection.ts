import { somme, round, type Cents } from './money.ts';
import { jourDuMois, joursRestantsMois, periodeDe, type DateISO } from './periode.ts';
import type { Configuration, Transaction } from './types.ts';
import { situationEpargne, synthetiserMois } from './budget.ts';

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
 * Projection du solde du compte courant à la fin du mois.
 *
 * Hypothèses explicites :
 * - un flux récurrent dont le `jour` est déjà passé est considéré comme
 *   exécuté (le rapprochement bancaire mensuel corrige cet écart) ;
 * - un flux dont le jour n'est PAS confirmé (`jour: null`) est traité
 *   prudemment : un revenu est supposé déjà encaissé (donc aucune rentrée
 *   à venir n'est promise), une charge est supposée encore à décaisser.
 *   L'erreur penche toujours du côté défavorable.
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
  const soldeActuel = compteCourant?.solde ?? null;

  const fluxNonDates = [
    ...config.revenus.filter((r) => r.jour === null).map((r) => r.nom),
    ...config.charges.filter((c) => c.jour === null).map((c) => c.nom),
    ...config.provisions.filter((pr) => pr.jourDotation === null).map((pr) => pr.nom),
  ];

  const actif = (e: { debut?: string; fin?: string }) =>
    (!e.debut || p >= e.debut) && (!e.fin || p <= e.fin);

  // Revenu sans jour confirmé -> supposé déjà encaissé (prudent).
  const revenusAVenir = somme(
    config.revenus.filter((r) => actif(r) && r.jour !== null && r.jour > jour).map((r) => r.montant),
  );
  // Charge sans jour confirmé -> supposée encore à décaisser (prudent).
  const chargesAVenir = somme(
    config.charges
      .filter((c) => actif(c) && (c.jour === null || c.jour > jour))
      .map((c) => c.montant),
  );
  const provisionsAVenir = somme(
    config.provisions
      .filter((pr) => pr.jourDotation === null || pr.jourDotation > jour)
      .map((pr) => pr.dotationMensuelle),
  );

  const mois = synthetiserMois(config, transactions, p);
  // On projette le versement RÉELLEMENT exécutable, pas l'objectif théorique :
  // projeter 200 € alors que le budget n'en dégage que 10,79 € produirait un
  // faux découvert et masquerait la vraie information (l'écart à l'objectif).
  const epargneAVenir = Math.max(
    0,
    situationEpargne(config, p).versementBudgetaire - mois.epargneRealisee,
  );

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
