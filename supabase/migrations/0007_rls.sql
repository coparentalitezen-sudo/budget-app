-- =====================================================================
-- 0007 — Row Level Security
-- =====================================================================
-- Modèle : chaque ligne appartient à un utilisateur, et un utilisateur ne
-- voit que ses lignes. La politique est identique partout, ce qui la rend
-- vérifiable d'un coup d'œil — une politique subtile est une faille en
-- puissance.
--
-- RLS est activée ET forcée : même le propriétaire des tables y est soumis,
-- pour qu'une future fonction SECURITY DEFINER mal écrite ne contourne pas
-- l'isolation par inadvertance.
-- =====================================================================

do $$
declare
  t text;
  tables text[] := array[
    'users', 'accounts', 'categories', 'transactions',
    'budget_periods', 'budgets',
    'savings_goals', 'savings_transactions', 'emergency_fund_settings',
    'loans', 'loan_payments', 'recurring_expenses',
    'annual_provisions', 'provision_movements', 'one_off_liabilities',
    'import_jobs', 'categorization_rules',
    'bank_connections', 'bank_sync_logs'
  ];
  owner_column text;
begin
  foreach t in array tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);

    -- public.users porte l'identité dans `id`, les autres dans `user_id`.
    owner_column := case when t in ('users', 'emergency_fund_settings')
                         then case when t = 'users' then 'id' else 'user_id' end
                         else 'user_id' end;

    execute format(
      'create policy %I on public.%I for all to authenticated
         using (%I = (select auth.uid()))
         with check (%I = (select auth.uid()))',
      t || '_owner_access', t, owner_column, owner_column
    );
  end loop;
end;
$$;

-- Aucun accès anonyme, en lecture comme en écriture.
revoke all on all tables in schema public from anon;
