/**
 * Sources d'import autres que le fichier CSV local.
 */

/**
 * Google Sheet : transforme une URL de feuille en URL d'export CSV.
 *
 * LECTURE SEULE, toujours. Rien n'est écrit ni supprimé dans le classeur :
 * il reste la référence tant que l'application n'est pas validée.
 *
 * La feuille doit être partagée en lecture par lien — sinon Google renvoie
 * une page de connexion, que l'on détecte plutôt que de l'analyser comme
 * un relevé.
 */
export function urlExportCsv(url: string): string | null {
  const idClasseur = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/.exec(url);
  if (!idClasseur) return null;
  const gid = /[#&?]gid=(\d+)/.exec(url)?.[1] ?? '0';
  return `https://docs.google.com/spreadsheets/d/${idClasseur[1]}/export?format=csv&gid=${gid}`;
}

export async function recupererGoogleSheet(url: string): Promise<string> {
  const cible = urlExportCsv(url);
  if (!cible) {
    throw new Error(
      'URL Google Sheet non reconnue. Attendu : https://docs.google.com/spreadsheets/d/…',
    );
  }
  const reponse = await fetch(cible);
  if (!reponse.ok) {
    throw new Error(
      `Google a répondu ${reponse.status}. La feuille doit être partagée en lecture par lien.`,
    );
  }
  const texte = await reponse.text();
  if (texte.trimStart().startsWith('<')) {
    throw new Error(
      'Google a renvoyé une page HTML au lieu du CSV : la feuille n’est pas partagée publiquement en lecture.',
    );
  }
  return texte;
}

/**
 * PDF : extraction du texte, ligne par ligne.
 *
 * `pdfjs-dist` est chargé PARESSEUSEMENT — il pèse plusieurs centaines de
 * kilooctets et ne sert qu'ici. Il serait absurde de le faire porter au
 * démarrage de l'application.
 *
 * Limite assumée : les PDF de relevés n'ont aucune structure normalisée.
 * L'extraction reconstitue des lignes de texte à partir des positions des
 * fragments. Un grand écart horizontal entre deux fragments d'une même
 * ligne (typiquement : libellé -> colonne débit -> colonne crédit) est
 * traduit par une tabulation plutôt qu'une simple espace, pour que
 * `releve.ts` puisse retrouver la structure en colonnes du relevé — les
 * colonnes débit/crédit en particulier ne peuvent pas se distinguer une
 * fois le texte aplati en une seule chaîne. Le taux de réussite dépend
 * malgré tout de la banque : l'aperçu avant validation existe pour cela,
 * et le CSV reste toujours préférable quand la banque le propose.
 */
export async function extraireTextePdf(fichier: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();

  const donnees = new Uint8Array(await fichier.arrayBuffer());
  const document = await pdfjs.getDocument({ data: donnees }).promise;
  const lignes: string[] = [];

  // Écart horizontal (en points PDF) au-delà duquel deux fragments d'une
  // même ligne sont considérés comme appartenant à deux colonnes distinctes
  // plutôt qu'à deux mots d'un même champ. Valeur empirique : à un corps de
  // texte courant (9-10 pt), une espace entre mots dépasse rarement 4-5 pt,
  // un écart de colonne en fait le double ou plus.
  const SEUIL_COLONNE = 8;

  for (let numero = 1; numero <= document.numPages; numero++) {
    const page = await document.getPage(numero);
    const contenu = await page.getTextContent();

    // Regroupement par ordonnée : les fragments d'une même ligne visuelle
    // partagent leur position verticale à un point près.
    const parLigne = new Map<number, { x: number; largeur: number; texte: string }[]>();
    for (const element of contenu.items) {
      if (!('str' in element) || element.str.trim() === '') continue;
      const y = Math.round(element.transform[5]);
      const x = element.transform[4] as number;
      const groupe = parLigne.get(y) ?? [];
      groupe.push({ x, largeur: element.width, texte: element.str });
      parLigne.set(y, groupe);
    }

    for (const y of [...parLigne.keys()].sort((a, b) => b - a)) {
      const fragments = parLigne.get(y)!.sort((a, b) => a.x - b.x);
      let ligne = fragments[0]?.texte ?? '';
      for (let i = 1; i < fragments.length; i++) {
        const precedent = fragments[i - 1];
        const ecart = fragments[i].x - (precedent.x + precedent.largeur);
        ligne += (ecart > SEUIL_COLONNE ? '\t' : ' ') + fragments[i].texte;
      }
      // Ne recompacte que les espaces normales : une tabulation de colonne
      // ne doit jamais être avalée par ce nettoyage.
      lignes.push(ligne.replace(/ {2,}/g, ' '));
    }
  }

  return lignes.join('\n');
}
