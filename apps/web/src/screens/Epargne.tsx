import { projeterTousLesObjectifs, repartitionObjectif, repartitionDuMois } from '@budget/core/src/epargne.ts';
import { cibleFondUrgence, depensesEssentielles } from '@budget/core/src/fondUrgence.ts';
import { situationEpargne } from '@budget/core/src/budget.ts';
import { periodeDe } from '@budget/core/src/periode.ts';
import { Carte, Jauge, Ligne, Valeur } from '../components/ui.tsx';
import { aujourdhuiISO, montant, pourcent } from '../lib/format.ts';
import { useConfiguration } from '../state/useDonnees.ts';

export function Epargne() {
  const { config } = useConfiguration();
  const periode = periodeDe(aujourdhuiISO());

  const epargne = situationEpargne(config, periode);
  const objectifs = projeterTousLesObjectifs(config, periode);
  const cible = cibleFondUrgence(config, periode);
  const essentielles = depensesEssentielles(
    config,
    cible.periodeReference ?? periode,
    config.reglageFondUrgence.mode === 'depenses_essentielles'
      ? (config.reglageFondUrgence.inclureSemiEssentielles ?? false)
      : false,
  );
  const repartitionCible = repartitionObjectif(config, periode);
  const repartitionReelle = repartitionDuMois(config, periode);

  return (
    <div className="ecran">
      <Carte titre="Objectif mensuel">
        <Valeur texte={montant(epargne.objectifEpargne)} taille="grande" />
        <Ligne libelle="Capacité budgétaire" valeur={montant(epargne.capaciteEpargneBudgetaire)} />
        <Ligne
          libelle="Écart"
          valeur={montant(epargne.ecartObjectif)}
          ton={epargne.atteignable ? 'positif' : 'negatif'}
        />
        <Ligne libelle="Versement autorisé" valeur={montant(epargne.versementBudgetaire)} />
        <div className="colonnes">
          <div>
            <p className="duo-libelle">Répartition cible</p>
            {repartitionCible.map((r) => (
              <Ligne key={r.objectifId} libelle={r.nom} valeur={montant(r.montant)} />
            ))}
          </div>
          <div>
            <p className="duo-libelle">Répartition réelle</p>
            {repartitionReelle.map((r) => (
              <Ligne key={r.objectifId} libelle={r.nom} valeur={montant(r.montant)} />
            ))}
          </div>
        </div>
      </Carte>

      {objectifs.map((o) => (
        <Carte key={o.objectifId} titre={o.nom}>
          {o.progression !== null ? (
            <Jauge ratio={o.progression} seuil={1} />
          ) : (
            <p className="note">Solde inconnu : aucune progression ne peut être affichée.</p>
          )}
          <Ligne libelle="Cible" valeur={montant(o.objectifTotal)} />
          <Ligne libelle="Solde constitué" valeur={montant(o.montantActuel)} />
          <Ligne libelle="Reste à constituer" valeur={montant(o.restantAConstituer)} />
          <Ligne libelle="Progression" valeur={pourcent(o.progression)} />
          <Ligne
            libelle="Date d’atteinte estimée"
            valeur={o.dateAtteinte ?? 'Inconnu'}
          />
        </Carte>
      ))}

      <Carte titre="Calcul de la cible du fonds d’urgence">
        <p className="note">{cible.explication}</p>
        <Ligne libelle="Charges fixes" valeur={montant(essentielles.chargesFixes)} />
        <Ligne libelle="Provisions" valeur={montant(essentielles.provisions)} />
        <Ligne
          libelle="Enveloppes essentielles"
          valeur={montant(essentielles.enveloppesEssentielles)}
        />
        <Ligne libelle="Base mensuelle" valeur={montant(cible.baseMensuelle)} />
        <Ligne libelle="Cible retenue" valeur={montant(cible.cible)} />
        <p className="note">
          Retenues : {essentielles.categoriesRetenues.join(', ')}.
        </p>
        <p className="note">Exclues : {essentielles.categoriesExclues.join(', ')}.</p>
        {essentielles.categoriesNonClassees.length > 0 && (
          <p className="note note-attention">
            Non classées, donc exclues du calcul :{' '}
            {essentielles.categoriesNonClassees.join(', ')}.
          </p>
        )}
      </Carte>
    </div>
  );
}
