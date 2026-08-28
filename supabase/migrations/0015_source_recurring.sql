-- Ajoute 'recurring' à l'énumération des sources de transaction.
--
-- Une opération récurrente échue (revenu, charge) est désormais matérialisée
-- automatiquement en transaction `pending`/non pointée dès que son jour est
-- atteint, plutôt que simplement supposée « déjà exécutée » sans aucune
-- trace dans les opérations — voir packages/core/src/recurrence.ts.
--
-- `ALTER TYPE ... ADD VALUE` doit rester seul dans sa transaction (règle
-- PostgreSQL) : rien d'autre n'est ajouté dans ce fichier.
alter type app.transaction_source add value 'recurring';
