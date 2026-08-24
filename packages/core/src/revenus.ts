import { somme, type Cents } from './money.ts';
import { normaliser } from './texte.ts';
import { comparerPeriodes, periodeDe, type Periode } from './periode.ts';
import type { Configuration, Transaction } from './types.ts';

/**
 * Répartition des revenus par source.
 *
 * Deux régimes, jamais mélangés :
 *  - `realise` : au moins une transaction de revenu existe sur la période,
 *    on répartit ce qui est réellement entré ;
 *  - `prevu`   : aucune transaction de revenu n'a encore été saisie ou
 *    importée, on répartit les revenus récurrents attendus.
 *
 * Le champ `base` dit lequel s'applique, pour que l'interface l'affiche.
 * Sans lui, un mois sans import montrerait des revenus à zéro — ce qui
 * serait faux : « pas encore saisi » n'est pas « pas perçu ».
 *
 * Un revenu réalisé qui ne se rattache à aucune source connue va dans une
 * ligne « Non identifié ». Il n'est ni écarté, ni réparti d'office sur les
 * autres sources.
 */

export interface LigneRevenu {
  /** `null` pour la ligne « Non identifié ». */
  sourceId: string | null;
  nom: string;
  montant: Cents;
  /** Fraction du total, entre 0 et 1. */
  part: number;
}

export interface RepartitionRevenus {
  base: 'realise' | 'prevu';
  total: Cents;
  lignes: LigneRevenu[];
  /** true si une part des revenus n'a pas pu être rattachée à une source. */
  comporteNonIdentifie: boolean;
}

const actifSur = (element: { debut?: Periode; fin?: Periode }, p: Periode): boolean => {
  if (element.debut && comparerPeriodes(p, element.debut) < 0) return false;
  if (element.fin && comparerPeriodes(p, element.fin) > 0) return false;
  return true;
};

export function repartitionRevenus(
  config: Configuration,
  transactions: Transaction[],
  p: Periode,
): RepartitionRevenus {
  const sources = config.revenus.filter((r) => actifSur(r, p));

  const encaissements = transactions.filter(
    (t) => periodeDe(t.date) === p && t.type === 'revenu',
  );

  /* --- Aucun encaissement enregistré : on montre le prévisionnel ------ */
  if (encaissements.length === 0) {
    const total = somme(sources.map((r) => r.montant));
    return {
      base: 'prevu',
      total,
      lignes:
        total === 0
          ? []
          : sources.map((r) => ({
              sourceId: r.id,
              nom: r.nom,
              montant: r.montant,
              part: r.montant / total,
            })),
      comporteNonIdentifie: false,
    };
  }

  /* --- Rattachement des encaissements aux sources connues ------------- */
  const parSource = new Map<string, Cents>();
  let nonIdentifie = 0;

  for (const t of encaissements) {
    const libelle = normaliser(`${t.commercant ?? ''} ${t.description ?? ''}`);

    // 1. Rattachement par libellé : le nom de la source y apparaît.
    let source = sources.find((r) => libelle.includes(normaliser(r.nom)));

    // 2. À défaut, par montant exact — un salaire tombe au centime près.
    if (!source) source = sources.find((r) => r.montant === t.montant);

    if (source) {
      parSource.set(source.id, (parSource.get(source.id) ?? 0) + t.montant);
    } else {
      nonIdentifie += t.montant;
    }
  }

  const total = somme([...parSource.values()]) + nonIdentifie;

  const lignes: LigneRevenu[] = sources
    .filter((r) => parSource.has(r.id))
    .map((r) => {
      const montant = parSource.get(r.id)!;
      return { sourceId: r.id, nom: r.nom, montant, part: montant / total };
    });

  if (nonIdentifie > 0) {
    lignes.push({
      sourceId: null,
      nom: 'Non identifié',
      montant: nonIdentifie,
      part: nonIdentifie / total,
    });
  }

  return {
    base: 'realise',
    total,
    lignes,
    comporteNonIdentifie: nonIdentifie > 0,
  };
}
