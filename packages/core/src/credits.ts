import { round, type Cents } from './money.ts';
import type { Credit } from './types.ts';

const tauxMensuel = (tauxAnnuel: number) => tauxAnnuel / 12;

export interface Echeance {
  numero: number;
  mensualite: Cents;
  partInterets: Cents;
  partCapital: Cents;
  capitalRestant: Cents;
}

/**
 * Tableau d'amortissement à partir du capital restant dû.
 * La dernière échéance est ajustée pour solder exactement le capital.
 * Garde-fou : si la mensualité ne couvre pas les intérêts, on lève une erreur
 * plutôt que de boucler à l'infini.
 */
export function tableauAmortissement(credit: Credit, maxEcheances = 600): Echeance[] {
  const r = tauxMensuel(credit.tauxAnnuel);
  let capital = credit.capitalRestant;

  if (capital > 0 && credit.mensualite <= round(capital * r)) {
    throw new Error(
      `Crédit "${credit.nom}" : la mensualité ne couvre pas les intérêts mensuels. ` +
        `Vérifiez le taux, le capital restant ou la part assurance.`,
    );
  }

  const echeances: Echeance[] = [];
  let n = 0;

  while (capital > 0 && n < maxEcheances) {
    n += 1;
    const interets = round(capital * r);
    let capitalRembourse = credit.mensualite - interets;
    let mensualite = credit.mensualite;

    if (capitalRembourse >= capital) {
      capitalRembourse = capital;
      mensualite = capital + interets; // dernière échéance ajustée
    }

    capital -= capitalRembourse;
    echeances.push({
      numero: n,
      mensualite,
      partInterets: interets,
      partCapital: capitalRembourse,
      capitalRestant: capital,
    });
  }

  return echeances;
}

export interface SyntheseCredit {
  creditId: string;
  nom: string;
  capitalRestant: Cents;
  mensualite: Cents;
  echeancesRestantes: number;
  interetsRestants: Cents;
  coutTotalRestant: Cents;
  /** Part du crédit déjà remboursée, si le capital initial est connu. */
  progression: number | null;
}

export function synthetiserCredit(credit: Credit): SyntheseCredit {
  const tableau = tableauAmortissement(credit);
  const interets = tableau.reduce((a, e) => a + e.partInterets, 0);
  const total = tableau.reduce((a, e) => a + e.mensualite, 0);

  return {
    creditId: credit.id,
    nom: credit.nom,
    capitalRestant: credit.capitalRestant,
    mensualite: credit.mensualite,
    echeancesRestantes: tableau.length,
    interetsRestants: interets,
    coutTotalRestant: total,
    progression:
      credit.capitalInitial && credit.capitalInitial > 0
        ? 1 - credit.capitalRestant / credit.capitalInitial
        : null,
  };
}

export interface SimulationRemboursement {
  echeancesInitiales: number;
  echeancesSimulees: number;
  moisGagnes: number;
  interetsInitiaux: Cents;
  interetsSimules: Cents;
  economieInterets: Cents;
}

/**
 * Simule un remboursement anticipé : versement exceptionnel immédiat
 * et/ou mensualité supplémentaire récurrente.
 * Note : les indemnités de remboursement anticipé (IRA) ne sont PAS
 * modélisées ici — elles dépendent du contrat et doivent être saisies à part.
 */
export function simulerRemboursementAnticipe(
  credit: Credit,
  options: { versementImmediat?: Cents; mensualiteSupplementaire?: Cents },
): SimulationRemboursement {
  const initial = synthetiserCredit(credit);

  const creditSimule: Credit = {
    ...credit,
    capitalRestant: Math.max(0, credit.capitalRestant - (options.versementImmediat ?? 0)),
    mensualite: credit.mensualite + (options.mensualiteSupplementaire ?? 0),
  };

  const simule =
    creditSimule.capitalRestant === 0
      ? { echeancesRestantes: 0, interetsRestants: 0 }
      : synthetiserCredit(creditSimule);

  return {
    echeancesInitiales: initial.echeancesRestantes,
    echeancesSimulees: simule.echeancesRestantes,
    moisGagnes: initial.echeancesRestantes - simule.echeancesRestantes,
    interetsInitiaux: initial.interetsRestants,
    interetsSimules: simule.interetsRestants,
    economieInterets: initial.interetsRestants - simule.interetsRestants,
  };
}
