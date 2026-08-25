import type { Cents } from '@budget/core/src/money.ts';
import { analyserDate, analyserMontant, type LigneAnalysee } from './parseur.ts';

/**
 * Analyse spécifique aux relevés bancaires extraits d'un PDF.
 *
 * Un relevé PDF (Hello bank, BNP Paribas...) n'a rien d'un CSV : à côté des
 * vraies opérations, chaque page répète un en-tête, un pied de page, un
 * numéro de page, l'IBAN/BIC, la période couverte, parfois un texte
 * commercial. Traiter chaque ligne extraite comme une transaction produirait
 * des centaines de lignes « illisibles » pour quelques dizaines d'opérations
 * réelles — ce module sépare les deux AVANT d'appeler l'analyseur de
 * montants/dates, plutôt que de les compter comme des échecs.
 *
 * Une opération est reconnue à sa structure : elle COMMENCE par sa date.
 * Toute ligne qui ne commence pas par une date et qui n'est pas reconnue
 * comme administrative est considérée comme la suite du libellé de
 * l'opération précédente (une description qui déborde sur plusieurs lignes).
 */

const MOIS_FR: Record<string, number> = {
  janvier: 1, 'février': 2, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, 'août': 8, aout: 8, septembre: 9, octobre: 10, novembre: 11,
  'décembre': 12, decembre: 12,
};

export interface PeriodeReleve {
  /** DateISO */
  debut: string;
  /** DateISO */
  fin: string;
}

/**
 * Cherche « du 15 juin 2026 au 15 juillet 2026 » (ou variante) dans les
 * lignes du relevé, pour pouvoir dater les opérations écrites en JJ/MM
 * seul. Renvoie `null` si la période n'est pas trouvée — une date sans
 * année reste alors indéchiffrable plutôt que devinée.
 */
export function analyserPeriodeReleve(lignes: string[]): PeriodeReleve | null {
  const motif =
    /\bdu\s+(\d{1,2})\s+([a-zA-ZÀ-ÿ]+)\s+(\d{4})\s+au\s+(\d{1,2})\s+([a-zA-ZÀ-ÿ]+)\s+(\d{4})/i;
  for (const ligne of lignes) {
    const m = motif.exec(ligne);
    if (!m) continue;
    const moisDebut = MOIS_FR[m[2].toLowerCase()];
    const moisFin = MOIS_FR[m[5].toLowerCase()];
    if (!moisDebut || !moisFin) continue;
    return {
      debut: `${m[3]}-${String(moisDebut).padStart(2, '0')}-${m[1].padStart(2, '0')}`,
      fin: `${m[6]}-${String(moisFin).padStart(2, '0')}-${m[4].padStart(2, '0')}`,
    };
  }
  return null;
}

/**
 * Déduit l'année d'une date JJ/MM à partir de la période du relevé. Les deux
 * bornes de la période peuvent porter des années différentes (relevé à
 * cheval sur le Nouvel An) : seule l'année qui place la date DANS la
 * période est retenue — jamais une année devinée au hasard.
 */
export function deduireDateSansAnnee(
  jour: number,
  mois: number,
  periode: PeriodeReleve | null,
): string | null {
  if (periode === null) return null;
  if (mois < 1 || mois > 12 || jour < 1 || jour > 31) return null;
  const anneesCandidates = new Set([
    Number(periode.debut.slice(0, 4)),
    Number(periode.fin.slice(0, 4)),
  ]);
  for (const annee of anneesCandidates) {
    const iso = `${annee}-${String(mois).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;
    if (iso >= periode.debut && iso <= periode.fin) return iso;
  }
  return null;
}

/**
 * Motifs de lignes non transactionnelles : en-têtes, pieds de page, numéros
 * de page, coordonnées bancaires, période, titres, soldes intermédiaires,
 * texte commercial ou administratif. Volontairement génériques (Hello bank
 * et BNP Paribas partagent une mise en page proche des autres banques
 * françaises) plutôt que couplés à une seule mise en page.
 */
const MOTIFS_ADMINISTRATIFS: RegExp[] = [
  // Numéro de page : « P. 1/10 », « Page 1/10 », « 1 / 10 »
  /^p(?:age)?\.?\s*\d+\s*\/\s*\d+\s*$/i,
  // Période du relevé
  /\bdu\s+\d{1,2}\s+[a-zA-ZÀ-ÿ]+\s+\d{4}\s+au\s+\d{1,2}\s+[a-zA-ZÀ-ÿ]+\s+\d{4}/i,
  // Coordonnées bancaires
  /\biban\b|\bbic\b|\brib\b/i,
  /^[a-z]{2}\d{2}[\d\s]{10,}$/i, // IBAN au format FRxx ....
  /^\d{4,6}(\s+\d{4,6}){1,4}\s*$/, // suites de codes numériques (guichet, agence...)
  /^(code\s*guichet|code\s*banque|n°?\s*de\s*compte|num[ée]ro\s*de\s*compte|titulaire\s*:?|adresse\s*:|agence\b)/i,
  // Titres / en-têtes de document
  /^(relev[ée]\s*(de|d['’])?\s*(compte(\s*ch[èe]ques?)?|op[ée]rations)|extrait\s*de\s*compte)/i,
  /^compte\s*ch[èe]ques?\b/i,
  // Ligne d'entête du tableau d'opérations (répétée en haut de chaque page),
  // reconnue même fragmentée en plusieurs lignes ou colonnes isolées.
  /^date\b.*(libell[ée]|nature|op[ée]ration).*(d[ée]bit|cr[ée]dit|montant)/i,
  /^date\s*(de\s*)?(valeur|op[ée]ration)\s*$/i,
  /^nature\s*(des\s*)?op[ée]rations?\s*$/i,
  /^(libell[ée]|d[ée]signation)\s*(de\s*l['’]op[ée]ration)?\s*$/i,
  /^d[ée]bit\s*$/i,
  /^cr[ée]dit\s*$/i,
  /^d[ée]bit\s+cr[ée]dit\s*$/i,
  // Soldes non transactionnels
  /^(ancien|nouveau)\s+solde/i,
  /\bsolde\s+(interm[ée]diaire|progressif|au\s+\d|cr[ée]diteur|d[ée]biteur|initial|final)\b/i,
  /^total\s+(des\s+)?(mouvements|op[ée]rations)/i,
  // Texte commercial / administratif / juridique
  /hello\s*bank/i,
  /bnp\s*paribas/i,
  /^(retrouvez|suivez)[- ]nous/i,
  /\bcapital\s+de\b/i,
  /\bRCS\b|\bORIAS\b/,
  /^www\.|^https?:\/\//i,
];

export function estLigneAdministrative(ligne: string): boolean {
  const t = ligne.trim();
  if (t === '') return true;
  return MOTIFS_ADMINISTRATIFS.some((motif) => motif.test(t));
}

export interface ColonnesOperations {
  /** Index dans `reste.split('\t')`, donc après retrait du champ date. */
  libelle: number;
  debit: number | null;
  credit: number | null;
  montant: number | null;
}

/**
 * Cherche la ligne d'entête du tableau d'opérations (« Date · Nature ·
 * Débit · Crédit », parfois suivie d'une colonne Solde) pour retrouver la
 * VRAIE position des colonnes débit/crédit dans ce relevé précis. Sans
 * cela, une colonne « Solde » (report du solde après chaque opération,
 * fréquente en dernière colonne) pourrait être confondue avec le montant de
 * l'opération — deux nombres qui se ressemblent mais n'ont rien à voir.
 */
export function detecterColonnesOperations(lignes: string[]): ColonnesOperations | null {
  for (const ligne of lignes) {
    if (!/^date\b/i.test(ligne.trim())) continue;
    const champs = ligne.split('\t').map((c) => c.trim().toLowerCase());
    if (champs.length < 2) continue;

    const iLibelle = champs.findIndex((c) => /libell[ée]|nature|op[ée]ration|description/.test(c));
    const iDebit = champs.findIndex((c) => /d[ée]bit|sortie|retrait/.test(c));
    const iCredit = champs.findIndex((c) => /cr[ée]dit|entr[ée]e|versement/.test(c));
    const iMontant = champs.findIndex((c) => /^montant$/.test(c));
    if (iLibelle < 0 && iDebit < 0 && iCredit < 0 && iMontant < 0) continue;

    // Les index sont relatifs à l'entête entière (champ « Date » inclus) ;
    // `reste` a déjà perdu ce premier champ, d'où le décalage de -1.
    return {
      libelle: iLibelle >= 0 ? iLibelle - 1 : 0,
      debit: iDebit >= 0 ? iDebit - 1 : null,
      credit: iCredit >= 0 ? iCredit - 1 : null,
      montant: iMontant >= 0 ? iMontant - 1 : null,
    };
  }
  return null;
}

/** Date en tout début de ligne, avec ou sans année, suivie d'une frontière non numérique. */
const DATE_AVEC_ANNEE = /^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})(?=[^\d]|$)/;
const DATE_SANS_ANNEE = /^(\d{1,2})[/.](\d{1,2})(?=[^\d]|$)/;

/**
 * Reconnaît le début d'une opération : sa date. Renvoie la date interprétée
 * (ou `null` si elle n'a pas pu être établie, y compris faute de période) et
 * le reste de la ligne, ou `null` si la ligne ne commence pas par une date.
 */
function extraireDateDebut(
  ligne: string,
  periode: PeriodeReleve | null,
): { date: string | null; reste: string } | null {
  let m = DATE_AVEC_ANNEE.exec(ligne);
  if (m) {
    return { date: analyserDate(m[0]), reste: ligne.slice(m[0].length) };
  }
  m = DATE_SANS_ANNEE.exec(ligne);
  if (m) {
    const date = deduireDateSansAnnee(Number(m[1]), Number(m[2]), periode);
    return { date, reste: ligne.slice(m[0].length) };
  }
  return null;
}

/** Montant en toute fin de chaîne, notation française. Repli quand aucune colonne n'a été détectée. */
const MONTANT_FIN_LIGNE = /(-?\(?\d{1,3}(?:[  ]?\d{3})*(?:[.,]\d{2})?\)?)\s*(?:€|EUR)?\s*$/i;

function nettoyerLibelle(texte: string): string {
  return texte.replace(/\t/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

function analyserLigneOperation(
  brut: string,
  numeroLigne: number,
  date: string | null,
  reste: string,
  colonnes: ColonnesOperations | null,
): LigneAnalysee {
  // La tabulation juste après la date (s'il y en a une) sépare la date du
  // reste de la ligne ; elle ne fait pas partie du libellé.
  const champs = reste.replace(/^\t/, '').split('\t').map((c) => c.trim());

  let libelle = champs[0] ?? '';
  let montant: Cents | null = null;
  let sens: 'credit' | 'debit' = 'debit';

  if (colonnes) {
    // Colonnes retrouvées depuis l'entête du relevé : jamais confondues
    // avec une éventuelle colonne Solde, quelle que soit sa position.
    libelle = champs[colonnes.libelle] ?? champs[0] ?? '';
    if (colonnes.credit !== null) {
      const credit = analyserMontant(champs[colonnes.credit] ?? '');
      if (credit !== null && credit !== 0) {
        montant = Math.abs(credit);
        sens = 'credit';
      }
    }
    if (montant === null && colonnes.debit !== null) {
      const debit = analyserMontant(champs[colonnes.debit] ?? '');
      if (debit !== null && debit !== 0) {
        montant = Math.abs(debit);
        sens = 'debit';
      }
    }
    if (montant === null && colonnes.montant !== null) {
      const brutMontant = analyserMontant(champs[colonnes.montant] ?? '');
      if (brutMontant !== null) {
        montant = Math.abs(brutMontant);
        sens = brutMontant >= 0 ? 'credit' : 'debit';
      }
    }
  } else if (champs.length >= 3) {
    // Pas d'entête retrouvée : repli positionnel — débit puis crédit, dans
    // l'ordre où l'espacement du PDF les a séparés.
    const debit = analyserMontant(champs[1] ?? '');
    const credit = analyserMontant(champs[2] ?? '');
    if (credit !== null && credit !== 0) {
      montant = Math.abs(credit);
      sens = 'credit';
    } else if (debit !== null && debit !== 0) {
      montant = Math.abs(debit);
      sens = 'debit';
    }
  } else if (champs.length === 2) {
    const brutMontant = analyserMontant(champs[1] ?? '');
    if (brutMontant !== null) {
      montant = Math.abs(brutMontant);
      sens = brutMontant >= 0 ? 'credit' : 'debit';
    }
  }

  if (montant === null && colonnes === null) {
    // Repli seulement quand la structure du relevé est totalement inconnue
    // (pas d'entête détectée, pas d'écart de colonne) : on cherche le
    // dernier nombre de la ligne. Si les colonnes SONT connues et que la
    // case attendue est vide, ce n'est pas une erreur d'extraction — il n'y
    // a simplement pas de montant à cet endroit (colonne Solde par
    // exemple) ; aller chercher un autre nombre romprait la correspondance
    // avec la vraie colonne du montant.
    const m = MONTANT_FIN_LIGNE.exec(reste.trimEnd());
    if (m) {
      const brutMontant = analyserMontant(m[1]);
      if (brutMontant !== null) {
        montant = Math.abs(brutMontant);
        sens = brutMontant >= 0 ? 'credit' : 'debit';
        libelle = reste.slice(0, m.index);
      }
    }
  }

  const erreurs: string[] = [];
  if (date === null) erreurs.push('date illisible');
  if (montant === null) erreurs.push('montant illisible');

  return {
    ligne: numeroLigne,
    brut,
    date,
    libelle: nettoyerLibelle(libelle),
    montant,
    sens,
    erreur: erreurs.length > 0 ? erreurs.join(', ') : undefined,
  };
}

export interface ReleveAnalyse {
  lignes: LigneAnalysee[];
  /** Lignes reconnues comme non transactionnelles : jamais comptées comme illisibles. */
  administratives: number;
}

/**
 * Analyse le texte extrait d'un relevé PDF. Contrairement au chemin CSV/
 * Google Sheet (`detecterFormat` + `analyserLignes`, inchangés), chaque
 * ligne n'est pas traitée indépendamment : les lignes administratives sont
 * écartées sans être comptées comme illisibles, et une ligne qui ne
 * commence pas par une date est fusionnée dans le libellé de l'opération
 * précédente plutôt que rejetée.
 */
export function analyserRelevePdf(texte: string): ReleveAnalyse {
  const brutes = texte
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '');

  const periode = analyserPeriodeReleve(brutes);
  const colonnes = detecterColonnesOperations(brutes);
  const lignes: LigneAnalysee[] = [];
  let administratives = 0;
  let derniereOperation: LigneAnalysee | null = null;

  for (let i = 0; i < brutes.length; i++) {
    const brut = brutes[i];

    if (estLigneAdministrative(brut)) {
      administratives++;
      continue;
    }

    const debut = extraireDateDebut(brut, periode);
    if (debut) {
      const analysee = analyserLigneOperation(brut, i + 1, debut.date, debut.reste, colonnes);
      lignes.push(analysee);
      derniereOperation = analysee;
      continue;
    }

    // Ni administrative, ni le début d'une opération : suite d'un libellé
    // qui déborde sur plusieurs lignes.
    if (derniereOperation) {
      derniereOperation.libelle = nettoyerLibelle(`${derniereOperation.libelle} ${brut}`);
    } else {
      administratives++;
    }
  }

  return { lignes, administratives };
}
