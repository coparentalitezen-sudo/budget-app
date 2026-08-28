import { moteurTesseract } from './tesseract.ts';

export type { MoteurOcr } from './moteur.ts';

/**
 * SEUL point de câblage du moteur OCR actif. Le reste de l'application
 * importe `moteurOcr` depuis ce fichier uniquement — jamais directement
 * `tesseract.ts` — pour que remplacer Tesseract par un autre moteur (une
 * API cloud, par exemple) tienne dans cette seule ligne.
 */
export const moteurOcr = moteurTesseract;
