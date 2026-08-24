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
  { motif: 'LIDL', categorie: 'Courses' },
  { motif: 'CARREFOUR', categorie: 'Courses' },
  { motif: 'INTERMARCHE', categorie: 'Courses' },
  { motif: 'FREE', categorie: 'Internet / TV' },
  {
    motif: 'TOTALENERGIES',
    categorie: 'Électricité',
    commentaire: 'Motif complet : « TOTAL » seul attraperait aussi les stations-service.',
  },
  { motif: 'EDF', categorie: 'Électricité' },
  { motif: 'BOUYGUES TELECOM', categorie: 'Téléphone' },
  { motif: 'CARDIF', categorie: 'Assurance habitation' },
  { motif: 'TOTAL ACCESS', categorie: 'Essence / voiture' },
  { motif: 'PHARMACIE', categorie: 'Santé' },
];

/**
 * Propose un motif de règle à partir d'un libellé bancaire brut.
 *
 * Un libellé de relevé ressemble à « PAIEMENT CB 04/09 CARREFOUR MARKET 1234 ».
 * L'utiliser tel quel comme motif `contains` produirait une règle qui ne
 * correspondrait plus jamais : la date et le numéro de carte changent à chaque
 * opération. On retire donc les parties volatiles et on garde les mots
 * significatifs.
 *
 * Le résultat reste MODIFIABLE par l'utilisateur avant enregistrement : c'est
 * une proposition, pas une décision.
 */
const MOTS_OUTILS = new Set([
  'PAIEMENT', 'PAIMENT', 'CB', 'CARTE', 'ACHAT', 'PRLV', 'PRELEVEMENT',
  'VIREMENT', 'VIR', 'FACTURE', 'DU', 'DE', 'LE', 'LA', 'DEBIT', 'CREDIT',
  'SEPA', 'RETRAIT', 'DAB', 'ECH', 'REF',
]);

export function motifDepuisLibelle(libelle: string): string {
  const mots = normaliser(libelle)
    .split(/[^A-Z0-9]+/)
    .filter((mot) => {
      if (mot.length < 3) return false;
      if (MOTS_OUTILS.has(mot)) return false;
      // Suites de chiffres : dates, numéros de carte, références.
      if (/^\d+$/.test(mot)) return false;
      return true;
    });

  // Deux mots suffisent presque toujours à identifier une enseigne
  // (« CARREFOUR MARKET »), et restent assez larges pour capter ses variantes.
  const retenus = mots.slice(0, 2).join(' ');
  return retenus !== '' ? retenus : normaliser(libelle).slice(0, 30);
}
