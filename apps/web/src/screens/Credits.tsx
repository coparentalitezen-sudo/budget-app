import { useState } from 'react';
import { simulerRemboursementAnticipe, synthetiserCredit } from '@budget/core/src/credits.ts';
import { eur } from '@budget/core/src/money.ts';
import { Carte, Jauge, Ligne, Vide } from '../components/ui.tsx';
import { montant, pourcent } from '../lib/format.ts';
import { useConfiguration } from '../state/useDonnees.ts';

const SIMULATIONS = [25, 50, 100];

export function Credits() {
  const { config } = useConfiguration();
  const [supplement, setSupplement] = useState(50);

  return (
    <div className="ecran">
      {config.credits.length === 0 && <Vide message="Aucun crédit modélisé." />}

      {config.credits.map((credit) => {
        const s = synthetiserCredit(credit);
        const sim = simulerRemboursementAnticipe(credit, {
          mensualiteSupplementaire: eur(supplement),
        });
        return (
          <Carte key={credit.id} titre={credit.nom}>
            {s.progression !== null && <Jauge ratio={s.progression} seuil={1} />}
            <Ligne libelle="Capital restant dû" valeur={montant(s.capitalRestant)} />
            <Ligne libelle="Mensualité" valeur={montant(s.mensualite)} />
            <Ligne libelle="Échéances restantes" valeur={String(s.echeancesRestantes)} />
            <Ligne libelle="Intérêts restants" valeur={montant(s.interetsRestants)} />
            <Ligne libelle="Coût total restant" valeur={montant(s.coutTotalRestant)} />
            <Ligne libelle="Progression" valeur={pourcent(s.progression)} />
            {credit.dateFinPrevue && (
              <Ligne libelle="Fin prévue" valeur={credit.dateFinPrevue} />
            )}

            <div className="bascule">
              {SIMULATIONS.map((v) => (
                <button
                  key={v}
                  className={supplement === v ? 'actif' : ''}
                  onClick={() => setSupplement(v)}
                >
                  +{v} €/mois
                </button>
              ))}
            </div>
            <Ligne libelle="Mois gagnés" valeur={String(sim.moisGagnes)} />
            <Ligne
              libelle="Intérêts économisés"
              valeur={montant(sim.economieInterets)}
              ton="positif"
            />
            <p className="note">
              Les indemnités de remboursement anticipé ne sont pas modélisées : elles
              dépendent du contrat et doivent être vérifiées auprès de l’organisme.
            </p>
          </Carte>
        );
      })}

      <Carte titre="Crédits non modélisés">
        <p className="note">
          Le prêt immobilier (1 200 €/mois) et le prêt cuisine (189,50 €/mois) sont
          budgétés comme charges, mais sans capital restant dû connu aucun tableau
          d’amortissement n’est calculé. Une mensualité ne permet pas d’en déduire le
          capital : elle inclut des intérêts.
        </p>
      </Carte>
    </div>
  );
}
