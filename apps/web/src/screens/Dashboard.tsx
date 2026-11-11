import { useState } from 'react';
import { depensesVariablesParJour, synthetiserMois, synthetiserSemaine } from '@budget/core/src/budget.ts';
import { situationVirement } from '@budget/core/src/tresorerie.ts';
import { projeterSoldeTheorique } from '@budget/core/src/projection.ts';
import { echeancesDejaPassees } from '@budget/core/src/recurrence.ts';
import { genererAlertes } from '@budget/core/src/alertes.ts';
import { periodeDe } from '@budget/core/src/periode.ts';
import { Anneau, type PartAnneau } from '../components/Anneau.tsx';
import {
  AnneauRestant, BarreRepartition, Calendrier, FluxArgent, LigneEnveloppe, type NoeudFlux,
} from '../components/Graphiques.tsx';
import { styleCategorie } from '../lib/categories.ts';
import {
  Carte, Ligne, Valeur, IconeBadge, JaugeSemiCirculaire,
  COULEUR_REVENUS, COULEUR_DEPENSES, COULEUR_EPARGNE,
} from '../components/ui.tsx';
import {
  aujourdhuiISO, dateCourte, moisPilule, montant, montantSigne, pourcent,
} from '../lib/format.ts';
import { useConfiguration, useTransactions } from '../state/useDonnees.ts';
import { estARenseigner } from './Transactions.tsx';

type CibleNavigation = 'budget' | 'epargne' | 'configurer';

/**
 * Tableau de bord.
 *
 * AUCUN calcul métier ici. Tout provient de `synthetiserMois`,
 * `synthetiserSemaine`, `situationVirement`, `projeterSoldeTheorique` et
 * `genererAlertes`. Ce fichier ne fait que choisir des couleurs, icônes,
 * trier/replier pour l'affichage et mettre en forme — jamais recalculer
 * une valeur financière.
 */
export function Dashboard({
  onOuvrirARenseigner,
  onNaviguer,
}: {
  onOuvrirARenseigner?: () => void;
  onNaviguer?: (cible: CibleNavigation) => void;
} = {}) {
  const { config } = useConfiguration();
  const transactions = useTransactions();
  const aujourdhui = aujourdhuiISO();
  const periode = periodeDe(aujourdhui);

  const mois = synthetiserMois(config, transactions, periode);
  const semaine = synthetiserSemaine(config, transactions, aujourdhui);
  const virement = situationVirement(config, transactions, aujourdhui);
  const alertes = genererAlertes(config, transactions, aujourdhui);
  const epargne = mois.epargne;

  const aller = (cible: CibleNavigation) => () => onNaviguer?.(cible);

  const aRenseigner = transactions.filter(estARenseigner).length;

  // Solde théorique = solde du relevé + opérations non pointées +
  // opérations récurrentes encore attendues d'ici la fin du mois : calcul
  // entièrement dans `projeterSoldeTheorique`, jamais recalculé ici — voir
  // packages/core/src/projection.ts. Le prochain relevé importé révèle de
  // lui-même l'écart via le rapprochement bancaire.
  const compteCourant = config.comptes.find((c) => c.type === 'courant');
  const soldeCompte = compteCourant
    ? projeterSoldeTheorique(config, transactions, compteCourant, aujourdhui)
    : null;
  const netRecurrentAVenir = soldeCompte
    ? soldeCompte.revenusAVenir - soldeCompte.chargesAVenir - soldeCompte.provisionsAVenir - soldeCompte.epargneAVenir
    : 0;
  const [detailSoldeOuvert, setDetailSoldeOuvert] = useState(false);
  // Doublons probables détectés par le moteur, rattachés aux deux
  // opérations de la paire pour être signalés sur chacune d'elles.
  const jumellesDe = (id: string) =>
    (soldeCompte?.doublonsProbables ?? []).flatMap((d) =>
      d.operation.id === id ? [d.jumelle] : d.jumelle.id === id ? [d.operation] : [],
    );
  // Échéances déjà échues ce mois-ci (ex. la CAF, un salaire) : une échéance
  // pointée et antérieure au relevé n'apparaît nulle part ailleurs dans le
  // détail — sans cette liste, elle donnerait l'impression trompeuse
  // d'avoir été oubliée alors qu'elle est déjà comptée dans le solde réel.
  // N'affiche QUE les échéances introuvables (à signaler) ou déjà pointées
  // (invisibles ailleurs) : une échéance non pointée est déjà listée dans
  // « Opérations non pointées » juste en dessous — la montrer ici aussi
  // ferait apparaître deux fois le même montant pour la même transaction.
  const echeancesPassees = echeancesDejaPassees(config, transactions, aujourdhui).filter(
    (e) => !e.transaction || e.transaction.pointage === 'pointed',
  );

  /* --- Anneau des dépenses : issu de mois.categories ----------------- */
  const totalDepense = mois.depensesVariables;
  const partsDepenses: PartAnneau[] = mois.categories
    .filter((c) => c.depense > 0)
    .sort((a, b) => b.depense - a.depense)
    .map((c) => ({
      cle: c.categorieId,
      nom: c.nom,
      montant: c.depense,
      part: totalDepense > 0 ? c.depense / totalDepense : 0,
      couleur: styleCategorie(
        config.categories.find((x) => x.id === c.categorieId)?.nom ?? c.nom,
        c.categorieId,
      ).couleur,
    }));
  const ratioBudgetVariable = mois.budgetVariable > 0 ? mois.depensesVariables / mois.budgetVariable : null;

  /* --- Anneau des revenus : issu de mois.revenus --------------------- */
  const partsRevenus: PartAnneau[] = mois.revenus.lignes.map((l) => ({
    cle: l.sourceId ?? 'non_identifie',
    nom: l.nom,
    montant: l.montant,
    part: l.part,
  }));

  /* --- Couleur et icône stables par catégorie (anneau, calendrier, enveloppes, flux) --- */
  const nomDe = (id: string | null) =>
    config.categories.find((c) => c.id === id)?.nom ?? 'Non catégorisé';
  const styleDe = (id: string) => styleCategorie(nomDe(id), id);

  /* --- Enveloppes : les plus dépensées d'abord, 5 visibles puis « Tout voir » --- */
  const [toutesEnveloppes, setToutesEnveloppes] = useState(false);
  const enveloppes = [...mois.categories]
    .filter((c) => c.prevu > 0)
    .sort((a, b) => b.depense - a.depense || b.pourcentage - a.pourcentage);
  const enveloppesVisibles = toutesEnveloppes ? enveloppes : enveloppes.slice(0, 5);

  /* --- Calendrier : dépenses variables jour par jour, issues du moteur --- */
  const joursDepenses = depensesVariablesParJour(config, transactions, periode);

  /* --- Où part l'argent : les postes de `mois`, sans aucun recalcul.
   * La capacité d'épargne EST ce que laissent revenus − charges − provisions
   * − enveloppes (`capaciteEpargne` dans le moteur) ; négative, elle n'est
   * pas dessinée mais annoncée. --- */
  const capacite = epargne.capaciteEpargneBudgetaire;
  const groupesFlux: NoeudFlux[] = [
    { cle: 'fixes', nom: 'Charges fixes', montant: mois.chargesFixes, couleur: '#9a7b52' },
    { cle: 'provisions', nom: 'Provisions', montant: mois.provisions, couleur: '#5d7fa8' },
    {
      cle: 'enveloppes',
      nom: 'Vie courante',
      montant: mois.budgetVariable,
      couleur: '#c9a23c',
      enfants: [...mois.categories]
        .filter((c) => c.prevu > 0)
        .sort((a, b) => b.prevu - a.prevu)
        .map((c) => ({ cle: c.categorieId, nom: c.nom, montant: c.prevu, couleur: styleDe(c.categorieId).couleur })),
    },
    { cle: 'epargne', nom: 'Épargne', montant: Math.max(0, capacite), couleur: '#8a6fd9' },
  ];
  const totalFlux = groupesFlux.reduce((s, g) => s + g.montant, 0);

  /* --- Anneau du reste à dépenser : la part de l'enveloppe du mois
   * consommée par chaque catégorie, dans sa couleur. Ce qui n'est rattaché à
   * aucune enveloppe (opération non classée...) reste visible en gris. --- */
  const segmentsRestant = mois.budgetVariable > 0
    ? [
        ...partsDepenses.map((p) => ({
          cle: p.cle,
          couleur: styleDe(p.cle).couleur,
          ratio: p.montant / mois.budgetVariable,
        })),
        {
          cle: '__autres__',
          couleur: 'var(--inconnu)',
          ratio: (totalDepense - partsDepenses.reduce((s, p) => s + p.montant, 0)) / mois.budgetVariable,
        },
      ]
    : [];

  const alertesFortes = alertes.filter((a) => a.niveau !== 'info').slice(0, 3);

  /* --- Objectif épargne : ratio d'affichage de la jauge semi-circulaire.
   * Le ratio n'est qu'un affichage d'une valeur déjà calculée par le moteur
   * (`mois.progressionEpargne` = épargne RÉELLEMENT réalisée / objectif) ;
   * aucune donnée financière n'est produite ici. Volontairement PAS basé
   * sur `capaciteEpargneBudgetaire` (ce que le budget pourrait dégager) :
   * remplir un anneau de progression avec une capacité théorique donnait
   * l'impression trompeuse qu'un montant avait déjà été épargné. -------- */
  const ratioEpargneReelle = Math.max(0, mois.progressionEpargne);

  return (
    <div className="ecran">
      <div className="entete-ligne">
        <span className="pilule-periode">📅 {moisPilule(periode)}</span>
      </div>

      {aRenseigner > 0 && (
        <button className="bandeau-alerte" onClick={onOuvrirARenseigner}>
          ⚠️ {aRenseigner} opération(s) à renseigner
        </button>
      )}

      {/* 1. Carte principale — l'information numéro un */}
      <section className="carte carte-principale">
        <AnneauRestant
          segments={segmentsRestant}
          depasse={mois.resteADepenser < 0}
          valeur={montant(mois.resteADepenser)}
          libelle={mois.resteADepenser < 0 ? 'de dépassement' : `restant sur ${montant(mois.budgetVariable)}`}
        />
        <div className="principale-pied">
          <span>
            <strong>{montant(semaine.disponibleCetteSemaine)}</strong> d’ici dimanche
          </span>
          <span>
            <strong>{montant(semaine.allocationQuotidienne)}</strong> par jour
          </span>
          <span>
            <strong>{semaine.joursRestantsMois}</strong> jours restants
          </span>
        </div>
      </section>

      {/* 1bis. Solde réel (relevé) / solde théorique (relevé + non pointé) */}
      {soldeCompte && soldeCompte.soldeReel !== null && (
        <section className="carte carte-soldes">
          <div className="solde-bloc">
            <span className="solde-libelle">Solde réel</span>
            <Valeur texte={montant(soldeCompte.soldeReel)} taille="grande" />
            {soldeCompte.soldeReelDate && (
              <span className="solde-detail">Relevé au {dateCourte(soldeCompte.soldeReelDate)}</span>
            )}
          </div>
          <div className="solde-bloc solde-bloc-theorique">
            <span className="solde-libelle">Solde théorique</span>
            <Valeur texte={montant(soldeCompte.soldeTheorique)} taille="grande" />
            <span className="solde-detail">
              {soldeCompte.operationsNonPointees.length === 0
                ? 'Aucune opération non pointée'
                : `${soldeCompte.operationsNonPointees.length} opération(s) non pointée(s) · ${montantSigne(soldeCompte.ecartNonPointe)}`}
            </span>
            {soldeCompte.doublonsProbables.length > 0 && (
              <span className="solde-detail ton-negatif">
                ⚠️ {soldeCompte.doublonsProbables.length} doublon(s) probable(s) à vérifier
              </span>
            )}
            {soldeCompte.operationsAnterieuresAuReleve.length > 0 && (
              <span className="solde-detail">
                {soldeCompte.operationsAnterieuresAuReleve.length} opération(s) antérieure(s) au relevé, non comptée(s)
              </span>
            )}
            {netRecurrentAVenir !== 0 && (
              <span className="solde-detail">
                {montantSigne(netRecurrentAVenir)} de récurrentes attendues d’ici fin de mois
              </span>
            )}
            <button className="lien solde-lien-detail" onClick={() => setDetailSoldeOuvert((v) => !v)}>
              {detailSoldeOuvert ? 'Masquer le détail' : 'Voir le détail'}
            </button>
          </div>
        </section>
      )}

      {soldeCompte && detailSoldeOuvert && (
        <Carte titre="Détail du solde théorique">
          <p className="note">
            Tout ce qui compte dans le calcul : les échéances récurrentes déjà
            atteintes ce mois-ci, les opérations saisies mais pas encore retrouvées
            sur un relevé, puis ce qui reste encore à venir.
          </p>

          {echeancesPassees.length > 0 && (
            <>
              <p className="detail-solde-soustitre">Échéances de ce mois déjà atteintes</p>
              {echeancesPassees.map((e) => (
                <div key={`${e.type}-${e.nom}`} className="transaction">
                  <div className="transaction-principal">
                    <span className="transaction-libelle">{e.nom} · jour {e.jour}</span>
                    <span className={`transaction-montant ton-${e.type === 'revenu' ? 'positif' : 'neutre'}`}>
                      {montantSigne(e.type === 'revenu' ? e.montant : -e.montant)}
                    </span>
                  </div>
                  <div className={`transaction-meta${e.transaction ? '' : ' ton-negatif'}`}>
                    {e.transaction
                      ? `Déjà comptée dans le solde réel (${dateCourte(e.transaction.date)})`
                      : 'Aucune opération trouvée ce mois-ci'}
                  </div>
                </div>
              ))}
            </>
          )}

          {soldeCompte.operationsNonPointees.length > 0 && (
            <>
              <p className="detail-solde-soustitre">Opérations non pointées</p>
              {soldeCompte.operationsNonPointees.map((l) => (
                <div key={l.transaction.id} className="transaction">
                  <div className="transaction-principal">
                    <span className="transaction-libelle">
                      {l.transaction.commercant ?? l.transaction.description ?? 'Sans libellé'}
                    </span>
                    <span className={`transaction-montant ton-${l.contribution >= 0 ? 'positif' : 'neutre'}`}>
                      {montantSigne(l.contribution)}
                    </span>
                  </div>
                  <div className="transaction-meta">{dateCourte(l.transaction.date)}</div>
                  {jumellesDe(l.transaction.id).map((j) => (
                    <div key={j.id} className="transaction-meta ton-negatif">
                      Doublon probable de « {j.commercant ?? j.description ?? 'Sans libellé'} » (
                      {j.pointage === 'pointed' ? 'déjà pointée' : 'non pointée'})
                    </div>
                  ))}
                </div>
              ))}
            </>
          )}

          {soldeCompte.operationsAnterieuresAuReleve.length > 0 && (
            <>
              <p className="detail-solde-soustitre">Antérieures au relevé — non comptées</p>
              <p className="note">
                Datées d’avant le relevé du {dateCourte(soldeCompte.soldeReelDate!)} : le solde réel
                les inclut déjà. À pointer, ou à corriger si la banque ne les a jamais passées.
              </p>
              {soldeCompte.operationsAnterieuresAuReleve.map((l) => (
                <div key={l.transaction.id} className="transaction">
                  <div className="transaction-principal">
                    <span className="transaction-libelle">
                      {l.transaction.commercant ?? l.transaction.description ?? 'Sans libellé'}
                    </span>
                    <span className="transaction-montant ton-neutre">{montantSigne(l.contribution)}</span>
                  </div>
                  <div className="transaction-meta">{dateCourte(l.transaction.date)}</div>
                </div>
              ))}
            </>
          )}

          {(soldeCompte.revenusAVenirDetail.length > 0 ||
            soldeCompte.chargesAVenirDetail.length > 0 ||
            soldeCompte.provisionsAVenirDetail.length > 0 ||
            soldeCompte.epargneAVenir > 0) && (
            <>
              <p className="detail-solde-soustitre">Récurrentes attendues d’ici fin de mois</p>
              {soldeCompte.revenusAVenirDetail.map((l) => (
                <Ligne key={`r-${l.nom}`} libelle={l.nom} valeur={montantSigne(l.montant)} ton="positif" />
              ))}
              {soldeCompte.chargesAVenirDetail.map((l) => (
                <Ligne key={`c-${l.nom}`} libelle={l.nom} valeur={montantSigne(-l.montant)} />
              ))}
              {soldeCompte.provisionsAVenirDetail.map((l) => (
                <Ligne key={`p-${l.nom}`} libelle={l.nom} valeur={montantSigne(-l.montant)} />
              ))}
              {soldeCompte.epargneAVenir > 0 && (
                <Ligne libelle="Épargne (versement prévu)" valeur={montantSigne(-soldeCompte.epargneAVenir)} />
              )}
            </>
          )}

          {soldeCompte.fluxNonDates.length > 0 && (
            <p className="note">
              Jour non confirmé, donc non compté ici : {soldeCompte.fluxNonDates.join(', ')}.
            </p>
          )}
        </Carte>
      )}

      {/* 2. Indicateurs du mois */}
      <div className="kpi-grille">
        <div className="kpi">
          <IconeBadge emoji="💶" couleur={COULEUR_REVENUS} />
          <span className="kpi-libelle">Revenus</span>
          <span className="kpi-valeur">{montant(mois.revenus.total)}</span>
          <span className="kpi-appui">{mois.revenus.base === 'prevu' ? 'prévus' : 'perçus'}</span>
        </div>
        <div className="kpi">
          <IconeBadge emoji="🛍️" couleur={COULEUR_DEPENSES} />
          <span className="kpi-libelle">Dépensé</span>
          <span className="kpi-valeur">{montant(mois.depensesVariables)}</span>
          <span className="kpi-appui">sur {montant(mois.budgetVariable)}</span>
        </div>
        <div className="kpi">
          <IconeBadge emoji="🐷" couleur={COULEUR_EPARGNE} />
          <span className="kpi-libelle">Épargne</span>
          <span className={`kpi-valeur${capacite < 0 ? ' ton-negatif' : ''}`}>{montant(capacite)}</span>
          <span className="kpi-appui">capacité</span>
        </div>
      </div>

      {/* 3. Enveloppes */}
      {enveloppes.length > 0 && (
        <Carte
          titre="Enveloppes du mois"
          action={<button className="lien" onClick={aller('budget')}>Gérer</button>}
        >
          {enveloppesVisibles.map((c) => (
            <LigneEnveloppe
              key={c.categorieId}
              nom={c.nom}
              style={styleDe(c.categorieId)}
              depense={c.depense}
              prevu={c.prevu}
              ratio={c.pourcentage}
            />
          ))}
          {enveloppes.length > 5 && (
            <button className="lien lien-detail" onClick={() => setToutesEnveloppes((v) => !v)}>
              {toutesEnveloppes ? 'Réduire' : `Voir les ${enveloppes.length} enveloppes`} ›
            </button>
          )}
        </Carte>
      )}

      {/* 4. Calendrier des dépenses */}
      <Carte titre="Calendrier des dépenses">
        <Calendrier
          periode={periode}
          aujourdhui={aujourdhui}
          jours={joursDepenses}
          transactions={transactions}
          styleDe={styleDe}
          nomDe={nomDe}
        />
        <p className="note">Touchez un jour pour voir ses opérations.</p>
      </Carte>

      {/* 5. Où part l'argent */}
      <Carte titre="Où part votre argent">
        <p className="anneau-entete-total">{montant(mois.revenusPrevus)}</p>
        <p className="anneau-entete-sous">de revenus prévus ce mois-ci</p>
        <BarreRepartition
          parts={groupesFlux.map((g) => ({
            cle: g.cle,
            couleur: g.couleur,
            ratio: totalFlux > 0 ? g.montant / totalFlux : 0,
          }))}
        />
        <ul className="anneau-legende legende-flux">
          {groupesFlux.filter((g) => g.montant > 0).map((g) => (
            <li key={g.cle}>
              <span className="pastille" style={{ background: g.couleur }} />
              <span className="legende-nom">{g.nom}</span>
              <span className="legende-part">{Math.round((g.montant / totalFlux) * 100)} %</span>
              <span className="legende-montant">{montant(g.montant)}</span>
            </li>
          ))}
        </ul>
        <FluxArgent groupes={groupesFlux} />
        {capacite < 0 && (
          <p className="note note-attention">
            Les postes prévus dépassent les revenus de {montant(-capacite)} : aucune épargne
            n’est dégagée ce mois-ci.
          </p>
        )}
      </Carte>

      {/* 6. Revenus et objectif d'épargne, côte à côte */}
      <div className="colonnes colonnes-compactes">
        <Carte titre="Revenus" className="carte-anneau">
          <Anneau
            compact
            limiteLegende={3}
            parts={partsRevenus}
            total={mois.revenus.total}
            centreValeur={montant(mois.revenus.total)}
            legendeCentre={mois.revenus.base === 'prevu' ? 'prévus' : 'perçus'}
            videTexte="Aucun revenu configuré."
            note={
              mois.revenus.base === 'realise' && mois.revenus.comporteNonIdentifie
                ? 'Une part n’a pas pu être rattachée à une source connue.'
                : undefined
            }
            lienDetail={{ texte: 'Détail', onClick: aller('configurer') }}
          />
        </Carte>

        <Carte titre="Objectif épargne">
          <JaugeSemiCirculaire
            ratio={ratioEpargneReelle}
            valeurCentre={montant(mois.epargneRealisee)}
            labelCentre={`épargnés sur ${montant(epargne.objectifEpargne)}`}
            couleur={COULEUR_EPARGNE}
          />
          <div className="categorie-pied">
            <span>{montant(mois.epargneRealisee)} / {montant(epargne.objectifEpargne)}</span>
            <span className={mois.progressionEpargne >= 1 ? 'ton-positif' : undefined}>
              {pourcent(mois.progressionEpargne)}
            </span>
          </div>
          <p className="note">
            Capacité budgétaire ce mois-ci (ce que le budget pourrait dégager,
            pas un montant déjà mis de côté) : {montant(epargne.capaciteEpargneBudgetaire)}.
          </p>
          {!epargne.atteignable && (
            <p className="note note-attention">
              Objectif non atteignable avec le budget actuel — écart{' '}
              {montant(epargne.ecartObjectif)}, objectif inchangé.
            </p>
          )}
          <p className="note">
            Transférable maintenant : {montant(virement.montantTransferableMaintenant)}
          </p>
          {virement.blocages.length > 0 && (
            <p className="note">{virement.blocages.join(' · ')}.</p>
          )}
        </Carte>
      </div>

      {/* 7. Alertes */}
      {alertesFortes.length > 0 && (
        <Carte titre="À surveiller">
          {alertesFortes.map((a, i) => (
            <div key={`${a.code}-${i}`} className={`alerte alerte-${a.niveau}`}>
              <p className="alerte-titre">
                <span className="alerte-icone">{a.niveau === 'critique' ? '🔴' : '🟠'}</span>
                {a.titre}
              </p>
              <p className="alerte-detail">{a.detail}</p>
            </div>
          ))}
          {alertes.length > alertesFortes.length && (
            <p className="note">
              {alertes.length - alertesFortes.length} autre(s) information(s) dans
              Réglages.
            </p>
          )}
        </Carte>
      )}
    </div>
  );
}
