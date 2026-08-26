import { useMemo, useState } from 'react';
import { eur } from '@budget/core/src/money.ts';
import { rapprocherCompte } from '@budget/core/src/rapprochement.ts';
import { definirSoldeCompte } from '../db/repository.ts';
import { enregistrerTransaction } from '../db/dexie.ts';
import { Carte, Etiquette, Ligne, Vide } from '../components/ui.tsx';
import { dateCourte, montant } from '../lib/format.ts';
import { useConfiguration, useTransactions } from '../state/useDonnees.ts';

/**
 * Rapprochement bancaire : vérifier que les opérations de l'application
 * (importées ou saisies) reconstituent bien le solde imprimé sur un relevé
 * papier, plutôt que de le supposer.
 *
 * Les deux soldes ET leurs dates viennent TOUJOURS du relevé, jamais d'une
 * valeur déjà connue de l'application : c'est le relevé qui fait foi.
 */
export function Rapprochement() {
  const { config } = useConfiguration();
  const transactions = useTransactions();
  const comptes = config.comptes;

  const [compteId, setCompteId] = useState(comptes[0]?.id ?? '');
  const [dateDepart, setDateDepart] = useState('');
  const [soldeDepartTexte, setSoldeDepartTexte] = useState('');
  const [dateCloture, setDateCloture] = useState('');
  const [soldeClotureTexte, setSoldeClotureTexte] = useState('');
  const [pointees, setPointees] = useState<Set<string> | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const soldeDepart = Number(soldeDepartTexte.replace(',', '.'));
  const soldeCloture = Number(soldeClotureTexte.replace(',', '.'));
  const parametresValides =
    compteId !== '' && dateDepart !== '' && dateCloture !== '' && dateDepart <= dateCloture &&
    Number.isFinite(soldeDepart) && Number.isFinite(soldeCloture);

  const resultat = useMemo(() => {
    if (!parametresValides) return null;
    return rapprocherCompte(transactions, compteId, eur(soldeDepart), dateDepart, eur(soldeCloture), dateCloture);
  }, [parametresValides, transactions, compteId, soldeDepart, dateDepart, soldeCloture, dateCloture]);

  const modifierParametre = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPointees(null);
    setMessage(null);
  };

  // Par défaut, toutes les opérations sont considérées comme retrouvées sur
  // le relevé : décocher celles qui posent problème (doublon, montant
  // différent, opération pas encore passée en banque) est la façon la plus
  // rapide de repérer LAQUELLE explique un écart, sur une longue liste.
  const lancerPointage = () => {
    if (!resultat) return;
    setPointees(new Set(resultat.lignes.map((l) => l.transaction.id)));
    setMessage(null);
  };

  const basculer = (id: string) => {
    setPointees((p) => {
      const suivant = new Set(p ?? []);
      if (suivant.has(id)) suivant.delete(id); else suivant.add(id);
      return suivant;
    });
  };

  const soldePointe = useMemo(() => {
    if (!resultat || !pointees) return null;
    return resultat.soldeDepart + resultat.lignes
      .filter((l) => pointees.has(l.transaction.id))
      .reduce((s, l) => s + l.contribution, 0);
  }, [resultat, pointees]);

  const ecartPointe = resultat && soldePointe !== null ? resultat.soldeCloture - soldePointe : null;
  const equilibre = ecartPointe === 0;
  const nonPointees = resultat && pointees ? resultat.lignes.length - pointees.size : 0;

  const confirmer = async () => {
    if (!resultat || !equilibre || !pointees) return;
    setEnCours(true);
    setMessage(null);
    try {
      const maintenant = new Date().toISOString();
      // Les opérations cochées viennent d'être vérifiées une à une contre
      // le relevé papier : elles deviennent pointées pour de bon, pas
      // seulement le temps de cet écran — c'est ce qui alimente ensuite le
      // solde théorique de l'accueil.
      for (const l of resultat.lignes) {
        if (pointees.has(l.transaction.id) && l.transaction.pointage !== 'pointed') {
          await enregistrerTransaction({ ...l.transaction, pointage: 'pointed', datePointage: maintenant });
        }
      }
      await definirSoldeCompte(compteId, resultat.soldeCloture, resultat.dateCloture, 'manual');
      setMessage(`Solde du compte confirmé au ${dateCourte(resultat.dateCloture)}.`);
    } catch (e) {
      setMessage(`Erreur : ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setEnCours(false);
    }
  };

  const nomCompte = comptes.find((c) => c.id === compteId)?.nom ?? '';

  return (
    <div className="ecran">
      <Carte titre="Rapprochement bancaire">
        <p className="note">
          Reportez les deux soldes datés imprimés sur votre relevé papier — en
          haut (solde de début) et en bas (solde de clôture). L’application
          compare son propre calcul, opération par opération, au solde réel.
        </p>
        <select
          className="champ"
          value={compteId}
          onChange={(e) => modifierParametre(setCompteId)(e.target.value)}
        >
          {comptes.map((c) => (
            <option key={c.id} value={c.id}>{c.nom}</option>
          ))}
        </select>
        <input
          className="champ"
          type="date"
          value={dateDepart}
          onChange={(e) => modifierParametre(setDateDepart)(e.target.value)}
        />
        <input
          className="champ"
          type="text"
          inputMode="decimal"
          placeholder="Solde au début de la période (relevé)"
          value={soldeDepartTexte}
          onChange={(e) => modifierParametre(setSoldeDepartTexte)(e.target.value)}
        />
        <input
          className="champ"
          type="date"
          value={dateCloture}
          onChange={(e) => modifierParametre(setDateCloture)(e.target.value)}
        />
        <input
          className="champ"
          type="text"
          inputMode="decimal"
          placeholder="Solde de clôture (relevé)"
          value={soldeClotureTexte}
          onChange={(e) => modifierParametre(setSoldeClotureTexte)(e.target.value)}
        />
        {dateDepart !== '' && dateCloture !== '' && dateDepart > dateCloture && (
          <p className="note note-attention">La date de clôture doit être après la date de début.</p>
        )}
        <button className="bouton bouton-principal" disabled={!parametresValides} onClick={lancerPointage}>
          Comparer
        </button>
      </Carte>

      {resultat && (
        <>
          <Carte titre="Écart brut, avant pointage">
            <Ligne libelle="Solde attendu (toutes opérations de la période)" valeur={montant(resultat.soldeAttendu)} />
            <Ligne libelle="Solde de clôture du relevé" valeur={montant(resultat.soldeCloture)} />
            <Ligne
              libelle="Écart"
              valeur={montant(resultat.ecartTotal)}
              ton={resultat.ecartTotal === 0 ? 'positif' : 'negatif'}
            />
          </Carte>

          {pointees && (
            <>
              <Carte
                titre={`${resultat.lignes.length} opération(s) — ${dateCourte(resultat.dateDepart)} au ${dateCourte(resultat.dateCloture)}`}
              >
                <p className="note">
                  Décochez chaque opération que vous ne retrouvez PAS sur le relevé
                  papier de « {nomCompte} » (déjà passée en banque à une date ou un
                  montant différent, en double, ou absente). Le solde pointé se
                  recalcule à chaque case.
                </p>
                {resultat.lignes.length === 0 && <Vide message="Aucune opération sur cette période." />}
                {resultat.lignes.map((l) => (
                  <div key={l.transaction.id} className="transaction transaction-pointable">
                    <input
                      type="checkbox"
                      className="transaction-case"
                      checked={pointees.has(l.transaction.id)}
                      onChange={() => basculer(l.transaction.id)}
                    />
                    <div className="transaction-corps">
                      <div className="transaction-principal">
                        <span className="transaction-libelle">
                          {l.transaction.commercant ?? l.transaction.description ?? 'Sans libellé'}
                        </span>
                        <span className={`transaction-montant ton-${l.contribution >= 0 ? 'positif' : 'neutre'}`}>
                          {l.contribution >= 0 ? '+' : '−'} {montant(Math.abs(l.contribution))}
                        </span>
                      </div>
                      <div className="transaction-meta">
                        <Etiquette>{dateCourte(l.transaction.date)}</Etiquette>
                      </div>
                    </div>
                  </div>
                ))}
              </Carte>

              <Carte titre="Résultat du pointage">
                <Ligne libelle="Solde pointé" valeur={montant(soldePointe)} />
                <Ligne libelle="Solde de clôture du relevé" valeur={montant(resultat.soldeCloture)} />
                <Ligne
                  libelle="Écart"
                  valeur={montant(ecartPointe)}
                  ton={equilibre ? 'positif' : 'negatif'}
                />
                {equilibre ? (
                  <>
                    <Etiquette ton="ok">Rapprochement équilibré</Etiquette>
                    <button
                      className="bouton bouton-principal"
                      disabled={enCours}
                      onClick={() => void confirmer()}
                    >
                      {enCours ? 'Enregistrement…' : `Confirmer le solde au ${dateCourte(resultat.dateCloture)}`}
                    </button>
                  </>
                ) : (
                  <Etiquette ton="attente">
                    {nonPointees} opération(s) décochée(s) restant à expliquer
                  </Etiquette>
                )}
                {message && <p className="note">{message}</p>}
              </Carte>
            </>
          )}
        </>
      )}
    </div>
  );
}
