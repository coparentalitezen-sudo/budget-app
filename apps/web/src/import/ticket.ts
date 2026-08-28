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

// Trois niveaux de fiabilité décroissante, essayés dans l'ordre — dès
// qu'un niveau trouve quelque chose, les suivants ne sont jamais consultés.
//
// 1. Le moyen de paiement, montant sur la même ligne : n'apparaît qu'UNE
//    fois, toujours pour ce qui a été réellement réglé.
// 2. Un intitulé de total SANS AMBIGUÏTÉ POSSIBLE : ne désigne jamais
//    autre chose que le montant final.
// 3. Le mot « TOTAL » seul, plus risqué — un ticket imprime parfois
//    PLUSIEURS lignes « Total » (une par remise appliquée), ou l'utilise
//    comme intitulé de ligne dans un tableau récapitulatif de TVA. Cette
//    ambiguïté est la cause exacte d'un montant faux constaté sur un vrai
//    ticket Action (tableau TVA imprimant une ligne « TOTAL » distincte du
//    vrai total, juste en dessous).
//
// Volontairement PAS de « MONTANT » seul, dans aucun niveau : un ticket
// imprime presque toujours un « Montant H.T. » (hors taxes, jamais ce qui
// a été payé) à proximité immédiate du vrai total — un mot-clé aussi
// générique le confondrait avec certitude.
const MOTS_CLES_PAIEMENT = [
  'CARTE BANCAIRE', 'CARTE BLEUE', 'ESPECES', 'ESPÈCES', 'CHEQUE', 'CHÈQUE',
];
const MOTS_CLES_TOTAL_EXPLICITE = [
  'NET A PAYER', 'NET À PAYER', 'A PAYER', 'À PAYER', 'TOTAL TTC', 'MONTANT TTC',
];
const MOTS_CLES_TOTAL_GENERIQUE = ['TOTAL'];

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

  // Voir le commentaire sur les mots-clés : chaque niveau n'est consulté
  // que si le précédent n'a RIEN trouvé — jamais mélangés entre eux, pour
  // qu'un intitulé générique et ambigu (niveau 3) ne puisse jamais
  // l'emporter sur un intitulé explicite (niveau 2) simplement parce qu'il
  // apparaît plus bas sur le ticket.
  let montant = dernierMontantParMotCle(lignes, MOTS_CLES_PAIEMENT);
  if (montant === null) montant = dernierMontantParMotCle(lignes, MOTS_CLES_TOTAL_EXPLICITE);
  if (montant === null) montant = dernierMontantParMotCle(lignes, MOTS_CLES_TOTAL_GENERIQUE);
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
