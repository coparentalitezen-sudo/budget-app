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

export async function lireTicket(moteur: MoteurOcr, image: Blob): Promise<TicketLu> {
  const texte = await moteur.extraireTexte(image);
  const lignes = texte
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');

  // Montant : la ligne portant un mot-clé de total, sinon le plus gros
  // montant du ticket (le total dépasse presque toujours chaque article
  // pris séparément).
  let montant: Cents | null = null;
  for (const ligne of lignes) {
    if (MOTS_CLES_TOTAL.some((mot) => ligne.toUpperCase().includes(mot))) {
      const candidats = montantsDeLaLigne(ligne);
      if (candidats.length > 0) {
        montant = Math.max(...candidats);
        break;
      }
    }
  }
  if (montant === null) {
    const tous = lignes.flatMap(montantsDeLaLigne);
    if (tous.length > 0) montant = Math.max(...tous);
  }

  // Date : la première trouvée — un ticket n'en porte quasiment jamais deux.
  let date: DateISO | null = null;
  for (const ligne of lignes) {
    date = dateDeLaLigne(ligne);
    if (date !== null) break;
  }

  return { montant, date };
}
