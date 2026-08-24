import type { Transaction } from '@budget/core/src/types.ts';

/**
 * Détection de doublons à l'import.
 *
 * RÈGLE : on ne supprime JAMAIS silencieusement. Un doublon détecté est
 * signalé et laissé en attente de décision. Deux dépenses réellement
 * identiques le même jour — deux cafés à 3,50 € — sont parfaitement
 * légitimes : les écarter d'office ferait disparaître de vraies données.
 */

export interface Suspicion {
  candidate: Transaction;
  existante: Transaction;
  raison: 'identifiant_source' | 'empreinte';
}

/** Empreinte : date + montant + libellé normalisé. */
export function empreinte(t: Transaction): string {
  const libelle = (t.commercant ?? t.description ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
  return `${t.date}|${t.montant}|${libelle}`;
}

export function detecterDoublons(
  candidates: Transaction[],
  existantes: Transaction[],
): { aImporter: Transaction[]; suspicions: Suspicion[] } {
  const parEmpreinte = new Map<string, Transaction>();
  for (const t of existantes) parEmpreinte.set(empreinte(t), t);

  const aImporter: Transaction[] = [];
  const suspicions: Suspicion[] = [];

  for (const c of candidates) {
    const existante = parEmpreinte.get(empreinte(c));
    if (existante) {
      // Signalée, mais TOUJOURS importée en statut `pending` :
      // c'est à l'utilisateur de trancher, pas à l'algorithme.
      suspicions.push({ candidate: c, existante, raison: 'empreinte' });
      aImporter.push({ ...c, statut: 'pending' });
    } else {
      aImporter.push(c);
    }
  }

  return { aImporter, suspicions };
}
