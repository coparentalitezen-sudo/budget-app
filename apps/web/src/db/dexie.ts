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

export class BudgetDB extends Dexie {
  transactions!: Table<Transaction, string>;
  outbox!: Table<OperationEnAttente, string>;
  meta!: Table<EntreeMeta, string>;

  constructor() {
    super('budget');
    this.version(1).stores({
      transactions: 'id, date, categorieId, compteId, statut, type',
      outbox: 'id, creeLe, table',
      meta: 'cle',
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
