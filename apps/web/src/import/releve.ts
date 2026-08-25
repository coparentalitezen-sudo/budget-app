import type { Cents } from '@budget/core/src/money.ts';
import { analyserDate, analyserMontant, type LigneAnalysee } from './parseur.ts';
import { normaliser } from './regles.ts';

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
 * Total des mouvements du relevé : imprimé une seule fois, immédiatement
 * après la DERNIÈRE vraie opération, suivi du solde de clôture puis d'un
 * bloc de mentions/frais qui n'a plus rien de transactionnel (voir
 * `estFinDesOperations`, plus bas) — jamais un sous-total intermédiaire sur
 * ce type de relevé (vérifié sur un relevé réel).
 */
const MOTIF_TOTAL_OPERATIONS = /^total\s+(des\s+)?(mouvements|op[ée]rations)/i;

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
  MOTIF_TOTAL_OPERATIONS,
  // Texte commercial / administratif / juridique. Ancré en tout début de
  // ligne : « BNP PARIBAS » apparaît aussi comme émetteur dans de vraies
  // opérations (virement de salaire, intéressement...), où il ne doit
  // jamais faire passer la ligne pour un texte institutionnel (vérifié sur
  // un relevé réel : « VIR SEPA RECU /DE PAIE GROUPE BNP PARIBAS... »).
  /^hello\s*bank/i,
  /^bnp\s*paribas/i,
  /^(retrouvez|suivez)[- ]nous/i,
  /\bcapital\s+de\b/i,
  /\bRCS\b|\bORIAS\b/,
  /^www\.|^https?:\/\//i,
  // Coordonnées / mentions courantes.
  /^t[ée]l\s*:/i,
  /^monnaie\s+du\s+compte/i,
  /co[uû]t\s+d['’]un\s+appel/i,
  /^id\.?\s*ce\s/i,
  // Ligne composée uniquement d'un long code numérique (référence de bas de
  // page, numéro de contrat...), jamais une opération à elle seule.
  /^\d{8,}\s*$/,
];

/**
 * Certains relevés séparent la première lettre d'un mot d'en-tête par une
 * espace parasite (effet de mise en forme du PDF, ex. « D ate », « R ELEVE » —
 * observé sur de vrais relevés Hello bank / BNP Paribas). Les motifs les
 * plus sensibles à ce problème sont retentés sur une version compactée
 * (majuscules, accents et espaces retirés) plutôt que sur le texte brut.
 */
const MOTIFS_COMPACTS: RegExp[] = [
  /^RELEVEDECOMPTE/,
  /^EXTRAITDECOMPTE/,
  /^DATE$/,
  /^DATEVALEUR$/,
  /^VALEUR$/,
  /^NATUREDESOPERATIONS?/,
  /^DEBIT$/,
  /^CREDIT$/,
  /^DEBITCREDIT$/,
  /^TEL:/,
  /^RIB:/,
  /^IBAN:/,
  /^BIC:/,
  /^MONNAIEDUCOMPTE/,
  /^IDCEFR/,
];

export function estLigneAdministrative(ligne: string): boolean {
  const t = ligne.trim();
  if (t === '') return true;
  if (MOTIFS_ADMINISTRATIFS.some((motif) => motif.test(t))) return true;
  const compact = normaliser(t).replace(/\s+/g, '');
  return MOTIFS_COMPACTS.some((motif) => motif.test(compact));
}

/**
 * Certains relevés Hello bank / BNP Paribas ajoutent, après la dernière
 * vraie opération, un bloc de mentions (frais du mois, autorisation de
 * découvert, réclamations...) puis parfois plusieurs pages d'« Information
 * préalable en matière de frais bancaires » — un texte explicatif imprimé
 * avec UNE espace entre CHAQUE lettre (« S i vo u s ê te s ... »), et même
 * un simulacre de tableau de frais qui ressemble à des opérations. Aucun
 * motif ligne à ligne ne peut suivre cette mise en forme de façon fiable —
 * vérifié sur un relevé réel, où tout ce bloc se retrouvait fusionné dans
 * le libellé de la toute dernière opération. Le total des mouvements,
 * imprimé une seule fois juste après la dernière vraie opération (voir
 * `MOTIF_TOTAL_OPERATIONS`), en marque le début de façon fiable même
 * lorsque le bloc de mentions ne commence pas explicitement par
 * « Information préalable ». Une fois ce début repéré, tout ce qui suit est
 * écarté sans y regarder de plus près : ce n'est plus un relevé de compte à
 * cet endroit.
 */
function estFinDesOperations(ligne: string): boolean {
  const t = ligne.trim();
  if (MOTIF_TOTAL_OPERATIONS.test(t)) return true;
  const compact = normaliser(t).replace(/\s+/g, '');
  return compact.startsWith('INFORMATIONPREALABLE');
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

/**
 * Un champ « JJ.MM » ou « JJ/MM » est presque toujours une date de valeur —
 * une deuxième date imprimée à côté de la date d'opération, courante chez
 * Hello bank / BNP Paribas — jamais un montant, même si sa forme numérique
 * (« 16.06 ») passerait par erreur la validation d'un montant (16,06 €).
 */
const RESSEMBLE_DATE_VALEUR = /^\d{1,2}[./]\d{1,2}$/;

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
  const champsBruts = reste.replace(/^\t/, '').split('\t').map((c) => c.trim());

  // Un signe « - » ou « + » isolé dans son propre champ (l'extraction PDF y
  // a inséré une tabulation à cause d'un espacement de police entre le
  // signe et le chiffre) doit être recollé au champ suivant AVANT toute
  // analyse. Sans ce recollage, un débit noté « -45,20 » perdrait son signe
  // au profit du champ voisin, lu comme un montant positif — un débit
  // afficherait alors « + » comme un crédit.
  const champs: string[] = [];
  for (let i = 0; i < champsBruts.length; i++) {
    if ((champsBruts[i] === '-' || champsBruts[i] === '+') && i + 1 < champsBruts.length) {
      champs.push(champsBruts[i] + champsBruts[i + 1]);
      i++;
    } else {
      champs.push(champsBruts[i]);
    }
  }

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
  } else {
    // Pas d'entête retrouvée : la position seule ne permet PAS de distinguer
    // débit et crédit sur ce type de relevé (une seule position est
    // partagée par les deux, l'autre étant toujours vide — vérifié sur un
    // relevé réel). On écarte d'abord les champs qui ressemblent à une date
    // de valeur, puis on prend le DERNIER champ restant qui s'analyse comme
    // un montant valide ; tout le reste forme le libellé. Le sens
    // définitif (débit/crédit) est déterminé après coup par mots-clés, voir
    // `ajusterSensParMotsCles`.
    const champsUtiles = champs.filter((c) => !RESSEMBLE_DATE_VALEUR.test(c));
    let indexMontant = -1;
    for (let i = champsUtiles.length - 1; i >= 0; i--) {
      if (analyserMontant(champsUtiles[i]) !== null) {
        indexMontant = i;
        break;
      }
    }
    if (indexMontant >= 0) {
      const brutMontant = analyserMontant(champsUtiles[indexMontant])!;
      montant = Math.abs(brutMontant);
      // Un montant non signé (l'écrasante majorité sur ce type de relevé,
      // où débit et crédit partagent la même position) est présumé débit
      // par défaut — c'est le mot-clé (ÉMIS/REÇU...) qui tranchera ensuite
      // pour les crédits non signés ; un signe négatif explicite reste de
      // toute façon un débit.
      sens = 'debit';
      libelle = champsUtiles.filter((_, i) => i !== indexMontant).join(' ').trim();
    } else if (champsUtiles.length > 0) {
      libelle = champsUtiles.join(' ').trim();
    }

    if (montant === null) {
      // Dernier repli : le texte brut n'a même pas pu être découpé en
      // champs exploitables (pas de tabulation). On cherche le dernier
      // nombre de la ligne, en écartant une éventuelle date de valeur.
      const m = MONTANT_FIN_LIGNE.exec(reste.trimEnd());
      if (m && !RESSEMBLE_DATE_VALEUR.test(m[1].trim())) {
        const brutMontant = analyserMontant(m[1]);
        if (brutMontant !== null) {
          montant = Math.abs(brutMontant);
          sens = 'debit';
          libelle = reste.slice(0, m.index);
        }
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

  // Ligne de suite pas encore rattachée à une opération. Sur certains
  // relevés (vérifié sur un relevé réel Hello bank), le libellé d'une
  // opération qui déborde sur plusieurs lignes commence AVANT sa propre
  // ligne date+montant, qui ne porte alors aucun texte à elle seule — la
  // mise en page centre la ligne date/montant au milieu d'un libellé
  // multi-lignes plutôt qu'au-dessus. On ne rattache donc une ligne de
  // suite à l'opération précédente qu'après avoir vérifié que la ligne
  // suivante n'est pas justement le début (sans libellé propre) de
  // l'opération à laquelle elle appartient réellement.
  let enAttente: string | null = null;
  const rattacherEnAttente = () => {
    if (enAttente === null) return;
    if (derniereOperation) {
      derniereOperation.libelle = nettoyerLibelle(`${derniereOperation.libelle} ${enAttente}`);
    } else {
      administratives++;
    }
    enAttente = null;
  };

  for (let i = 0; i < brutes.length; i++) {
    const brut = brutes[i];

    if (estFinDesOperations(brut)) {
      // Tout ce qui suit (parfois plusieurs pages) n'est plus une
      // opération : voir la documentation de la fonction. La ligne en
      // attente est d'abord rattachée normalement — elle appartient
      // légitimement à la dernière VRAIE opération, rencontrée avant cette
      // section.
      rattacherEnAttente();
      administratives += brutes.length - i;
      break;
    }

    if (estLigneAdministrative(brut)) {
      rattacherEnAttente();
      administratives++;
      continue;
    }

    const debut = extraireDateDebut(brut, periode);
    if (debut) {
      const analysee = analyserLigneOperation(brut, i + 1, debut.date, debut.reste, colonnes);
      if (analysee.libelle === '' && enAttente !== null) {
        // Cette opération n'a pas de libellé propre : la ligne en attente
        // la décrit, elle n'appartient pas à l'opération précédente.
        analysee.libelle = nettoyerLibelle(enAttente);
        enAttente = null;
      } else {
        rattacherEnAttente();
      }
      lignes.push(analysee);
      derniereOperation = analysee;
      continue;
    }

    // Ni administrative, ni le début d'une opération : suite d'un libellé
    // qui déborde sur plusieurs lignes — mise en attente (voir ci-dessus).
    rattacherEnAttente();
    enAttente = brut;
  }
  rattacherEnAttente();

  // La position ne distingue pas débit et crédit quand aucune entête n'a
  // été retrouvée (voir `analyserLigneOperation`) : les mots-clés SEPA
  // standards (ÉMIS/REÇU...) tranchent après coup. Laissé de côté quand une
  // entête a été détectée : la position y est déjà fiable (protégée par les
  // tests sur la colonne Solde), un mot-clé fortuit dans un libellé ne doit
  // pas la contredire.
  if (colonnes === null) ajusterSensParMotsCles(lignes);

  return { lignes, administratives };
}

/**
 * Sur un relevé sans entête de colonnes exploitable, débit et crédit
 * partagent une seule position de champ (l'autre est toujours vide) : la
 * position ne permet jamais de trancher. La terminologie SEPA « ÉMIS »
 * (envoyé) / « REÇU » (reçu), commune à toutes les banques françaises, et
 * le type d'opération (achat carte, prélèvement, remboursement) sont le
 * seul signal fiable — vérifié mot pour mot sur un relevé réel.
 */
function ajusterSensParMotsCles(lignes: LigneAnalysee[]): void {
  for (const l of lignes) {
    if (l.montant === null) continue;
    const t = l.libelle.toUpperCase();
    if (/\bRECU\b/.test(t) || /\bREMBOURST\b/.test(t) || /\bREMBOURSEMENT\b/.test(t)) {
      l.sens = 'credit';
    } else if (/\bEMIS\b/.test(t) || (t.includes('FACTURE') && t.includes('CARTE')) || /\bPRLV\b/.test(t)) {
      l.sens = 'debit';
    }
  }
}
