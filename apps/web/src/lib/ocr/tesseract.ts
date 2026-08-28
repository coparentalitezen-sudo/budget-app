import type { MoteurOcr } from './moteur.ts';

/**
 * Implémentation Tesseract.js de `MoteurOcr` — le seul fichier qui connaît
 * l'API de Tesseract dans toute l'application (voir `moteur.ts`).
 *
 * Chargement PARESSEUX (`import()` dynamique) : Tesseract pèse plusieurs
 * Mo (moteur WASM + données de langue téléchargées depuis son CDN par
 * défaut au premier usage réel) — même traitement que pdf.js pour
 * l'import PDF (voir `vite.config.ts`, jamais précaché dans le socle
 * applicatif).
 */
export const moteurTesseract: MoteurOcr = {
  async extraireTexte(image: Blob): Promise<string> {
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('fra');
    try {
      const { data } = await worker.recognize(image);
      return data.text;
    } finally {
      await worker.terminate();
    }
  },
};
