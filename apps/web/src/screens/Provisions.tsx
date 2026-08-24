import { etatProvisions } from '@budget/core/src/provisions.ts';
import { analyserEcheances, mensualisationPossiblePour } from '@budget/core/src/echeances.ts';
import { Carte, Etiquette, Ligne } from '../components/ui.tsx';
import { aujourdhuiISO, montant } from '../lib/format.ts';
import { useConfiguration } from '../state/useDonnees.ts';

const LIBELLE_FAISABILITE: Record<string, string> = {
  faisable: 'Faisable',
  insuffisant: 'Insuffisant',
  indetermine: 'Indéterminé',
  a_verifier: 'À vérifier',
};

export function Provisions() {
  const { config } = useConfiguration();
  const aujourdhui = aujourdhuiISO();
  const provisions = etatProvisions(config.provisions, aujourdhui);
  const echeances = analyserEcheances(config, aujourdhui);
  const annee = Number(aujourdhui.slice(0, 4));

  return (
    <div className="ecran">
      <Carte titre="Provisions mensuelles">
        <p className="note">
          Une provision prépare une charge annuelle <strong>future</strong>. Ce n’est
          pas de l’épargne : un virement vers le compte de provisions n’alimente
          jamais la jauge de l’objectif de 200 €.
        </p>
      </Carte>

      {provisions.map((p) => (
        <Carte key={p.provisionId} titre={p.nom}>
          <Ligne libelle="Dotation mensuelle" valeur={montant(p.dotationMensuelle)} />
          <Ligne
            libelle="Montant annuel"
            valeur={`${montant(p.montantAnnuel)}${p.montantEstime ? ' (estimé)' : ''}`}
          />
          <Ligne libelle="Déjà provisionné" valeur={montant(p.montantProvisionne)} />
          <Ligne libelle="Restant à provisionner" valeur={montant(p.restantAProvisionner)} />
          <Ligne libelle="Prochaine échéance" valeur={p.prochaineEcheance ?? 'Inconnu'} />
          <div className="transaction-meta">
            {p.couverte === null && <Etiquette ton="attente">Couverture indéterminée</Etiquette>}
            {p.couverte === true && <Etiquette ton="ok">Couverte</Etiquette>}
            {p.couverte === false && <Etiquette ton="doublon">Insuffisante</Etiquette>}
          </div>
          {p.couverte === null && (
            <p className="note">
              Sans date d’échéance et sans montant déjà provisionné, la couverture ne
              peut pas être vérifiée. Elle n’est pas pour autant présumée suffisante.
            </p>
          )}
          {p.couverte === false && (
            <p className="note note-attention">
              Manquera {montant(p.deficitPrevisionnel)}. Dotation requise :{' '}
              {montant(p.dotationRequise)}/mois.
            </p>
          )}
        </Carte>
      ))}

      {echeances.map((e) => (
        <Carte key={e.echeanceId} titre={e.nom}>
          <Ligne
            libelle="Montant"
            valeur={`${montant(e.montant)}${e.montantEstime ? ' (estimé)' : ''}`}
          />
          <Ligne libelle="Date d’échéance" valeur={e.dateEcheance ?? 'À confirmer'} />
          <Ligne libelle="Déjà mis de côté" valeur={montant(e.dejaProvisionne)} />
          <Ligne libelle="Reste à décaisser" valeur={montant(e.resteADecaisser)} />
          {e.baseEstBorneSuperieure && (
            <p className="note">
              Montant déjà mis de côté inconnu : les scénarios sont chiffrés sur{' '}
              {montant(e.baseFinancement)} au plus.
            </p>
          )}
          {e.note && <p className="note note-attention">{e.note}</p>}

          <p className="duo-libelle">Scénarios de financement</p>
          {e.scenarios.map((s) => (
            <div key={s.id} className="scenario">
              <div className="scenario-tete">
                <span>{s.libelle}</span>
                <Etiquette ton={s.faisabilite}>{LIBELLE_FAISABILITE[s.faisabilite]}</Etiquette>
              </div>
              <p className="alerte-detail">{s.detail}</p>
              <div className="scenario-chiffres">
                <span>Mobilisable : {montant(s.montantMobilisable)}</span>
                <span>Reste : {montant(s.resteAFinancer)}</span>
              </div>
            </div>
          ))}
          <p className="note">
            Aucun scénario n’est choisi à votre place : l’arbitrage entre puiser dans
            l’épargne, comprimer un mois ou solliciter un délai vous appartient.
          </p>
        </Carte>
      ))}

      <Carte titre="Mensualisation de la taxe foncière">
        <Ligne
          libelle={`Possible pour ${annee}`}
          valeur={mensualisationPossiblePour(annee, aujourdhui) ? 'Oui' : 'Non'}
        />
        <Ligne
          libelle={`Possible pour ${annee + 1}`}
          valeur={mensualisationPossiblePour(annee + 1, aujourdhui) ? 'Oui' : 'Non'}
        />
        <p className="note">
          L’adhésion doit être demandée avant le 30 juin pour s’appliquer à l’année en
          cours. Modalités à vérifier auprès de la DGFiP avant toute démarche.
        </p>
      </Carte>
    </div>
  );
}
