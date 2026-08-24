/** Normalisation de libellés : majuscules, sans accents, espaces réduits. */
export function normaliser(texte: string): string {
  return texte
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
