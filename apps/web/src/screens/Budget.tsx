import type { ReactNode } from 'react';
import { useState } from 'react';
import { synthetiserMois, synthetiserSemaine } from '@budget/core/src/budget.ts';
import { categoriesDuMois, comparerLignes } from '@budget/core/src/comparaison.ts';
import { ajouterMois, periodeDe } from '@budget/core/src/periode.ts';
import type { Configuration, Transaction } from '@budget/core/src/types.ts';
import { Carte, Jauge, Ligne, Valeur, Vide } from '../components/ui.tsx';
import { aujourdhuiISO, montant, montantSigne, moisLong } from '../lib/format.ts';
import { useConfiguration, useTransactions } from '../state/useDonnees.ts';

export function Budget() {
  const { config } = useConfiguration();
  const transactions = useTransactions();
  const [vue, setVue] = useState<'mois' | 'semaine' | 'comparaison'>('mois');
  const aujourdhui = aujourdhuiISO();
  const periodeCourante = periodeDe(aujourdhui);

  // Décalage en mois par rapport au mois courant : 0 = ce mois-ci, -1 = le
  // mois dernier... Partagé entre les vues « Mensuel » et « Comparaison »
  // pour naviguer une seule fois. Plafonné à 0 : voir le futur n'a pas de
  // sens ici, aucune transaction ne peut encore y exister.
  const [decalage, setDecalage] = useState(0);
  const periode = ajouterMois(periodeCourante, decalage);
  const estMoisCourant = decalage === 0;

  const mois = synthetiserMois(config, transactions, periode);
  const semaine = synthetiserSemaine(config, transactions, aujourdhui);

  const naviguer = (
    <div className="navigateur-mois">
      <button
        className="navigateur-fleche"
        onClick={() => setDecalage((d) => d - 1)}
        aria-label="Mois précédent"
      >
        ‹
      </button>
      <span className="navigateur-libelle">{moisLong(periode)}</span>
      <button
        className="navigateur-fleche"
        onClick={() => setDecalage((d) => Math.min(0, d + 1))}
        disabled={estMoisCourant}
        aria-label="Mois suivant"
      >
        ›
      </button>
      {!estMoisCourant && (
        <button className="lien navigateur-retour" onClick={() => setDecalage(0)}>
          Revenir à ce mois-ci
        </button>
      )}
    </div>
  );

  return (
    <div className="ecran">
      <div className="bascule">
        <button className={vue === 'mois' ? 'actif' : ''} onClick={() => setVue('mois')}>
          Mensuel
        </button>
        <button className={vue === 'semaine' ? 'actif' : ''} onClick={() => setVue('semaine')}>
          Hebdomadaire
        </button>
        <button className={vue === 'comparaison' ? 'actif' : ''} onClick={() => setVue('comparaison')}>
          Comparaison
        </button>
      </div>

      {vue === 'semaine' && (
        <Carte titre="Cette semaine">
          <Valeur texte={montant(semaine.disponibleCetteSemaine)} taille="grande" />
          <Ligne libelle="Budget disponible" valeur={montant(semaine.disponibleCetteSemaine)} />
          <Ligne libelle="Déjà dépensé depuis lundi" valeur={montant(semaine.depensesDepuisLundi)} />
          <Ligne libelle="Reste réellement disponible" valeur={montant(semaine.resteReelSemaine)} />
          <Ligne libelle="Jours restants (mois)" valeur={String(semaine.joursRestantsMois)} />
          <p className="note">
            Une semaine à cheval sur deux mois est tronquée : le budget de{' '}
            {moisLong(periodeCourante)} ne finance pas le mois suivant.
          </p>
        </Carte>
      )}

      {vue === 'mois' && (
        <>
          {naviguer}

          <Carte titre={`Synthèse — ${moisLong(periode)}`}>
            <Ligne libelle="Revenus prévus" valeur={montant(mois.revenusPrevus)} />
            <Ligne libelle="Charges fixes" valeur={montant(mois.chargesFixes)} />
            <Ligne libelle="Dotations provisions" valeur={montant(mois.provisions)} />
            <Ligne libelle="Enveloppes variables" valeur={montant(mois.budgetVariable)} />
            <Ligne libelle="Dépensé" valeur={montant(mois.depensesVariables)} />
            <Ligne
              libelle="Reste à dépenser"
              valeur={montant(mois.resteADepenser)}
              ton={mois.resteADepenser >= 0 ? 'positif' : 'negatif'}
            />
          </Carte>

          {mois.categories.map((c) => (
            <Carte key={c.categorieId}>
              <div className="categorie-tete">
                <span>{c.nom}</span>
                <span className={c.pourcentage > 1 ? 'ton-negatif' : ''}>
                  {montant(c.depense)} / {montant(c.prevu)}
                </span>
              </div>
              <Jauge ratio={c.pourcentage} />
              <div className="categorie-pied">
                <span>{Math.round(c.pourcentage * 100)} % consommés</span>
                <span className={c.restant < 0 ? 'ton-negatif' : ''}>
                  {c.restant < 0 ? 'Dépassement ' : 'Restant '}
                  {montant(Math.abs(c.restant))}
                </span>
              </div>
              {c.pourcentage >= 1 && (
                <p className="note note-attention">
                  {c.pourcentage > 1 ? 'Enveloppe dépassée.' : 'Enveloppe épuisée.'}
                </p>
              )}
              {c.pourcentage >= 0.8 && c.pourcentage < 1 && (
                <p className="note">Seuil de vigilance à 80 % atteint.</p>
              )}
            </Carte>
          ))}
        </>
      )}

      {vue === 'comparaison' && (
        <Comparaison config={config} transactions={transactions} periode={periode} naviguer={naviguer} />
      )}
    </div>
  );
}

/**
 * Compare le mois affiché au mois précédent, catégorie par catégorie —
 * uniquement du réalisé (voir `categoriesDuMois`), jamais du prévisionnel :
 * comparer un budget prévu à un budget prévu ne dit rien de ce qui s'est
 * vraiment passé.
 */
function Comparaison({
  config,
  transactions,
  periode,
  naviguer,
}: {
  config: Configuration;
  transactions: Transaction[];
  periode: string;
  naviguer: ReactNode;
}) {
  const periodePrecedente = ajouterMois(periode, -1);
  const actuel = categoriesDuMois(config, transactions, periode);
  const precedent = categoriesDuMois(config, transactions, periodePrecedente);

  const revenus = comparerLignes(actuel.revenus, precedent.revenus);
  const depenses = comparerLignes(actuel.depenses, precedent.depenses);

  return (
    <>
      {naviguer}
      <p className="note">
        {moisLong(periode)} face à {moisLong(periodePrecedente)} — uniquement ce qui a été
        réellement encaissé ou décaissé, catégorie par catégorie.
      </p>

      <Carte titre="Revenus par catégorie">
        {revenus.length === 0 && <Vide message="Aucun revenu sur ces deux mois." />}
        {revenus.map((l) => (
          <LigneComparaison key={l.categorieId ?? '__non_categorise__'} ligne={l} favorable="hausse" />
        ))}
      </Carte>

      <Carte titre="Dépenses par catégorie">
        {depenses.length === 0 && <Vide message="Aucune dépense sur ces deux mois." />}
        {depenses.map((l) => (
          <LigneComparaison key={l.categorieId ?? '__non_categorise__'} ligne={l} favorable="baisse" />
        ))}
      </Carte>
    </>
  );
}

function LigneComparaison({
  ligne,
  favorable,
}: {
  ligne: { nom: string; actuel: number; precedent: number; delta: number };
  /** Le sens d'évolution considéré comme une bonne nouvelle. */
  favorable: 'hausse' | 'baisse';
}) {
  const bonneNouvelle = favorable === 'hausse' ? ligne.delta >= 0 : ligne.delta <= 0;
  const ton = ligne.delta === 0 ? '' : bonneNouvelle ? 'ton-positif' : 'ton-negatif';

  return (
    <div className="comparaison-ligne">
      <div className="comparaison-tete">
        <span className="comparaison-nom">{ligne.nom}</span>
        <span className={`comparaison-delta ${ton}`}>{montantSigne(ligne.delta)}</span>
      </div>
      <div className="comparaison-pied">
        <span>{montant(ligne.actuel)} ce mois-ci</span>
        <span>{montant(ligne.precedent)} le mois dernier</span>
      </div>
    </div>
  );
}
