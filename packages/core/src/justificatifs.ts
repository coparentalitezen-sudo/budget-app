import type { Transaction } from './types.ts';

/**
 * Statut affiché d'un justificatif (photo de ticket) — TOUJOURS dérivé du
 * `pointage` de la transaction qu'il accompagne, jamais stocké séparément.
 * Un seul endroit dans tout le code pose `pointage: 'pointed'`
 * (`Rapprochement.tsx`) : dupliquer ce statut ailleurs créerait un risque
 * de divergence pour aucun bénéfice.
 */
export type StatutJustificatif = 'en_attente' | 'comptabilise' | 'orphelin';

/** `orphelin` = la transaction liée n'existe plus (supprimée). */
export function statutJustificatif(transaction: Transaction | undefined): StatutJustificatif {
  if (!transaction) return 'orphelin';
  return transaction.pointage === 'pointed' ? 'comptabilise' : 'en_attente';
}
