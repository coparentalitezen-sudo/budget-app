/**
 * Redimensionne et compresse une photo côté client avant tout stockage.
 * Une photo brute de téléphone pèse plusieurs Mo — inutile pour lire un
 * ticket de caisse, et coûteux à synchroniser. Pur canvas, aucune
 * dépendance : reste dans `apps/web` (indisponible côté `packages/core`,
 * qui tourne aussi sous Node/pglite sans DOM).
 */
export async function redimensionnerEtCompresser(
  fichier: File,
  maxCote = 1600,
  qualite = 0.75,
): Promise<Blob> {
  const bitmap = await createImageBitmap(fichier);
  try {
    const echelle = Math.min(1, maxCote / Math.max(bitmap.width, bitmap.height));
    const largeur = Math.round(bitmap.width * echelle);
    const hauteur = Math.round(bitmap.height * echelle);

    const canvas = document.createElement('canvas');
    canvas.width = largeur;
    canvas.height = hauteur;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Contexte canvas indisponible.');
    ctx.drawImage(bitmap, 0, 0, largeur, hauteur);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', qualite),
    );
    if (!blob) throw new Error('Échec de la compression de l’image.');
    return blob;
  } finally {
    bitmap.close();
  }
}
