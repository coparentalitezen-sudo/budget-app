import { clampPositif, somme, type Cents } from './money.ts';
import { jourDuMois, periodeDe, type DateISO } from './periode.ts';
import type { Configuration, Transaction } from './types.ts';
import { situationEpargne, synthetiserMois } from './budget.ts';

/**
 * SÉPARATION STRICTE entre capacité budgétaire et trésorerie.
 *
 * `capaciteEpargneBudgetaire` dit ce que la structure du budget dégage.
 * `montantTransferableMaintenant` dit ce qu'on peut réellement virer aujourd'hui.
 * Une capacité théorique n'est PAS une autorisation de virement : si le solde
 * bancaire est inconnu, le montant transférable vaut `null`, jamais la capacité.
 */
export interface SituationVirement {
  objectifEpargne: Cents;
  capaciteEpargneBudgetaire: Cents;
  ecartObjectif: Cents;
  atteignable: boolean;
  /** `null` si la trésorerie réelle est inconnue. */
  montantTransferableMaintenant: Cents | null;
  /** `null` si le montant transférable est inconnu. Jamais 0 par défaut. */
  versementReel: Cents | null;
  /** Raisons pour lesquelles le montant transférable n'a pas pu être établi. */
  blocages: string[];
  detail: {
    soldeCourant: Cents | null;
    revenusDatesAVenir: Cents;
    chargesAVenir: Cents;
    provisionsAVenir: Cents;
    enveloppesRestantes: Cents;
    seuilSecurite: Cents;
    transactionsPending: Cents;
  };
}

export function situationVirement(
  config: Configuration,
  transactions: Transaction[],
  aujourdhui: DateISO,
): SituationVirement {
  const p = periodeDe(aujourdhui);
  const jour = jourDuMois(aujourdhui);
  const budget = situationEpargne(config, p);
  const mois = synthetiserMois(config, transactions, p);

  const compteCourant = config.comptes.find((c) => c.type === 'courant');
  const solde = compteCourant?.solde ?? null;

  const actif = (e: { debut?: string; fin?: string }) =>
    (!e.debut || p >= e.debut) && (!e.fin || p <= e.fin);

  // Seuls les revenus dont la date est CONFIRMÉE sont comptés comme à venir.
  const revenusDatesAVenir = somme(
    config.revenus
      .filter((r) => actif(r) && r.jour !== null && r.jour > jour)
      .map((r) => r.montant),
  );
  // Une charge sans jour confirmé est supposée encore à décaisser.
  const chargesAVenir = somme(
    config.charges.filter((c) => actif(c) && (c.jour === null || c.jour > jour)).map((c) => c.montant),
  );
  const provisionsAVenir = somme(
    config.provisions
      .filter((pr) => pr.jourDotation === null || pr.jourDotation > jour)
      .map((pr) => pr.dotationMensuelle),
  );
  const pending = somme(
    transactions
      .filter(
        (t) =>
          periodeDe(t.date) === p &&
          t.statut === 'pending' &&
          (t.type === 'depense' || t.type === 'facture'),
      )
      .map((t) => t.montant),
  );

  const enveloppesRestantes = clampPositif(mois.resteADepenser);
  const seuil = config.reglageTresorerie.seuilSecurite;

  const blocages: string[] = [];
  if (solde === null) blocages.push('Solde du compte courant inconnu');

  const detail = {
    soldeCourant: solde,
    revenusDatesAVenir,
    chargesAVenir,
    provisionsAVenir,
    enveloppesRestantes,
    seuilSecurite: seuil,
    transactionsPending: pending,
  };

  if (solde === null) {
    return {
      objectifEpargne: budget.objectifEpargne,
      capaciteEpargneBudgetaire: budget.capaciteEpargneBudgetaire,
      ecartObjectif: budget.ecartObjectif,
      atteignable: budget.atteignable,
      montantTransferableMaintenant: null,
      versementReel: null,
      blocages,
      detail,
    };
  }

  // Les dépenses `pending` sont déjà comptées dans `resteADepenser`
  // (synthetiserMois les inclut) : on ne les soustrait pas deux fois.
  const disponible =
    solde + revenusDatesAVenir - chargesAVenir - provisionsAVenir - enveloppesRestantes - seuil;
  const transferable = clampPositif(disponible);

  return {
    objectifEpargne: budget.objectifEpargne,
    capaciteEpargneBudgetaire: budget.capaciteEpargneBudgetaire,
    ecartObjectif: budget.ecartObjectif,
    atteignable: budget.atteignable,
    montantTransferableMaintenant: transferable,
    versementReel: Math.min(budget.versementBudgetaire, transferable),
    blocages,
    detail,
  };
}
