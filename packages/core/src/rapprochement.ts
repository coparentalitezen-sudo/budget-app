import type { Cents } from './money.ts';
import type { DateISO } from './periode.ts';
import type { Compte, Transaction, TypeTransaction } from './types.ts';

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

/* ------------------------------------------------------------------ */
/* Solde réel / solde théorique                                        */
/* ------------------------------------------------------------------ */

export interface SoldeCompte {
  /** Constaté sur le relevé — `null` tant qu'aucun relevé n'a été importé. */
  soldeReel: Cents | null;
  soldeReelDate: DateISO | null;
  /**
   * solde réel + somme algébrique des opérations NON POINTÉES du compte.
   * `null` dès que `soldeReel` est `null` : jamais remplacé par une valeur
   * recalculée à partir des seules transactions, qui ne serait qu'une
   * hypothèse, pas un fait constaté.
   */
  soldeTheorique: Cents | null;
  /** Détail des opérations non pointées, pour affichage. */
  operationsNonPointees: LigneRapprochement[];
  /** Somme algébrique des `operationsNonPointees` — `soldeTheorique - soldeReel`. */
  ecartNonPointe: Cents;
  /**
   * Opérations non pointées datées d'AVANT le relevé : NON comptées. Le
   * solde réel les inclut déjà (ou la banque ne les a jamais vues) — les
   * ajouter les compterait deux fois. Listées pour être pointées ou
   * corrigées, jamais perdues de vue.
   */
  operationsAnterieuresAuReleve: LigneRapprochement[];
  /**
   * Doublons probables parmi les `operationsNonPointees` : même date, même
   * effet sur le compte, libellé proche d'une autre opération du compte.
   * Seulement SIGNALÉS, toujours comptés : deux achats identiques le même
   * jour peuvent être réels, seul l'utilisateur tranche.
   */
  doublonsProbables: DoublonProbable[];
}

export interface DoublonProbable {
  /** L'opération non pointée comptée dans le solde théorique. */
  operation: Transaction;
  /** L'opération du compte (pointée ou non) qu'elle semble répéter. */
  jumelle: Transaction;
}

/**
 * Solde théorique d'un compte = solde réel (relevé) + opérations saisies
 * dans l'application mais pas encore retrouvées sur un relevé importé.
 * Une dépense non pointée le diminue, un revenu non pointé l'augmente —
 * exactement la même contribution signée que pour un rapprochement complet
 * (`contributionCompte`), appliquée seulement au sous-ensemble non pointé.
 */
export function calculerSoldeTheorique(transactions: Transaction[], compte: Compte): SoldeCompte {
  if (compte.solde === null) {
    return {
      soldeReel: null,
      soldeReelDate: compte.soldeDate ?? null,
      soldeTheorique: null,
      operationsNonPointees: [],
      ecartNonPointe: 0,
      operationsAnterieuresAuReleve: [],
      doublonsProbables: [],
    };
  }

  const duCompte = transactions.filter(
    (t) => t.compteId === compte.id || t.compteDestinationId === compte.id,
  );
  const nonPointees = duCompte
    .filter((t) => t.pointage === 'unpointed')
    .map((t) => ({ transaction: t, contribution: contributionCompte(t, compte.id) }))
    .sort((a, b) => (a.transaction.date < b.transaction.date ? -1 : 1));

  // Strictement avant : une opération datée du jour même du relevé peut
  // en être absente (arrêté en cours de journée), elle reste comptée.
  const dateReleve = compte.soldeDate ?? null;
  const estAnterieure = (l: LigneRapprochement) => dateReleve !== null && l.transaction.date < dateReleve;
  const operationsNonPointees = nonPointees.filter((l) => !estAnterieure(l));
  const operationsAnterieuresAuReleve = nonPointees.filter(estAnterieure);

  const ecartNonPointe = operationsNonPointees.reduce((s, l) => s + l.contribution, 0);

  return {
    soldeReel: compte.solde,
    soldeReelDate: dateReleve,
    soldeTheorique: compte.solde + ecartNonPointe,
    operationsNonPointees,
    ecartNonPointe,
    operationsAnterieuresAuReleve,
    doublonsProbables: detecterDoublonsProbables(operationsNonPointees, duCompte, compte.id),
  };
}

/**
 * Part des mots du libellé le plus court retrouvés dans l'autre : une
 * saisie manuelle (« Salaire ») face au libellé bancaire complet
 * (« VIR SEPA RECU SALAIRE GROUPE ») vaut 1, là où le coefficient de Dice
 * la noierait sous les mots propres à la banque. Réservé aux doublons, où
 * la date et le montant identiques font déjà l'essentiel du tri.
 */
function recouvrementLibelle(a: string, b: string): number {
  const motsA = new Set(normaliserLibelle(a).split(' ').filter((m) => m.length >= 3));
  const motsB = new Set(normaliserLibelle(b).split(' ').filter((m) => m.length >= 3));
  if (motsA.size === 0 || motsB.size === 0) return 0;
  let communs = 0;
  for (const m of motsA) if (motsB.has(m)) communs++;
  return communs / Math.min(motsA.size, motsB.size);
}

/** Recouvrement minimal de libellé pour présumer un doublon. */
const SEUIL_DOUBLON = 0.5;

/**
 * Une opération comptée est un doublon probable d'une autre opération du
 * même compte si elles tombent le même jour, ont exactement le même effet
 * sur le compte et des libellés proches. Une paire de deux opérations
 * comptées n'est signalée qu'une fois.
 */
function detecterDoublonsProbables(
  comptees: LigneRapprochement[],
  duCompte: Transaction[],
  compteId: string,
): DoublonProbable[] {
  const doublons: DoublonProbable[] = [];
  const dejaSignalees = new Set<string>();
  for (const { transaction: op, contribution } of comptees) {
    for (const autre of duCompte) {
      if (autre.id === op.id || autre.date !== op.date) continue;
      if (contributionCompte(autre, compteId) !== contribution) continue;
      const cle = [op.id, autre.id].sort().join('|');
      if (dejaSignalees.has(cle)) continue;
      const score = recouvrementLibelle(op.commercant ?? op.description ?? '', autre.commercant ?? autre.description ?? '');
      if (score < SEUIL_DOUBLON) continue;
      dejaSignalees.add(cle);
      doublons.push({ operation: op, jumelle: autre });
    }
  }
  return doublons;
}

/* ------------------------------------------------------------------ */
/* Appariement automatique à l'import                                  */
/* ------------------------------------------------------------------ */

/** Ce qu'on connaît d'une opération lue dans un relevé, avant décision. */
export interface OperationImportee {
  date: DateISO;
  /** Toujours POSITIF, comme `Transaction.montant`. */
  montant: Cents;
  type: TypeTransaction;
  compteId: string;
  /** Commerçant nettoyé, ou description brute — sert à la similarité textuelle. */
  libelle: string;
}

export interface CandidatRapprochement {
  transaction: Transaction;
  /** 0 (aucune ressemblance) à 1 (quasi certain). */
  confiance: number;
}

export type DecisionAppariement = 'rapprocher' | 'ambigu' | 'nouvelle';

export interface ResultatAppariement {
  decision: DecisionAppariement;
  /** Le meilleur candidat, si `decision` est `rapprocher` ou `ambigu`. */
  meilleur: CandidatRapprochement | null;
  /** Les autres candidats retenus (montant/compte/type/date exacts ou proches), pour diagnostic. */
  autresCandidats: CandidatRapprochement[];
}

/** Écart en jours entiers entre deux dates ISO, sans dépendance au fuseau. */
function ecartJours(a: DateISO, b: DateISO): number {
  const t = (d: DateISO) => Date.UTC(...(d.split('-').map(Number) as [number, number, number]));
  return Math.abs(t(a) - t(b)) / 86_400_000;
}

/** Normalise pour comparer un libellé sans accents, casse ni ponctuation. */
function normaliserLibelle(texte: string): string {
  return texte
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

/**
 * Similarité de deux libellés par recouvrement de mots (coefficient de
 * Dice) : robuste aux références/dates qui changent d'une occurrence à
 * l'autre du même commerçant, sans dépendance externe. 0 si l'un des deux
 * libellés n'a aucun mot significatif (jamais une similarité par défaut).
 */
function similariteLibelle(a: string, b: string): number {
  const motsA = new Set(normaliserLibelle(a).split(' ').filter((m) => m.length >= 3));
  const motsB = new Set(normaliserLibelle(b).split(' ').filter((m) => m.length >= 3));
  if (motsA.size === 0 || motsB.size === 0) return 0;
  let communs = 0;
  for (const m of motsA) if (motsB.has(m)) communs++;
  return (2 * communs) / (motsA.size + motsB.size);
}

/** Au-delà de cet écart, une opération n'est plus un candidat du tout. */
const TOLERANCE_JOURS = 5;
/** Confiance minimale pour rapprocher AUTOMATIQUEMENT, sans confirmation. */
const SEUIL_AUTO = 0.7;
/** En dessous, aucun rapprochement n'est proposé, même pour confirmation manuelle. */
const SEUIL_AMBIGU = 0.35;
/** Écart minimal avec le second candidat pour rapprocher sans confirmation. */
const MARGE_AUTO = 0.15;

/**
 * Cherche, parmi les transactions NON POINTÉES existantes, celle que
 * l'opération importée `operation` reconstitue probablement.
 *
 * Montant, compte et sens (type) doivent correspondre EXACTEMENT — ce sont
 * des faits, pas des indices ; seule la date (tolérance de quelques jours,
 * les délais bancaires) et le libellé (similarité textuelle) nourrissent un
 * score de confiance. Un rapprochement n'est automatique que si le
 * meilleur candidat est nettement au-dessus du seuil ET nettement meilleur
 * que le second — deux candidats proches restent `ambigu`, jamais
 * tranchés au hasard (règle 10 : une validation manuelle doit rester
 * possible).
 */
export function apparierOperationImportee(
  operation: OperationImportee,
  transactionsNonPointees: Transaction[],
): ResultatAppariement {
  const candidats: CandidatRapprochement[] = [];

  for (const t of transactionsNonPointees) {
    if (t.pointage !== 'unpointed') continue;
    if (t.compteId !== operation.compteId) continue;
    if (t.montant !== operation.montant) continue;
    if (t.type !== operation.type) continue;

    const jours = ecartJours(t.date, operation.date);
    if (jours > TOLERANCE_JOURS) continue;

    const scoreDate = 1 - jours / (TOLERANCE_JOURS + 1);
    const scoreLibelle = similariteLibelle(operation.libelle, t.commercant ?? t.description ?? '');
    candidats.push({ transaction: t, confiance: 0.5 * scoreDate + 0.5 * scoreLibelle });
  }

  candidats.sort((a, b) => b.confiance - a.confiance);

  if (candidats.length === 0) {
    return { decision: 'nouvelle', meilleur: null, autresCandidats: [] };
  }

  const [premier, second] = candidats;
  const assezDevantLeSuivant = !second || premier.confiance - second.confiance >= MARGE_AUTO;

  if (premier.confiance >= SEUIL_AUTO && assezDevantLeSuivant) {
    return { decision: 'rapprocher', meilleur: premier, autresCandidats: candidats.slice(1) };
  }
  if (premier.confiance >= SEUIL_AMBIGU) {
    return { decision: 'ambigu', meilleur: premier, autresCandidats: candidats.slice(1) };
  }
  return { decision: 'nouvelle', meilleur: null, autresCandidats: candidats };
}

/**
 * Fusionne une opération importée dans la transaction manuelle existante
 * qu'elle reconstitue : catégorie, statut, libellé saisis à la main restent
 * INTOUCHÉS (ce sont des décisions de l'utilisateur), seules la date
 * (celle, faisant foi, du relevé) et le pointage changent. Ne crée jamais
 * de second enregistrement : c'est ce qui évite le doublon.
 */
export function fusionnerRapprochement(
  existante: Transaction,
  operation: OperationImportee,
  maintenant: string,
): Transaction {
  return {
    ...existante,
    date: operation.date,
    pointage: 'pointed',
    datePointage: maintenant,
  };
}
