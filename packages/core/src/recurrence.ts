import type { Cents } from './money.ts';
import { decomposer, jourDuMois, joursDansMois, periodeDe, type DateISO, type Periode } from './periode.ts';
import type { ChargeRecurrente, Configuration, RevenuRecurrent, Transaction } from './types.ts';

/**
 * Matérialisation des opérations récurrentes échues.
 *
 * Jusqu'ici, une charge ou un revenu dont le jour était déjà passé était
 * simplement IGNORÉ du calcul de projection (`calculerRecurrentsAVenir`,
 * voir `projection.ts`) : on supposait qu'il « avait dû se produire »,
 * sans aucune trace dans les opérations. Le solde théorique semblait alors
 * ne montrer que des sorties d'argent, jamais l'entrée pourtant échue le
 * jour même (ex. le salaire, payé aujourd'hui).
 *
 * Cette fonction produit à la place de VRAIES transactions, en statut
 * `pending`/non pointée, dès que le jour configuré est atteint — visibles
 * dans Opérations, comptées dans le solde théorique comme n'importe quelle
 * opération non pointée, et confirmées (ou corrigées) plus tard par le
 * rapprochement bancaire. `calculerRecurrentsAVenir` continue de ne
 * projeter que les échéances STRICTEMENT futures (`jour > aujourd'hui`) :
 * aucun chevauchement, donc aucun double comptage.
 *
 * Un revenu ou une charge sans jour confirmé (`jour: null`) n'est jamais
 * matérialisé ici : il n'y a pas de date certaine à laquelle déclencher la
 * génération. Il reste géré comme avant, par hypothèse dans la projection.
 */

export interface OperationRecurrenteAGenerer {
  /** Déterministe (jamais aléatoire) : la même échéance ne génère jamais deux fois la même ligne. */
  id: string;
  type: 'revenu' | 'depense';
  date: DateISO;
  montant: Cents;
  categorieId: string | null;
  compteId: string;
  description: string;
}

/** FNV-1a répété avec un sel différent : suffisant pour un identifiant stable, pas pour de la cryptographie. */
function idDeterministe(graine: string): string {
  const fnv1a = (sel: number): string => {
    let h = (0x811c9dc5 ^ sel) >>> 0;
    for (let i = 0; i < graine.length; i++) {
      h ^= graine.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
  };
  const hex32 = fnv1a(0) + fnv1a(1) + fnv1a(2) + fnv1a(3);
  return `${hex32.slice(0, 8)}-${hex32.slice(8, 12)}-${hex32.slice(12, 16)}-${hex32.slice(16, 20)}-${hex32.slice(20, 32)}`;
}

/**
 * Le jour configuré, ramené au dernier jour du mois s'il le dépasse (ex. jour
 * 31 en avril, qui n'en compte que 30). Sert À LA FOIS à dater la ligne
 * générée ET à décider si l'échéance est atteinte : sans ce rabattement, une
 * charge au jour 31 (ex. Bouygues) ne serait jamais générée dans un mois de
 * moins de 31 jours, `31 <= jourDuMois(aujourdhui)` n'étant alors jamais vrai.
 */
function jourEcheance(p: Periode, jour: number): number {
  return Math.min(jour, joursDansMois(p));
}

const actifSur = (e: { debut?: Periode; fin?: Periode }, p: Periode): boolean =>
  (!e.debut || p >= e.debut) && (!e.fin || p <= e.fin);

/**
 * Une opération équivalente (même type, même montant, même période) a-t-elle
 * déjà été saisie — par l'utilisateur ou par une génération précédente ?
 * Évite de matérialiser un doublon quand la vraie transaction a été entrée
 * à la main avant que cette fonction n'ait tourné.
 */
function transactionCorrespondante(
  transactions: Transaction[],
  p: Periode,
  type: 'revenu' | 'depense',
  montant: Cents,
): Transaction | undefined {
  return transactions.find(
    (t) => t.type === type && periodeDe(t.date) === p && t.montant === montant,
  );
}

function dejaSaisie(
  transactions: Transaction[],
  p: Periode,
  type: 'revenu' | 'depense',
  montant: Cents,
): boolean {
  return transactionCorrespondante(transactions, p, type, montant) !== undefined;
}

export function operationsRecurrentesAGenerer(
  config: Configuration,
  transactions: Transaction[],
  aujourdhui: DateISO,
): OperationRecurrenteAGenerer[] {
  const compteCourant = config.comptes.find((c) => c.type === 'courant');
  if (!compteCourant) return [];

  const p = periodeDe(aujourdhui);
  const jour = jourDuMois(aujourdhui);
  const { mois } = decomposer(p);
  const resultats: OperationRecurrenteAGenerer[] = [];

  const revenusEchus: RevenuRecurrent[] = config.revenus.filter(
    (r) => r.jour !== null && jourEcheance(p, r.jour) <= jour && actifSur(r, p),
  );
  for (const r of revenusEchus) {
    if (dejaSaisie(transactions, p, 'revenu', r.montant)) continue;
    const echeance = jourEcheance(p, r.jour!);
    resultats.push({
      id: idDeterministe(`revenu:${r.id}:${p}`),
      type: 'revenu',
      date: `${p}-${String(echeance).padStart(2, '0')}`,
      montant: r.montant,
      categorieId: null,
      compteId: compteCourant.id,
      description: `${r.nom} (généré automatiquement, jour ${r.jour})`,
    });
  }

  const chargesEchues: ChargeRecurrente[] = config.charges.filter(
    (c) =>
      c.jour !== null &&
      jourEcheance(p, c.jour) <= jour &&
      actifSur(c, p) &&
      !(c.moisExclus ?? []).includes(mois),
  );
  for (const c of chargesEchues) {
    if (dejaSaisie(transactions, p, 'depense', c.montant)) continue;
    const echeance = jourEcheance(p, c.jour!);
    resultats.push({
      id: idDeterministe(`charge:${c.id}:${p}`),
      type: 'depense',
      date: `${p}-${String(echeance).padStart(2, '0')}`,
      montant: c.montant,
      categorieId: c.categorieId,
      compteId: compteCourant.id,
      description: `${c.nom} (généré automatiquement, jour ${c.jour})`,
    });
  }

  return resultats;
}

export interface EcheancePassee {
  nom: string;
  type: 'revenu' | 'depense';
  montant: Cents;
  jour: number;
  /**
   * La transaction retrouvée pour cette échéance ce mois-ci, s'il y en a
   * une — pointée (confirmée par un relevé) ou non. `undefined` = aucune
   * trace trouvée, ce qui ne devrait normalement pas arriver puisque
   * `operationsRecurrentesAGenerer` en crée une automatiquement dès que le
   * jour est atteint (sauf si l'appareil qui l'aurait générée n'a pas
   * encore ouvert l'application depuis).
   */
  transaction: Transaction | undefined;
}

/**
 * Échéances confirmées (jour non `null`) déjà passées ce mois-ci, avec la
 * transaction qui les couvre si elle existe — pour EXPLIQUER un solde
 * théorique, jamais pour le recalculer : une échéance déjà « trouvée » ici
 * peut très bien être pointée et antérieure au dernier relevé, donc déjà
 * comptée dans le solde RÉEL plutôt que dans les opérations non pointées —
 * elle n'apparaît alors nulle part ailleurs dans le détail affiché, ce qui
 * peut donner l'impression trompeuse qu'elle a été oubliée.
 */
export function echeancesDejaPassees(
  config: Configuration,
  transactions: Transaction[],
  aujourdhui: DateISO,
): EcheancePassee[] {
  const p = periodeDe(aujourdhui);
  const jour = jourDuMois(aujourdhui);
  const { mois } = decomposer(p);
  const resultats: EcheancePassee[] = [];

  for (const r of config.revenus) {
    if (r.jour === null || jourEcheance(p, r.jour) > jour || !actifSur(r, p)) continue;
    resultats.push({
      nom: r.nom,
      type: 'revenu',
      montant: r.montant,
      jour: r.jour,
      transaction: transactionCorrespondante(transactions, p, 'revenu', r.montant),
    });
  }

  for (const c of config.charges) {
    if (
      c.jour === null ||
      jourEcheance(p, c.jour) > jour ||
      !actifSur(c, p) ||
      (c.moisExclus ?? []).includes(mois)
    ) continue;
    resultats.push({
      nom: c.nom,
      type: 'depense',
      montant: c.montant,
      jour: c.jour,
      transaction: transactionCorrespondante(transactions, p, 'depense', c.montant),
    });
  }

  return resultats.sort((a, b) => a.jour - b.jour);
}
