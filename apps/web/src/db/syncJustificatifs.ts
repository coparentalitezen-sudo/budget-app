import { db } from './dexie.ts';
import { obtenirSupabase, supabaseConfigure } from '../lib/supabase.ts';

/**
 * Synchronisation des justificatifs (photos de tickets) — délibérément
 * SÉPARÉE de `sync.ts` : l'envoi d'une image (Supabase Storage) a des
 * besoins et des échecs différents d'une écriture JSON sur `transactions`
 * (outbox). Un envoi de photo qui échoue ne doit jamais bloquer, ni être
 * bloqué par, la synchronisation des transactions.
 *
 * Le chemin de stockage `${userId}/${transactionId}.jpg` n'est calculé
 * qu'ICI, au moment de l'envoi — jamais à la capture, où l'identité de
 * session n'a pas besoin d'être connue : la capture fonctionne à
 * l'identique en mode local sans compte.
 */

const BUCKET = 'justificatifs';

export async function televerserJustificatifs(): Promise<{ envoyes: number; enAttente: number }> {
  if (!supabaseConfigure || !navigator.onLine) {
    return { envoyes: 0, enAttente: await db.receipts.filter((r) => r.envoyeLe === null).count() };
  }

  const supabase = await obtenirSupabase();
  if (!supabase) return { envoyes: 0, enAttente: 0 };

  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) return { envoyes: 0, enAttente: await db.receipts.filter((r) => r.envoyeLe === null).count() };

  const enAttente = await db.receipts.filter((r) => r.envoyeLe === null && r.blob !== null).toArray();

  let envoyes = 0;
  for (const r of enAttente) {
    const storagePath = `${userId}/${r.transactionId}.jpg`;
    try {
      const { error: erreurUpload } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, r.blob!, { contentType: r.mimeType, upsert: true });
      if (erreurUpload) throw new Error(erreurUpload.message);

      const { error: erreurMeta } = await supabase.from('receipts').upsert(
        {
          id: r.id,
          user_id: userId,
          transaction_id: r.transactionId,
          storage_path: storagePath,
          created_at: r.creeLe,
        },
        { onConflict: 'id' },
      );
      if (erreurMeta) throw new Error(erreurMeta.message);

      await db.receipts.update(r.id, { envoyeLe: new Date().toISOString() });
      envoyes++;
    } catch {
      // Laissé en attente, retenté au prochain appel — jamais perdu.
    }
  }

  return { envoyes, enAttente: enAttente.length - envoyes };
}

/**
 * Fait apparaître les justificatifs créés sur un autre appareil : un STUB
 * local (`blob: null`) suffit à afficher la carte dans Justificatifs sans
 * télécharger l'image tout de suite — voir `televergerPhoto`.
 */
export async function receptionnerJustificatifs(): Promise<void> {
  if (!supabaseConfigure || !navigator.onLine) return;
  const supabase = await obtenirSupabase();
  if (!supabase) return;

  const { data: session } = await supabase.auth.getSession();
  if (!session.session?.user.id) return;

  const { data, error } = await supabase.from('receipts').select('*');
  if (error || !data) return;

  for (const ligne of data as Record<string, unknown>[]) {
    const id = ligne.id as string;
    const existant = await db.receipts.get(id);
    if (existant) continue;
    await db.receipts.put({
      id,
      transactionId: ligne.transaction_id as string,
      blob: null,
      mimeType: 'image/jpeg',
      creeLe: ligne.created_at as string,
      envoyeLe: ligne.created_at as string,
    });
  }
}

/**
 * Télécharge la photo d'un justificatif reçu en stub (`blob: null`), une
 * seule fois par appareil — le résultat est mis en cache dans Dexie.
 */
export async function televergerPhoto(justificatifId: string): Promise<Blob | null> {
  const local = await db.receipts.get(justificatifId);
  if (!local) return null;
  if (local.blob) return local.blob;

  const supabase = await obtenirSupabase();
  if (!supabase) return null;
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) return null;

  const storagePath = `${userId}/${local.transactionId}.jpg`;
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error || !data) return null;

  await db.receipts.update(justificatifId, { blob: data });
  return data;
}
