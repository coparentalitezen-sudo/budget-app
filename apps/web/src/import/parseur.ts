import { round, type Cents } from '@budget/core/src/money.ts';
import type { Transaction } from '@budget/core/src/types.ts';
import { nettoyerCommercant } from './regles.ts';

/**
 * Analyse de relevés tabulaires (CSV, export Google Sheet, texte de PDF).
 *
 * Les relevés bancaires français cumulent trois pièges que l'on ne peut pas
 * deviner à l'avance : séparateur `;` ou `,`, virgule décimale, et dates en
 * JJ/MM/AAAA. Chacun est DÉTECTÉ sur le contenu réel, jamais supposé — et
 * la détection retenue est affichée à l'utilisateur avant validation.
 */

export interface FormatDetecte {
  separateur: string;
  colonneDate: number;
  colonneLibelle: number;
  colonneMontant: number;
  /** Colonnes débit/crédit séparées, fréquent chez les banques françaises. */
  colonneDebit: number | null;
  colonneCredit: number | null;
  enteteDetectee: string[] | null;
}

export interface LigneAnalysee {
  ligne: number;
  brut: string;
  date: string | null;
  libelle: string;
  montant: Cents | null;
  /** Positif = entrée d'argent. */
  sens: 'credit' | 'debit';
  erreur?: string;
}

const SEPARATEURS = [';', '\t', ','];

export function detecterSeparateur(lignes: string[]): string {
  let meilleur = ';';
  let meilleurScore = -1;
  for (const sep of SEPARATEURS) {
    const comptes = lignes.slice(0, 10).map((l) => l.split(sep).length);
    const min = Math.min(...comptes);
    // Un bon séparateur découpe en un nombre de colonnes stable et > 1.
    const stable = comptes.every((c) => c === comptes[0]);
    const score = min > 1 ? min * (stable ? 2 : 1) : -1;
    if (score > meilleurScore) {
      meilleurScore = score;
      meilleur = sep;
    }
  }
  return meilleur;
}

/** Découpe une ligne CSV en respectant les guillemets. */
export function decouper(ligne: string, separateur: string): string[] {
  const champs: string[] = [];
  let courant = '';
  let dansGuillemets = false;
  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i];
    if (c === '"') {
      if (dansGuillemets && ligne[i + 1] === '"') {
        courant += '"';
        i++;
      } else {
        dansGuillemets = !dansGuillemets;
      }
    } else if (c === separateur && !dansGuillemets) {
      champs.push(courant.trim());
      courant = '';
    } else {
      courant += c;
    }
  }
  champs.push(courant.trim());
  return champs;
}

/**
 * Montant français : « 1 234,56 », « -1.234,56 », « (12,30) » pour un négatif.
 * Renvoie `null` si le champ n'est pas un montant — jamais 0, qui serait
 * une donnée fabriquée.
 */
export function analyserMontant(texte: string): Cents | null {
  let t = texte.replace(/\s|\u00a0|€/g, '').trim();
  if (t === '') return null;

  let negatif = false;
  if (/^\(.*\)$/.test(t)) {
    negatif = true;
    t = t.slice(1, -1);
  }
  if (t.startsWith('-')) {
    negatif = true;
    t = t.slice(1);
  } else if (t.endsWith('-')) {
    // Signe final : convention de certains relevés bancaires (« 45,20- »).
    negatif = true;
    t = t.slice(0, -1);
  }
  if (t.startsWith('+')) t = t.slice(1);

  const derniereVirgule = t.lastIndexOf(',');
  const dernierPoint = t.lastIndexOf('.');
  if (derniereVirgule > dernierPoint) {
    t = t.replace(/\./g, '').replace(',', '.');
  } else {
    t = t.replace(/,/g, '');
  }

  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const valeur = round(Number(t) * 100);
  return negatif ? -valeur : valeur;
}

/** Dates JJ/MM/AAAA, JJ-MM-AA, AAAA-MM-JJ. Renvoie `null` si indéchiffrable. */
export function analyserDate(texte: string): string | null {
  const t = texte.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/.exec(t);
  if (m) {
    const jour = m[1].padStart(2, '0');
    const mois = m[2].padStart(2, '0');
    let annee = m[3];
    if (annee.length === 2) annee = `20${annee}`;
    if (Number(mois) > 12) return null;
    return `${annee}-${mois}-${jour}`;
  }
  return null;
}

const ressemble = (entete: string[], motifs: RegExp) =>
  entete.findIndex((h) => motifs.test(h.toLowerCase()));

export function detecterFormat(lignes: string[]): FormatDetecte {
  const separateur = detecterSeparateur(lignes);
  const premiere = decouper(lignes[0] ?? '', separateur);

  // Une première ligne sans date exploitable est très probablement l'entête.
  const estEntete = !premiere.some((c) => analyserDate(c) !== null);

  if (estEntete) {
    const colonneDate = ressemble(premiere, /date|jour/);
    const colonneLibelle = ressemble(premiere, /libell|description|nature|motif|intitul/);
    const colonneDebit = ressemble(premiere, /d[ée]bit|sortie|retrait/);
    const colonneCredit = ressemble(premiere, /cr[ée]dit|entr[ée]e|versement/);
    const colonneMontant = ressemble(premiere, /montant|amount|somme/);
    return {
      separateur,
      colonneDate: colonneDate >= 0 ? colonneDate : 0,
      colonneLibelle: colonneLibelle >= 0 ? colonneLibelle : 1,
      colonneMontant: colonneMontant >= 0 ? colonneMontant : premiere.length - 1,
      colonneDebit: colonneDebit >= 0 ? colonneDebit : null,
      colonneCredit: colonneCredit >= 0 ? colonneCredit : null,
      enteteDetectee: premiere,
    };
  }

  // Sans entête : première colonne contenant une date, dernière contenant
  // un montant, le reste servant de libellé.
  const colonneDate = premiere.findIndex((c) => analyserDate(c) !== null);
  let colonneMontant = -1;
  for (let i = premiere.length - 1; i >= 0; i--) {
    if (analyserMontant(premiere[i]) !== null) {
      colonneMontant = i;
      break;
    }
  }
  const colonneLibelle = premiere.findIndex(
    (c, i) => i !== colonneDate && i !== colonneMontant && c.length > 2,
  );

  return {
    separateur,
    colonneDate: Math.max(0, colonneDate),
    colonneLibelle: Math.max(0, colonneLibelle),
    colonneMontant: colonneMontant >= 0 ? colonneMontant : premiere.length - 1,
    colonneDebit: null,
    colonneCredit: null,
    enteteDetectee: null,
  };
}

export function analyserLignes(texte: string, format: FormatDetecte): LigneAnalysee[] {
  const lignes = texte
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '');

  const debut = format.enteteDetectee ? 1 : 0;
  const resultats: LigneAnalysee[] = [];

  for (let i = debut; i < lignes.length; i++) {
    const champs = decouper(lignes[i], format.separateur);
    const date = analyserDate(champs[format.colonneDate] ?? '');
    const libelle = (champs[format.colonneLibelle] ?? '').trim();

    let montant: Cents | null = null;
    let sens: 'credit' | 'debit' = 'debit';

    if (format.colonneDebit !== null || format.colonneCredit !== null) {
      const debit = format.colonneDebit !== null ? analyserMontant(champs[format.colonneDebit] ?? '') : null;
      const credit = format.colonneCredit !== null ? analyserMontant(champs[format.colonneCredit] ?? '') : null;
      if (credit !== null && credit !== 0) {
        montant = Math.abs(credit);
        sens = 'credit';
      } else if (debit !== null && debit !== 0) {
        montant = Math.abs(debit);
        sens = 'debit';
      }
    } else {
      const brut = analyserMontant(champs[format.colonneMontant] ?? '');
      if (brut !== null) {
        montant = Math.abs(brut);
        sens = brut >= 0 ? 'credit' : 'debit';
      }
    }

    const erreurs: string[] = [];
    if (date === null) erreurs.push('date illisible');
    if (montant === null) erreurs.push('montant illisible');

    resultats.push({
      ligne: i + 1,
      brut: lignes[i],
      date,
      libelle,
      montant,
      sens,
      erreur: erreurs.length > 0 ? erreurs.join(', ') : undefined,
    });
  }

  return resultats;
}

/**
 * Conversion en transactions. Les lignes illisibles sont ÉCARTÉES et
 * comptées, jamais transformées en montant nul.
 */
export function versTransactions(
  lignes: LigneAnalysee[],
  compteId: string,
  source: Transaction['source'],
): Transaction[] {
  return lignes
    .filter((l) => l.date !== null && l.montant !== null)
    .map((l) => ({
      id: crypto.randomUUID(),
      date: l.date!,
      montant: l.montant!,
      type: l.sens === 'credit' ? ('revenu' as const) : ('depense' as const),
      categorieId: null,
      compteId,
      // Le libellé complet reste en description (contexte utile), tandis
      // que le commerçant est nettoyé des mentions techniques (moyen de
      // paiement, références, formes juridiques) — c'est lui que les
      // règles de catégorisation comparent, et lui qui s'affiche.
      description: l.libelle,
      commercant: nettoyerCommercant(l.libelle),
      source,
      // Import = toujours `pending` : rien n'entre dans les comptes sans
      // un regard humain, surtout sans catégorie attribuée.
      statut: 'pending' as const,
    }));
}
