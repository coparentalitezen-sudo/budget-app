/**
 * Configuration réelle du foyer, au 23 août 2026.
 *
 * Règle absolue de ce fichier : ce qui n'est pas confirmé vaut `null` et
 * apparaît dans `parametresAConfirmer`. Aucune date, aucun solde, aucun
 * capital n'est inventé pour « faire tourner » un calcul.
 */

import { eur, mensualiser } from '../money.ts';
import type { Configuration } from '../types.ts';

export const CATEGORIES = {
  // Charges fixes
  pretImmobilier: 'cat_pret_immo',
  pretPersonnel: 'cat_pret_perso',
  pretCuisine: 'cat_pret_cuisine',
  impotRevenu: 'cat_impot',
  // Provisions
  taxeFonciere: 'cat_taxe_fonciere',
  assuranceHabitation: 'cat_assurance_habitation',
  assuranceAuto: 'cat_assurance_auto',
  // Variables
  courses: 'cat_courses',
  electricite: 'cat_electricite',
  internet: 'cat_internet',
  telephone: 'cat_telephone',
  essence: 'cat_essence',
  enfants: 'cat_enfants',
  restaurants: 'cat_restaurants',
  sorties: 'cat_sorties',
  sante: 'cat_sante',
  vetements: 'cat_vetements',
  divers: 'cat_divers',
  // Épargne
  epargne: 'cat_epargne',
  // Revenus (catégorisation des transactions de type crédit)
  revenuSalaire: 'cat_revenu_salaire',
  revenuCafAllocations: 'cat_revenu_caf',
  revenuAutres: 'cat_revenu_autres',
} as const;

export const foyer2026: Configuration = {
  comptes: [
    // Soldes à récupérer depuis les comptes / le Google Sheet.
    // `null` = non renseigné : aucune projection de solde n'est produite.
    { id: 'cpt_courant', nom: 'Compte courant', type: 'courant', solde: null },
    { id: 'cpt_provisions', nom: 'Compte provisions', type: 'provisions', solde: null },
    { id: 'cpt_urgence', nom: 'Épargne urgence', type: 'epargne', solde: null },
    { id: 'cpt_vacances', nom: 'Épargne vacances', type: 'epargne', solde: null },
  ],

  categories: [
    { id: CATEGORIES.pretImmobilier, nom: 'Prêt immobilier', nature: 'fixe' },
    { id: CATEGORIES.pretPersonnel, nom: 'Prêt personnel', nature: 'fixe' },
    { id: CATEGORIES.pretCuisine, nom: 'Prêt cuisine', nature: 'fixe' },
    { id: CATEGORIES.impotRevenu, nom: 'Impôt sur le revenu', nature: 'fixe' },
    { id: CATEGORIES.taxeFonciere, nom: 'Taxe foncière', nature: 'provision' },
    { id: CATEGORIES.assuranceHabitation, nom: 'Assurance habitation', nature: 'provision' },
    { id: CATEGORIES.assuranceAuto, nom: 'Assurance auto', nature: 'provision' },

    // Criticité pour le fonds d'urgence.
    { id: CATEGORIES.courses, nom: 'Courses', nature: 'variable', criticite: 'essentielle' },
    { id: CATEGORIES.electricite, nom: 'Électricité', nature: 'variable', criticite: 'essentielle' },
    { id: CATEGORIES.internet, nom: 'Internet / TV', nature: 'variable', criticite: 'essentielle' },
    { id: CATEGORIES.telephone, nom: 'Téléphone', nature: 'variable', criticite: 'essentielle' },
    { id: CATEGORIES.essence, nom: 'Essence / voiture', nature: 'variable', criticite: 'essentielle' },
    { id: CATEGORIES.enfants, nom: 'Enfants / école', nature: 'variable', criticite: 'essentielle' },
    { id: CATEGORIES.restaurants, nom: 'Restaurants', nature: 'variable', criticite: 'non_essentielle' },
    { id: CATEGORIES.sorties, nom: 'Sorties / loisirs', nature: 'variable', criticite: 'non_essentielle' },

    // Ancienne catégorie « Vêtements / santé / divers » scindée en trois.
    { id: CATEGORIES.sante, nom: 'Santé', nature: 'variable', criticite: 'essentielle' },
    { id: CATEGORIES.vetements, nom: 'Vêtements', nature: 'variable', criticite: 'semi_essentielle' },
    { id: CATEGORIES.divers, nom: 'Divers / achats plaisir', nature: 'variable', criticite: 'non_essentielle' },

    { id: CATEGORIES.epargne, nom: 'Épargne', nature: 'epargne' },

    // Revenus. Ne participent à AUCUN calcul (le total des revenus vient de
    // `Transaction.type === 'revenu'`, pas de la catégorie) : uniquement là
    // pour que les transactions de crédit (salaire, CAF, remboursements
    // reçus...) aient une catégorie à proposer, au lieu de rester bloquées
    // sans aucune option cohérente.
    { id: CATEGORIES.revenuSalaire, nom: 'Salaire', nature: 'revenu' },
    { id: CATEGORIES.revenuCafAllocations, nom: 'CAF / Allocations', nature: 'revenu' },
    { id: CATEGORIES.revenuAutres, nom: 'Autres revenus', nature: 'revenu' },
  ],

  revenus: [
    { id: 'rev_salaire', nom: 'Salaire', montant: eur(2719), jour: null },
    { id: 'rev_caf', nom: 'CAF', montant: eur(173.66), jour: null },
    { id: 'rev_allocations', nom: 'Allocation enfants', montant: eur(460.14), jour: null },
  ],

  charges: [
    {
      id: 'chg_immo',
      nom: 'Prêt immobilier',
      montant: eur(1200),
      jour: null,
      categorieId: CATEGORIES.pretImmobilier,
    },
    {
      id: 'chg_perso',
      nom: 'Prêt personnel',
      montant: eur(175.89),
      jour: 4, // confirmé : prochaine échéance le 04/09/2026
      categorieId: CATEGORIES.pretPersonnel,
      fin: '2028-12', // confirmé : échéance finale le 04/12/2028
    },
    {
      id: 'chg_cuisine',
      nom: 'Prêt cuisine',
      montant: eur(189.5),
      jour: null,
      categorieId: CATEGORIES.pretCuisine,
      fin: '2026-09', // confirmé : dernière échéance
    },
    {
      id: 'chg_impot',
      nom: 'Impôt sur le revenu',
      montant: eur(393),
      jour: null,
      categorieId: CATEGORIES.impotRevenu,
      // moisExclus NON renseigné = prélèvement supposé sur 12 mois.
      // Si le prélèvement est en réalité sur 10 mois (août et septembre
      // habituellement non prélevés), renseigner : moisExclus: [8, 9].
      // Impact : +393 € de disponible sur 2 mois de l'année.
    },
  ],

  provisions: [
    {
      id: 'prov_taxe_fonciere',
      nom: 'Taxe foncière (2027 et suivantes)',
      montantAnnuel: eur(1600),
      montantEstime: true, // « environ 1 600 € »
      dotationMensuelle: mensualiser(eur(1600)), // 133,33 €
      // Cette provision finance la taxe foncière 2027 et les suivantes.
      // La taxe foncière 2026, elle, est une échéance exceptionnelle :
      // voir `echeancesExceptionnelles`. Les confondre produirait une
      // dotation de 800 €/mois, sans rapport avec la réalité du budget.
      prochaineEcheance: null, // avis 2027 à recevoir, date à confirmer
      montantProvisionne: null, // solde du compte de provisions inconnu
      jourDotation: null,
    },
    {
      id: 'prov_assurance_habitation',
      nom: 'Assurance habitation',
      montantAnnuel: eur(765.3),
      dotationMensuelle: mensualiser(eur(765.3)), // 63,78 €
      prochaineEcheance: '2027-01-01', // confirmé : échéance principale au 1er janvier
      montantProvisionne: null, // solde du compte de provisions inconnu
      jourDotation: null,
    },
    {
      id: 'prov_assurance_auto',
      nom: 'Assurance auto',
      montantAnnuel: eur(678.13),
      dotationMensuelle: mensualiser(eur(678.13)), // 56,51 €
      prochaineEcheance: null, // date annuelle à confirmer
      montantProvisionne: null, // solde du compte de provisions inconnu
      jourDotation: null,
    },
  ],

  echeancesExceptionnelles: [
    {
      id: 'taxe_fonciere_2026',
      nom: 'Taxe foncière 2026',
      montant: eur(1600),
      montantEstime: true,
      dateEcheance: null, // date de mise en recouvrement à confirmer sur l'avis
      dejaProvisionne: null, // rien de confirmé comme déjà mis de côté
      note:
        'Payée en une fois. La mensualisation demandée après le 30 juin 2026 ne ' +
        'prendrait effet qu’en 2027 : elle ne peut pas résoudre l’échéance 2026.',
    },
  ],

  objectifsEpargne: [
    {
      id: 'obj_urgence',
      nom: 'Fonds d’urgence',
      type: 'urgence',
      // Cible résolue dynamiquement via reglageFondUrgence — jamais figée ici.
      objectifTotal: null,
      montantActuel: null, // solde réel inconnu — surtout pas 0 €
      versementMensuelCible: eur(150),
      priorite: 1,
    },
    {
      id: 'obj_vacances',
      nom: 'Vacances',
      type: 'vacances',
      objectifTotal: null, // budget vacances cible à définir
      montantActuel: null, // solde réel inconnu — surtout pas 0 €
      versementMensuelCible: eur(50),
      priorite: 2,
    },
  ],

  reglageFondUrgence: {
    mode: 'depenses_essentielles',
    nombreDeMois: 3,
    // Référence : octobre 2026, première période représentative du régime
    // durable (prêt cuisine soldé). Sans cela, la cible inclurait une charge
    // qui aura disparu.
    periodeReference: '2026-10',
  },

  reglageTresorerie: {
    // Matelas laissé sur le compte courant avant tout virement d'épargne.
    seuilSecurite: eur(150),
  },

  reglageEpargne: {
    // Objectif THÉORIQUE, jamais abaissé automatiquement. En août et
    // septembre 2026 il restera affiché à 200 € avec un écart de −189,21 €,
    // plutôt que d'être discrètement transformé en 10 €.
    objectif: eur(200),
    plafondsManuels: [],
  },

  credits: [
    {
      id: 'cred_perso',
      nom: 'Prêt personnel',
      capitalRestant: eur(4519.25), // au 23/08/2026
      mensualite: eur(175.89),
      tauxAnnuel: 0.0593,
      dateFinPrevue: '2028-12-04',
    },
    // Prêt immobilier : mensualité 1 200 € connue, mais capital restant,
    // taux et date de fin non fournis -> pas d'objet Credit, donc aucun
    // tableau d'amortissement ni intérêt inventé.
    //
    // Prêt cuisine : capital restant dû NON connu. La mensualité de 189,50 €
    // ne permet PAS d'en déduire le capital (elle inclut des intérêts).
  ],

  budgetVariable: [
    { categorieId: CATEGORIES.courses, montantPrevu: eur(500) },
    { categorieId: CATEGORIES.electricite, montantPrevu: eur(100) },
    { categorieId: CATEGORIES.internet, montantPrevu: eur(60) },
    { categorieId: CATEGORIES.telephone, montantPrevu: eur(15) },
    { categorieId: CATEGORIES.essence, montantPrevu: eur(120) },
    { categorieId: CATEGORIES.enfants, montantPrevu: eur(120) },
    { categorieId: CATEGORIES.restaurants, montantPrevu: eur(90) },
    { categorieId: CATEGORIES.sorties, montantPrevu: eur(70) },
    // Répartition VALIDÉE de l'ancienne catégorie unique de 55 €.
    // Le total du budget variable reste exactement 1 130 €.
    { categorieId: CATEGORIES.sante, montantPrevu: eur(25) },
    { categorieId: CATEGORIES.vetements, montantPrevu: eur(20) },
    { categorieId: CATEGORIES.divers, montantPrevu: eur(10) },
  ],

  parametresAConfirmer: [
    'Soldes réels des comptes courants',
    'Solde réel du fonds d’urgence',
    'Solde réel de l’épargne vacances',
    'Date de versement du salaire',
    'Date de versement de la CAF',
    'Date de versement des allocations enfants',
    'Impôt sur le revenu : calendrier exact (10 ou 12 mois)',
    'Taxe foncière 2026 : montant exact',
    'Taxe foncière 2026 : date exacte / mise en recouvrement',
    'Assurance auto : date d’échéance',
    'Prêt immobilier : capital restant dû',
    'Prêt immobilier : taux',
    'Prêt immobilier : date de fin',
    'Prêt cuisine : capital restant exact',
    'Objectif du budget vacances',
  ],
};
