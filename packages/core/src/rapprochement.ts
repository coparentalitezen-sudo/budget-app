import type { Cents } from './money.ts';
import type { DateISO } from './periode.ts';
import type { Transaction, TypeTransaction } from './types.ts';

/**
 * Rapprochement bancaire : vérifier que les opérations enregistrées dans
 * l'application (importées ou saisies) reconstituent bien le solde imprimé
 * sur le relevé papier — pas seulement leur somme abstraite, mais le VRAI
 * solde d'UN compte donné, entre deux points de vérité datés.
 *
 * Fonction PURE, comme le reste du moteur : aucun calcul de solde ne doit
 * exister ailleurs (écran, script) sous peine de diverger silencieusement.
 */

/**
 * Une transaction porte toujours un montant POSITIF ; le sens dépend à la
 * fois de son `type` ET de si le compte rapproché en est la source
 * (`compteId`) ou la destination (`compteDestinationId`, virements et
 * versements réels). Exhaustif sur `TypeTransaction` : un type ajouté sans
 * mise à jour ici casse la compilation plutôt que de fausser un solde.
 */
function estCreditPourCompteSource(type: TypeTransaction): boolean {
  switch (type) {
    case 'revenu':
    case 'remboursement':
    case 'reprise_epargne':
      return true;
    case 'depense':
    case 'facture':
    case 'epargne':
    case 'transfert':
      return false;
  }
}

/**
 * Contribution signée d'une transaction sur le solde d'UN compte précis.
 * Renvoie 0 si la transaction ne concerne pas ce compte (ni comme source,
 * ni comme destination) — jamais devinée à partir du seul montant.
 */
export function contributionCompte(t: Transaction, compteId: string): Cents {
  let contribution = 0;
  if (t.compteId === compteId) {
    contribution += estCreditPourCompteSource(t.type) ? t.montant : -t.montant;
  }
  if (t.compteDestinationId === compteId) {
    // La destination d'un virement/versement reçoit toujours un crédit,
    // quel que soit le sens du type côté source.
    contribution += t.montant;
  }
  return contribution;
}

export interface LigneRapprochement {
  transaction: Transaction;
  /** Contribution signée sur LE compte rapproché (pas le montant brut). */
  contribution: Cents;
}

export interface Rapprochement {
  soldeDepart: Cents;
  dateDepart: DateISO;
  soldeCloture: Cents;
  dateCloture: DateISO;
  /** Opérations du compte sur l'intervalle [dateDepart, dateCloture], triées par date. */
  lignes: LigneRapprochement[];
  /** soldeDepart + somme de TOUTES les lignes (pointées ou non). */
  soldeAttendu: Cents;
  /** soldeCloture − soldeAttendu. Zéro = le relevé et l'application concordent exactement. */
  ecartTotal: Cents;
}

/**
 * Rapproche un compte entre deux relevés : le solde de départ, connu et
 * daté (imprimé en haut d'un relevé papier), et le solde de clôture à
 * vérifier (imprimé en bas). Les deux dates sont TOUJOURS fournies par
 * l'utilisateur depuis son relevé — jamais devinées depuis les
 * transactions elles-mêmes.
 */
export function rapprocherCompte(
  transactions: Transaction[],
  compteId: string,
  soldeDepart: Cents,
  dateDepart: DateISO,
  soldeCloture: Cents,
  dateCloture: DateISO,
): Rapprochement {
  const lignes: LigneRapprochement[] = transactions
    .filter(
      (t) =>
        (t.compteId === compteId || t.compteDestinationId === compteId) &&
        t.date >= dateDepart &&
        t.date <= dateCloture,
    )
    .map((t) => ({ transaction: t, contribution: contributionCompte(t, compteId) }))
    .sort((a, b) => (a.transaction.date < b.transaction.date ? -1 : 1));

  const soldeAttendu = soldeDepart + lignes.reduce((s, l) => s + l.contribution, 0);

  return {
    soldeDepart,
    dateDepart,
    soldeCloture,
    dateCloture,
    lignes,
    soldeAttendu,
    ecartTotal: soldeCloture - soldeAttendu,
  };
}
