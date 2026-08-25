import type { Transaction } from '@budget/core/src/types.ts';

/**
 * Catégorisation automatique par règles sur le libellé marchand.
 *
 * Fonction PURE et testable, au même titre que le moteur : aucune règle
 * n'est codée en dur dans l'interface, toutes viennent de la base et
 * restent modifiables par l'utilisateur.
 *
 * Principe de prudence : une règle propose une catégorie, elle ne valide
 * pas la transaction. `autoValider` existe, mais reste désactivé par défaut
 * — un libellé bancaire est trop instable pour engager les comptes seul.
 */

export type TypeCorrespondance = 'contains' | 'exact' | 'starts_with' | 'regex';

export interface RegleCategorisation {
  id: string;
  motif: string;
  typeCorrespondance: TypeCorrespondance;
  categorieId: string;
  /** Plus petit = appliqué en premier. Départage les motifs concurrents. */
  priorite: number;
  autoValider: boolean;
  active: boolean;
}

/** Normalise pour comparer sans accents, casse ni ponctuation parasite. */
export function normaliser(texte: string): string {
  return texte
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function regleCorrespond(regle: RegleCategorisation, libelle: string): boolean {
  if (!regle.active) return false;
  const cible = normaliser(libelle);
  const motif = normaliser(regle.motif);
  if (motif === '') return false;

  switch (regle.typeCorrespondance) {
    case 'exact':
      return cible === motif;
    case 'starts_with':
      return cible.startsWith(motif);
    case 'regex':
      try {
        return new RegExp(regle.motif, 'i').test(libelle);
      } catch {
        // Une expression invalide ne doit jamais faire tomber un import :
        // elle ne correspond simplement à rien.
        return false;
      }
    case 'contains':
    default:
      return cible.includes(motif);
  }
}

export interface ResultatRegle {
  transaction: Transaction;
  regleAppliquee: RegleCategorisation | null;
}

/**
 * Applique les règles à une transaction.
 * Une transaction DÉJÀ catégorisée n'est jamais réécrite : une décision
 * humaine prime toujours sur une règle automatique.
 */
export function categoriser(
  transaction: Transaction,
  regles: RegleCategorisation[],
): ResultatRegle {
  if (transaction.categorieId !== null) {
    return { transaction, regleAppliquee: null };
  }

  const libelle = transaction.commercant ?? transaction.description ?? '';
  const candidates = [...regles]
    .filter((r) => r.active)
    .sort((a, b) => a.priorite - b.priorite || b.motif.length - a.motif.length);

  for (const regle of candidates) {
    if (regleCorrespond(regle, libelle)) {
      return {
        transaction: {
          ...transaction,
          categorieId: regle.categorieId,
          // La validation automatique reste l'exception, jamais le défaut.
          statut: regle.autoValider ? 'validated' : 'pending',
        },
        regleAppliquee: regle,
      };
    }
  }

  return { transaction, regleAppliquee: null };
}

export interface BilanCategorisation {
  transactions: Transaction[];
  categorisees: number;
  nonCategorisees: number;
  /** Nombre d'applications par règle, pour repérer celles qui ne servent jamais. */
  parRegle: Map<string, number>;
}

export function categoriserLot(
  transactions: Transaction[],
  regles: RegleCategorisation[],
): BilanCategorisation {
  const resultats: Transaction[] = [];
  const parRegle = new Map<string, number>();
  let categorisees = 0;

  for (const t of transactions) {
    const { transaction, regleAppliquee } = categoriser(t, regles);
    resultats.push(transaction);
    if (regleAppliquee) {
      categorisees++;
      parRegle.set(regleAppliquee.id, (parRegle.get(regleAppliquee.id) ?? 0) + 1);
    }
  }

  return {
    transactions: resultats,
    categorisees,
    nonCategorisees: resultats.length - categorisees,
    parRegle,
  };
}

/**
 * Règles fournies au départ. Modifiables et supprimables depuis l'écran
 * Configuration : ce ne sont que des valeurs initiales, pas un socle figé.
 *
 * Attention au piège des motifs trop courts : « TOTAL » attraperait
 * « TOTAL ACCESS » (carburant) aussi bien que « TOTALENERGIES »
 * (électricité). Les motifs par défaut sont donc volontairement longs.
 */
export const REGLES_INITIALES: { motif: string; categorie: string; commentaire?: string }[] = [
  // --- Courses --------------------------------------------------------
  { motif: 'LIDL', categorie: 'Courses' },
  { motif: 'CARREFOUR', categorie: 'Courses' },
  { motif: 'INTERMARCHE', categorie: 'Courses' },
  { motif: 'ALDI', categorie: 'Courses' },
  { motif: 'E.LECLERC', categorie: 'Courses' },
  { motif: 'LECLERC', categorie: 'Courses' },
  { motif: 'AUCHAN', categorie: 'Courses' },
  { motif: 'MONOPRIX', categorie: 'Courses' },
  { motif: 'FRANPRIX', categorie: 'Courses' },
  { motif: 'CASINO', categorie: 'Courses', commentaire: 'Enseigne « Casino » : le motif ne capte pas les jeux d’argent, absents des relevés courants.' },
  { motif: 'PICARD', categorie: 'Courses' },

  // --- Téléphone / Internet --------------------------------------------
  // FREE seul (Freebox) reste Internet ; FREE MOBILE, plus spécifique, est
  // départagé par sa longueur (voir `categoriser` : motif le plus long
  // gagne à priorité égale), donc essayé avant.
  { motif: 'FREE', categorie: 'Internet / TV' },
  { motif: 'FREE MOBILE', categorie: 'Téléphone' },
  { motif: 'SOSH', categorie: 'Téléphone' },
  { motif: 'ORANGE', categorie: 'Téléphone' },
  { motif: 'SFR', categorie: 'Téléphone' },
  { motif: 'BOUYGUES TELECOM', categorie: 'Téléphone' },

  // --- Énergie ----------------------------------------------------------
  { motif: 'EDF', categorie: 'Électricité' },
  { motif: 'ENGIE', categorie: 'Électricité', commentaire: 'Pas de catégorie « Gaz » distincte dans cette configuration.' },
  {
    motif: 'TOTALENERGIES',
    categorie: 'Électricité',
    commentaire: 'Motif complet : « TOTAL » seul attraperait aussi les stations-service.',
  },

  // --- Transport / voiture (stations-service uniquement : voir note ----
  // en bas de fichier pour Uber/SNCF/RATP, volontairement absents) -------
  { motif: 'TOTAL ACCESS', categorie: 'Essence / voiture' },
  { motif: 'ESSO', categorie: 'Essence / voiture' },
  { motif: 'SHELL', categorie: 'Essence / voiture' },
  { motif: 'STATION BP', categorie: 'Essence / voiture', commentaire: '« BP » seul est trop court et trop ambigu pour un motif fiable.' },
  { motif: 'AVIA', categorie: 'Essence / voiture' },

  // --- Santé --------------------------------------------------------
  { motif: 'PHARMACIE', categorie: 'Santé' },
  { motif: 'DOCTOLIB', categorie: 'Santé' },

  // --- Assurance (déjà présent) -----------------------------------------
  { motif: 'CARDIF', categorie: 'Assurance habitation' },

  // --- Abonnements de loisirs numériques ---------------------------------
  // « Divers / achats plaisir » est la catégorie existante la plus proche
  // d’un abonnement de loisir sans y forcer « Sorties / loisirs », qui
  // désigne plutôt des sorties ponctuelles (restaurants, activités).
  { motif: 'NETFLIX', categorie: 'Divers / achats plaisir' },
  { motif: 'SPOTIFY', categorie: 'Divers / achats plaisir' },
  // AMAZON PRIME, APPLE.COM/BILL, GOOGLE, MICROSOFT : volontairement
  // absents. Trop génériques (Google/Microsoft facturent aussi bien des
  // achats ponctuels que des abonnements) ou trop ambigus (Amazon Prime
  // mêle livraison et vidéo) pour un motif fiable — laissés à renseigner
  // plutôt que catégorisés au hasard.
];

/**
 * Règles structurelles volontairement NON créées, et pourquoi.
 *
 * « PRLV SEPA », « VIR »/« VIREMENT », « RETRAIT DAB » et les frais
 * bancaires sont des structures d'opération, pas des enseignes : un
 * prélèvement SEPA peut aller vers n'importe quelle catégorie selon le
 * bénéficiaire, un virement peut être un revenu ou une épargne. Le nettoyage
 * du libellé (`nettoyerCommercant`) retire déjà ces mentions pour faire
 * ressortir le vrai bénéficiaire, qui est alors catégorisé par son propre
 * motif (ex. PAYPAL). Créer une règle sur le motif structurel lui-même
 * produirait de mauvaises catégories en masse plutôt que de vraies
 * correspondances — l'objectif « mieux vaut à renseigner qu'une mauvaise
 * catégorie » l'interdit explicitement.
 *
 * Pour la même raison, PAYPAL n'a pas de règle de catégorie : c'est un
 * intermédiaire de paiement, pas un type de dépense. Le nettoyage du
 * libellé fait déjà ressortir « PAYPAL EUROPE » comme commerçant lisible ;
 * lui attribuer une catégorie serait deviner ce qui a été acheté.
 *
 * « RETRAIT DAB » (retrait espèces) et les frais bancaires n'ont pas de
 * catégorie dédiée dans cette configuration : aucune règle n'est créée
 * pour eux non plus, conformément à la consigne « si aucune catégorie
 * cohérente n'existe, laisser non catégorisé ».
 */

/**
 * Nettoyage d'un libellé bancaire brut, ex. « PRLV SEPA PAYPAL EUROPE
 * S.A.R.L. ... REF/123456 » ou « PAIEMENT CB 04/09 CARREFOUR MARKET 1234 ».
 * Les parties volatiles (mention du moyen de paiement, dates, numéros de
 * carte, références, formes juridiques) changent à chaque opération et ne
 * doivent jamais entrer dans un motif de règle ni dans le commerçant
 * affiché — seuls les mots significatifs sont retenus.
 */
const MOTS_OUTILS = new Set([
  'PAIEMENT', 'PAIMENT', 'CB', 'CARTE', 'ACHAT', 'PRLV', 'PRELEVEMENT',
  'VIREMENT', 'VIRT', 'VIR', 'FACTURE', 'DU', 'DE', 'LE', 'LA', 'SUR', 'DEBIT', 'CREDIT',
  'SEPA', 'RETRAIT', 'DAB', 'ECH', 'REF', 'REFDO', 'REFBEN', 'SARL', 'SAS', 'EURL',
  'COM', 'WWW', 'NET', 'ORG', 'FR', 'FRA', 'HTTP', 'HTTPS',
  // Terminologie propre aux relevés PDF (Hello bank / BNP Paribas) : sens
  // de l'opération, mentions de compte, motif générique — jamais le nom
  // d'un commerçant, vérifié sur un relevé réel.
  'CPTE', 'MOTIF', 'EMIS', 'RECU', 'INSTANT', 'VERS', 'BEN', 'ID', 'MDT', 'LIB', 'EMETTEUR',
]);

/** Fragment de montant collé au libellé (« 29,00EUR »), jamais un mot du commerçant. */
const RESSEMBLE_FRAGMENT_MONTANT = /^\d+(?:[.,]\d+)?EUR?$/;
/** Référence longue (numéro de carte masqué, hachage de transaction...) : mélange chiffres/lettres, jamais lisible. */
const RESSEMBLE_REFERENCE = /^(?=.*\d)(?=.*[A-Z])[A-Z0-9]{10,}$/;

function motsSignificatifs(libelle: string): string[] {
  return normaliser(libelle)
    .split(/[^A-Z0-9]+/)
    .filter((mot) => {
      if (mot.length < 3) return false;
      if (MOTS_OUTILS.has(mot)) return false;
      // Suites de chiffres : dates, numéros de carte, références.
      if (/^\d+$/.test(mot)) return false;
      if (RESSEMBLE_FRAGMENT_MONTANT.test(mot)) return false;
      if (RESSEMBLE_REFERENCE.test(mot)) return false;
      return true;
    });
}

/**
 * Propose un motif de règle à partir d'un libellé bancaire brut.
 *
 * Le résultat reste MODIFIABLE par l'utilisateur avant enregistrement : c'est
 * une proposition, pas une décision.
 */
export function motifDepuisLibelle(libelle: string): string {
  const mots = motsSignificatifs(libelle);
  // Deux mots suffisent presque toujours à identifier une enseigne
  // (« CARREFOUR MARKET »), et restent assez larges pour capter ses variantes.
  const retenus = mots.slice(0, 2).join(' ');
  return retenus !== '' ? retenus : normaliser(libelle).slice(0, 30);
}

/**
 * Nettoie un libellé pour en faire un nom de commerçant lisible, affiché et
 * stocké sur la transaction. Contrairement à `motifDepuisLibelle`, le
 * résultat n'est PAS tronqué à deux mots — un motif de règle doit rester
 * court pour matcher fiablement, un commerçant affiché doit rester
 * reconnaissable dans son intégralité (« BOULANGERIE PAUL SAINT GERMAIN »
 * ne doit pas devenir « BOULANGERIE PAUL »).
 */
export function nettoyerCommercant(libelle: string): string {
  const mots = motsSignificatifs(libelle);
  const retenus = mots.join(' ');
  return retenus !== '' ? retenus : normaliser(libelle).trim();
}
