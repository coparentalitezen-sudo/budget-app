/**
 * Contrat minimal d'un moteur OCR : donner une image, recevoir le texte
 * reconnu. Volontairement réduit à cette seule responsabilité —
 * l'interprétation du texte (quel nombre est le total, quelle ligne est la
 * date) reste dans `import/ticket.ts`, agnostique du moteur, pour ne
 * jamais devoir être réécrite si le moteur change.
 *
 * Remplacer Tesseract par autre chose (une API cloud, un autre moteur
 * local) se limite à écrire une nouvelle implémentation de cette
 * interface et à changer UNE ligne dans `index.ts` — rien d'autre dans
 * l'application ne dépend de Tesseract directement.
 */
export interface MoteurOcr {
  extraireTexte(image: Blob): Promise<string>;
}
