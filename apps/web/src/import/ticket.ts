import type { Cents } from '@budget/core/src/money.ts';
import type { DateISO } from '@budget/core/src/periode.ts';
import type { MoteurOcr } from '../lib/ocr/moteur.ts';
import { analyserDate, analyserMontant } from './parseur.ts';

/**
 * Lecture du montant et de la date d'un ticket photographié, à partir du
 * texte reconnu par un moteur OCR quelconque (voir `lib/ocr/moteur.ts` —
 * cette fonction ne dépend d'aucun moteur en particulier, uniquement du
 * texte qu'il produit). Réutilise `analyserMontant`/`analyserDate` de
 * `parseur.ts`, déjà éprouvés sur du texte bancaire bruyant, plutôt que
 * de réinventer l'analyse d'un montant ou d'une date français.
 *
 * Ne fabrique jamais de valeur : `montant`/`date` valent `null` dès que
 * rien de fiable n'est trouvé — les champs restent alors à compléter à la
 * main dans le formulaire, jamais une valeur devinée imposée en silence.
 */

export interface TicketLu {
  montant: Cents | null;
  date: DateISO | null;
}

// Le moyen de paiement n'apparaît qu'UNE fois sur un ticket, toujours pour
// le montant réellement réglé — priorité sur les lignes « Total », dont un
// ticket avec remises successives (ex. « 2e article à -50 % ») en imprime
// PLUSIEURS, une après chaque remise appliquée.
const MOTS_CLES_PAIEMENT = [
  'CARTE BANCAIRE', 'CARTE BLEUE', 'ESPECES', 'ESPÈCES', 'CHEQUE', 'CHÈQUE',
];
const MOTS_CLES_TOTAL = [
  'NET A PAYER', 'NET À PAYER', 'A PAYER', 'À PAYER', 'TOTAL TTC', 'TOTAL', 'MONTANT',
];

// Exige un séparateur décimal (`,` ou `.`) : un code-barres, un numéro de
// carte de fidélité ou un numéro de téléphone n'en porte jamais, un prix
// imprimé sur un ticket français quasiment toujours. L'espace de milliers
// éventuel doit être UNIQUE et suivi d'exactement 3 chiffres (« 1 234,56 »)
// — un `\s*` permissif capturerait aussi les espaces de mise en page entre
// deux articles d'un même ticket OCRisé, fusionnant deux montants en un.
const MOTIF_MONTANT = /-?\(?\d{1,3}(?:\s\d{3})*[.,]\d{1,2}\)?-?/g;
const MOTIF_DATE = /\d{1,4}[/\-.]\d{1,2}[/\-.]\d{2,4}/g;

function montantsDeLaLigne(ligne: string): Cents[] {
  const trouves: Cents[] = [];
  for (const brut of ligne.match(MOTIF_MONTANT) ?? []) {
    const m = analyserMontant(brut);
    if (m !== null && m > 0) trouves.push(m);
  }
  return trouves;
}

function dateDeLaLigne(ligne: string): DateISO | null {
  for (const brut of ligne.match(MOTIF_DATE) ?? []) {
    const d = analyserDate(brut);
    if (d !== null) return d;
  }
  return null;
}

/**
 * Montant de la DERNIÈRE ligne correspondant à l'un des mots-clés — jamais
 * la première : un ticket imprime parfois plusieurs lignes « Total »
 * successives (une par remise appliquée), et seule la dernière est
 * définitive. `null` si aucune ligne correspondante ne porte de montant.
 */
function dernierMontantParMotCle(lignes: string[], motsCles: string[]): Cents | null {
  let trouve: Cents | null = null;
  for (const ligne of lignes) {
    const majuscules = ligne.toUpperCase();
    if (motsCles.some((mot) => majuscules.includes(mot))) {
      const candidats = montantsDeLaLigne(ligne);
      if (candidats.length > 0) trouve = Math.max(...candidats);
    }
  }
  return trouve;
}

export async function lireTicket(moteur: MoteurOcr, image: Blob): Promise<TicketLu> {
  const texte = await moteur.extraireTexte(image);
  const lignes = texte
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');

  // 1. Le moyen de paiement, s'il est lisible : LE montant réellement réglé.
  // 2. À défaut, la DERNIÈRE ligne « Total »/« Net à payer » — jamais la
  //    première, pour ne pas confondre un total intermédiaire (avant une
  //    remise) avec le total final.
  // 3. En dernier repli, le DERNIER montant imprimé sur le ticket — pas le
  //    plus gros : une suite de totaux décroissants (remises successives)
  //    rend le total final souvent PLUS PETIT que ceux qui le précèdent.
  let montant = dernierMontantParMotCle(lignes, MOTS_CLES_PAIEMENT);
  if (montant === null) montant = dernierMontantParMotCle(lignes, MOTS_CLES_TOTAL);
  if (montant === null) {
    const tous = lignes.flatMap(montantsDeLaLigne);
    if (tous.length > 0) montant = tous[tous.length - 1];
  }

  // Date : la première trouvée — un ticket n'en porte quasiment jamais deux.
  let date: DateISO | null = null;
  for (const ligne of lignes) {
    date = dateDeLaLigne(ligne);
    if (date !== null) break;
  }

  return { montant, date };
}
