-- One row per schema object in public: (kind, name, short hash of its definition).
-- Hashes use what is stable across Postgres versions (function source, not
-- pg_get_functiondef's layout) and effective anon/authenticated rights rather
-- than raw ACLs, which differ between Supabase and plain Postgres.
select kind, name, left(md5(def), 12) as h from (
  select 'στήλη', c.relname || '.' || a.attname,
         format_type(a.atttypid, a.atttypmod) || case when a.attnotnull then ' not null' else '' end
         || coalesce(' default ' || pg_get_expr(d.adbin, d.adrelid), '')
    from pg_attribute a join pg_class c on c.oid = a.attrelid
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and a.attnum > 0 and not a.attisdropped
  union all
  select 'πίνακας (RLS και δικαιώματα)', c.relname,
         c.relrowsecurity::text || (select string_agg(r || ':' || p || '=' || has_table_privilege(r, c.oid, p)::text, ',' order by r, p)
                                      from unnest(array['anon', 'authenticated']) r, unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p)
    from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
  union all
  select 'περιορισμός', conrelid::regclass::text || '.' || conname, pg_get_constraintdef(oid)
    from pg_constraint where connamespace = 'public'::regnamespace and conrelid <> 0
  union all
  select 'ευρετήριο', i.indexrelid::regclass::text, pg_get_indexdef(i.indexrelid)
    from pg_index i join pg_class c on c.oid = i.indrelid where c.relnamespace = 'public'::regnamespace
  union all
  select 'συνάρτηση', p.oid::regprocedure::text,
         p.prosrc || pg_get_function_result(p.oid) || p.prosecdef::text || p.provolatile::text || coalesce(p.proconfig::text, '')
         || ' anon=' || has_function_privilege('anon', p.oid, 'EXECUTE')::text
         || ' auth=' || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text
    from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind in ('f', 'p')
  union all
  select 'κανόνας RLS', tablename || '.' || policyname,
         cmd || permissive || roles::text || coalesce(qual, '') || '|' || coalesce(with_check, '')
    from pg_policies where schemaname = 'public'
  union all
  select 'trigger', t.tgrelid::regclass::text || '.' || t.tgname,
         t.tgfoid::regproc::text || t.tgtype::text || t.tgenabled::text
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where c.relnamespace = 'public'::regnamespace and not t.tgisinternal
  union all
  select 'enum', t.typname, string_agg(e.enumlabel, ',' order by e.enumsortorder)
    from pg_type t join pg_enum e on e.enumtypid = t.oid where t.typnamespace = 'public'::regnamespace group by t.typname
  union all
  select 'view', c.relname, pg_get_viewdef(c.oid)
    from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('v', 'm')
) x(kind, name, def)
