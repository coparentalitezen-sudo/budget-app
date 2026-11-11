import { projeterTousLesObjectifs, repartitionObjectif, repartitionDuMois } from '@budget/core/src/epargne.ts';
import { cibleFondUrgence, depensesEssentielles } from '@budget/core/src/fondUrgence.ts';
import { situationEpargne } from '@budget/core/src/budget.ts';
import { periodeDe } from '@budget/core/src/periode.ts';
import { Carte, Ligne, Valeur } from '../components/ui.tsx';
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

      {objectifs.map((o, i) => (
        <section key={o.objectifId} className={`carte-objectif objectif-teinte-${i % 3}`}>
          <p className="objectif-nom">{o.nom}</p>
          <p className="objectif-cible">{montant(o.objectifTotal)}</p>
          <p className="objectif-date">
            {o.dateAtteinte ? `Atteinte estimée : ${o.dateAtteinte}` : 'Date d’atteinte inconnue'}
          </p>
          {o.progression !== null ? (
            <>
              <p className="objectif-pourcent">{pourcent(o.progression)}</p>
              <div className="objectif-barre" role="progressbar" aria-valuenow={Math.round(o.progression * 100)}>
                <span style={{ width: `${Math.min(100, Math.max(0, o.progression * 100))}%` }} />
              </div>
            </>
          ) : (
            <p className="objectif-note">Solde inconnu : aucune progression ne peut être affichée. Renseignez-le dans Réglages.</p>
          )}
          <div className="objectif-tuiles">
            <div>
              <span>Épargné</span>
              <strong>{montant(o.montantActuel)}</strong>
            </div>
            <div>
              <span>Restant</span>
              <strong>{montant(o.restantAConstituer)}</strong>
            </div>
          </div>
        </section>
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
