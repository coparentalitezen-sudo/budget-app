import { useState } from 'react';
import { synthetiserMois, synthetiserSemaine } from '@budget/core/src/budget.ts';
import { periodeDe } from '@budget/core/src/periode.ts';
import { Carte, Jauge, Ligne, Valeur } from '../components/ui.tsx';
import { aujourdhuiISO, montant, moisLong } from '../lib/format.ts';
import { useConfiguration, useTransactions } from '../state/useDonnees.ts';

export function Budget() {
  const { config } = useConfiguration();
  const transactions = useTransactions();
  const [vue, setVue] = useState<'mois' | 'semaine'>('mois');
  const aujourdhui = aujourdhuiISO();
  const periode = periodeDe(aujourdhui);

  const mois = synthetiserMois(config, transactions, periode);
  const semaine = synthetiserSemaine(config, transactions, aujourdhui);

  return (
    <div className="ecran">
      <div className="bascule">
        <button className={vue === 'mois' ? 'actif' : ''} onClick={() => setVue('mois')}>
          Mensuel
        </button>
        <button className={vue === 'semaine' ? 'actif' : ''} onClick={() => setVue('semaine')}>
          Hebdomadaire
        </button>
      </div>

      {vue === 'semaine' ? (
        <Carte titre="Cette semaine">
          <Valeur texte={montant(semaine.disponibleCetteSemaine)} taille="grande" />
          <Ligne libelle="Budget disponible" valeur={montant(semaine.disponibleCetteSemaine)} />
          <Ligne libelle="Déjà dépensé depuis lundi" valeur={montant(semaine.depensesDepuisLundi)} />
          <Ligne libelle="Reste réellement disponible" valeur={montant(semaine.resteReelSemaine)} />
          <Ligne libelle="Jours restants (mois)" valeur={String(semaine.joursRestantsMois)} />
          <p className="note">
            Une semaine à cheval sur deux mois est tronquée : le budget de{' '}
            {moisLong(periode)} ne finance pas le mois suivant.
          </p>
        </Carte>
      ) : (
        <>
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
    </div>
  );
}
