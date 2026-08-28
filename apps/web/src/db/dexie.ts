import Dexie, { type Table } from 'dexie';
import type { Transaction } from '@budget/core/src/types.ts';

/**
 * Persistance locale.
 *
 * IndexedDB est la source de vérité LOCALE : toute écriture y va d'abord,
 * puis rejoint la file `outbox`. L'application reste donc pleinement
 * utilisable sans réseau, et la synchronisation devient un détail
 * d'arrière-plan plutôt qu'un préalable.
 */

export interface OperationEnAttente {
  /** UUID généré côté client : rejouer l'opération est sans effet de bord. */
  id: string;
  table: 'transactions';
  /** `upsert` couvre création et modification ; `delete` est logique. */
  operation: 'upsert' | 'delete';
  cibleId: string;
  charge: unknown;
  creeLe: string;
  tentatives: number;
  derniereErreur?: string;
}

export interface EntreeMeta {
  cle: string;
  valeur: unknown;
}

/**
 * Photo d'un ticket, liée 1-1 à une transaction. Volontairement PAS dans
 * `outbox` : l'envoi d'une image a des besoins et des échecs différents
 * d'une écriture JSON sur `transactions` (voir `syncJustificatifs.ts`), un
 * envoi qui échoue ne doit jamais bloquer la synchro des transactions.
 */
export interface JustificatifLocal {
  /** UUID généré côté client, même convention que `Transaction.id`. */
  id: string;
  transactionId: string;
  /** `null` = connu via la synchro mais pas encore téléchargé sur cet appareil. */
  blob: Blob | null;
  mimeType: string;
  creeLe: string;
  /** `null` = pas encore envoyée — même convention que `pointed_at`/`datePointage`. */
  envoyeLe: string | null;
}

export class BudgetDB extends Dexie {
  transactions!: Table<Transaction, string>;
  outbox!: Table<OperationEnAttente, string>;
  meta!: Table<EntreeMeta, string>;
  receipts!: Table<JustificatifLocal, string>;

  constructor() {
    super('budget');
    this.version(1).stores({
      transactions: 'id, date, categorieId, compteId, statut, type',
      outbox: 'id, creeLe, table',
      meta: 'cle',
    });
    // Dexie exige le schéma COMPLET à chaque version, pas un diff.
    this.version(2).stores({
      transactions: 'id, date, categorieId, compteId, statut, type',
      outbox: 'id, creeLe, table',
      meta: 'cle',
      receipts: 'id, transactionId, creeLe',
    });
  }
}

export const db = new BudgetDB();

export async function lireMeta<T>(cle: string, defaut: T): Promise<T> {
  const entree = await db.meta.get(cle);
  return entree ? (entree.valeur as T) : defaut;
}

export async function ecrireMeta(cle: string, valeur: unknown): Promise<void> {
  await db.meta.put({ cle, valeur });
}

/** Crée ou met à jour une transaction, localement puis dans la file. */
export async function enregistrerTransaction(t: Transaction): Promise<void> {
  await db.transaction('rw', db.transactions, db.outbox, async () => {
    await db.transactions.put(t);
    await db.outbox.put({
      id: crypto.randomUUID(),
      table: 'transactions',
      operation: 'upsert',
      cibleId: t.id,
      charge: t,
      creeLe: new Date().toISOString(),
      tentatives: 0,
    });
  });
}

/**
 * Enregistre la photo d'un ticket, liée à une transaction déjà créée.
 * Purement local : `syncJustificatifs.ts` s'occupe de l'envoi, à son
 * propre rythme — voir le commentaire sur `JustificatifLocal`.
 */
export async function enregistrerJustificatif(
  transactionId: string,
  blob: Blob,
  mimeType: string,
): Promise<void> {
  await db.receipts.put({
    id: crypto.randomUUID(),
    transactionId,
    blob,
    mimeType,
    creeLe: new Date().toISOString(),
    envoyeLe: null,
  });
}

/** Suppression LOGIQUE : l'historique n'est jamais perdu. */
export async function supprimerTransaction(id: string): Promise<void> {
  await db.transaction('rw', db.transactions, db.outbox, async () => {
    await db.transactions.delete(id);
    await db.outbox.put({
      id: crypto.randomUUID(),
      table: 'transactions',
      operation: 'delete',
      cibleId: id,
      charge: null,
      creeLe: new Date().toISOString(),
      tentatives: 0,
    });
  });
}
