import { db, ecrireMeta, lireMeta, type OperationEnAttente } from './dexie.ts';
import { obtenirSupabase, supabaseConfigure } from '../lib/supabase.ts';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Transaction } from '@budget/core/src/types.ts';

/**
 * Synchronisation idempotente.
 *
 * Chaque opération est poussée en `upsert` sur la clé primaire. Rejouer
 * la file entière n'a donc aucun effet de bord : une opération déjà
 * appliquée écrit simplement la même valeur. C'est ce qui permet de
 * retenter sans registre de transactions distribuées, et de survivre à une
 * coupure au milieu d'un envoi.
 */

const MAX_TENTATIVES = 5;

export interface ResultatSync {
  etat: 'ok' | 'hors_ligne' | 'non_configure' | 'erreur';
  envoyees: number;
  recues: number;
  enAttente: number;
  message?: string;
}

/** Traduit une transaction du moteur vers les colonnes SQL. */
function versLigne(t: Transaction, userId: string) {
  return {
    id: t.id,
    user_id: userId,
    account_id: t.compteId,
    destination_account_id: t.compteDestinationId ?? null,
    category_id: t.categorieId,
    occurred_on: t.date,
    amount_cents: t.montant,
    type: t.type,
    status: t.statut,
    source: t.source,
    description: t.description ?? null,
    merchant: t.commercant ?? null,
    // `pointed_at` suit le même principe que `deleted_at` : NULL = non
    // pointée, un horodatage = pointée (voir la migration 0012). `pointage`
    // ne porte donc lui-même aucune colonne dédiée côté base.
    pointed_at: t.pointage === 'pointed' ? (t.datePointage ?? new Date().toISOString()) : null,
  };
}

/** Traduit une ligne SQL vers le modèle du moteur. */
function versTransaction(ligne: Record<string, unknown>): Transaction {
  const pointedAt = (ligne.pointed_at as string | null) ?? null;
  return {
    id: ligne.id as string,
    date: ligne.occurred_on as string,
    montant: Number(ligne.amount_cents),
    type: ligne.type as Transaction['type'],
    categorieId: (ligne.category_id as string | null) ?? null,
    compteId: ligne.account_id as string,
    compteDestinationId: (ligne.destination_account_id as string | null) ?? null,
    description: (ligne.description as string | null) ?? undefined,
    commercant: (ligne.merchant as string | null) ?? undefined,
    source: ligne.source as Transaction['source'],
    // Colonne SQL : `status` (voir `versLigne` ci-dessus), pas `statut` —
    // `ligne.statut` n'existe pas sur la ligne reçue de Supabase et valait
    // donc toujours `undefined` ici. Une transaction reçue par une
    // synchronisation redevenait alors invisible dans « À renseigner »,
    // qui exige `statut === 'pending'` (`undefined !== 'pending'`).
    statut: ligne.status as Transaction['statut'],
    pointage: pointedAt !== null ? 'pointed' : 'unpointed',
    datePointage: pointedAt,
  };
}

async function pousser(
  supabase: SupabaseClient,
  op: OperationEnAttente,
  userId: string,
): Promise<void> {
  if (op.operation === 'upsert') {
    const { error } = await supabase
      .from('transactions')
      .upsert(versLigne(op.charge as Transaction, userId), { onConflict: 'id' });
    if (error) throw new Error(error.message);
  } else {
    // Suppression logique : la ligne reste, seul `deleted_at` est posé.
    const { error } = await supabase
      .from('transactions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', op.cibleId);
    if (error) throw new Error(error.message);
  }
}

export async function synchroniser(): Promise<ResultatSync> {
  const enAttenteAvant = await db.outbox.count();

  if (!supabaseConfigure) {
    return {
      etat: 'non_configure',
      envoyees: 0,
      recues: 0,
      enAttente: enAttenteAvant,
      message: 'Supabase non configuré : l’application fonctionne en local seul.',
    };
  }
  if (!navigator.onLine) {
    return {
      etat: 'hors_ligne',
      envoyees: 0,
      recues: 0,
      enAttente: enAttenteAvant,
      message: 'Hors ligne. Les modifications sont conservées et seront envoyées.',
    };
  }

  const supabase = await obtenirSupabase();
  if (!supabase) {
    return {
      etat: 'non_configure',
      envoyees: 0,
      recues: 0,
      enAttente: enAttenteAvant,
      message: 'Supabase non configuré.',
    };
  }

  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) {
    return {
      etat: 'erreur',
      envoyees: 0,
      recues: 0,
      enAttente: enAttenteAvant,
      message: 'Session absente : connexion requise pour synchroniser.',
    };
  }

  /* --- Envoi, dans l'ordre de création ---------------------------- */
  let envoyees = 0;
  const operations = await db.outbox.orderBy('creeLe').toArray();
  for (const op of operations) {
    try {
      await pousser(supabase, op, userId);
      await db.outbox.delete(op.id);
      envoyees++;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const tentatives = op.tentatives + 1;
      // Une opération qui échoue durablement est CONSERVÉE et signalée,
      // jamais supprimée en silence : perdre une saisie serait pire que
      // laisser une file bloquée visible dans les Paramètres.
      await db.outbox.update(op.id, { tentatives, derniereErreur: message });
      if (tentatives < MAX_TENTATIVES) {
        return {
          etat: 'erreur',
          envoyees,
          recues: 0,
          enAttente: await db.outbox.count(),
          message,
        };
      }
    }
  }

  /* --- Réception des changements distants ------------------------- */
  // Réparation ponctuelle : `versTransaction` a longtemps écrit
  // `statut: undefined` sur CHAQUE transaction reçue (mauvais nom de
  // colonne), rendant silencieusement invisibles dans « À renseigner »
  // toutes les transactions déjà passées par une synchronisation. Une
  // synchronisation COMPLÈTE (jamais incrémentale), une seule fois, répare
  // les données locales déjà corrompues par cet ancien bug — les suivantes
  // redeviennent incrémentales normalement.
  const reparationFaite = await lireMeta<boolean>('reparationStatutSync', false);
  const depuis = reparationFaite ? await lireMeta<string | null>('derniereSync', null) : null;
  let requete = supabase.from('transactions').select('*').is('deleted_at', null);
  if (depuis) requete = requete.gt('updated_at', depuis);

  const { data, error } = await requete;
  if (error) {
    return {
      etat: 'erreur',
      envoyees,
      recues: 0,
      enAttente: await db.outbox.count(),
      message: error.message,
    };
  }

  const lignes = (data ?? []) as Record<string, unknown>[];
  if (lignes.length > 0) {
    await db.transactions.bulkPut(lignes.map(versTransaction));
  }
  await ecrireMeta('derniereSync', new Date().toISOString());
  if (!reparationFaite) await ecrireMeta('reparationStatutSync', true);

  return {
    etat: 'ok',
    envoyees,
    recues: lignes.length,
    enAttente: await db.outbox.count(),
  };
}

/**
 * Déclenche une synchronisation au retour du réseau, ET une première fois
 * au lancement de l'app. Sans ce second déclenchement, un appareil déjà en
 * ligne à l'ouverture (le cas courant) ne voit jamais l'évènement `online`
 * — rien ne partait alors tant que l'utilisateur n'appuyait pas
 * manuellement sur « Synchroniser maintenant » dans Réglages, laissant la
 * file d'attente grossir silencieusement. `synchroniser()` reste sans
 * effet de bord si hors ligne, non configuré ou sans session : ce premier
 * appel est donc sûr dans tous les cas.
 */
export function installerSyncAutomatique(onResultat: (r: ResultatSync) => void): () => void {
  const declencher = () => {
    void synchroniser().then(onResultat);
  };
  declencher();
  window.addEventListener('online', declencher);
  return () => window.removeEventListener('online', declencher);
}
