-- Go-Tegs Results schema alignment
-- Run ONCE in the RESULTS Supabase project (the project containing
-- jss_students, sss_students and admin_portal).
--
-- Purpose:
--   * add SSS Catering C.P. MTT if missing
--   * add SSS Digital Technology examination field
--   * rename all *_score result columns to *_exam
--   * standardise attendance to `present` (not `is_present`)
--   * clear the requested result contents and reset release/check controls
--
-- The migration is deliberately limited to the two student result tables.

begin;

-- Missing SSS result columns requested by the admin editor.
alter table public.sss_students
  add column if not exists catering_c_p_mtt numeric;

alter table public.sss_students
  add column if not exists digital_tech_mtt numeric;

alter table public.sss_students
  add column if not exists digital_tech_score numeric;

-- If the site already has the corrected name, keep it. Otherwise the block
-- below renames every *_score field to *_exam.
do $$
declare
  r record;
  target_name text;
begin
  for r in
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ('jss_students','sss_students')
      and right(column_name, 6) = '_score'
    order by table_name, ordinal_position
  loop
    target_name := regexp_replace(r.column_name, '_score$', '_exam');
    if exists (
      select 1 from information_schema.columns
      where table_schema='public'
        and table_name=r.table_name
        and column_name=target_name
    ) then
      -- Since result contents are intentionally being cleared, an old
      -- duplicate *_score column can be removed once *_exam exists.
      execute format('alter table public.%I drop column if exists %I', r.table_name, r.column_name);
    else
      execute format('alter table public.%I rename column %I to %I', r.table_name, r.column_name, target_name);
    end if;
  end loop;
end $$;

-- Ensure the Digital Technology examination column exists after the rename pass.
alter table public.sss_students
  add column if not exists digital_tech_exam numeric;

-- Standardise attendance field. If a bad intermediate migration created
-- is_present, migrate it only when `present` is not already present.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='jss_students' and column_name='is_present'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='jss_students' and column_name='present'
  ) then
    alter table public.jss_students rename column is_present to present;
  elsif exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='jss_students' and column_name='is_present'
  ) then
    alter table public.jss_students drop column is_present;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='sss_students' and column_name='is_present'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='sss_students' and column_name='present'
  ) then
    alter table public.sss_students rename column is_present to present;
  elsif exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='sss_students' and column_name='is_present'
  ) then
    alter table public.sss_students drop column is_present;
  end if;
end $$;

alter table public.jss_students add column if not exists present numeric;
alter table public.sss_students add column if not exists present numeric;
alter table public.jss_students alter column present drop not null;
alter table public.sss_students alter column present drop not null;

alter table public.jss_students add column if not exists can_check_result boolean not null default false;
alter table public.sss_students add column if not exists can_check_result boolean not null default false;

alter table public.jss_students add column if not exists check_count integer not null default 0;
alter table public.sss_students add column if not exists check_count integer not null default 0;

-- Clear requested result contents. The subject columns remain intact.
do $$
declare
  tbl text;
  set_clause text;
begin
  foreach tbl in array array['jss_students','sss_students'] loop
    select string_agg(format('%I = NULL', column_name), ', ' order by ordinal_position)
      into set_clause
    from information_schema.columns
    where table_schema='public'
      and table_name=tbl
      and (right(column_name, 4) = '_mtt' or right(column_name, 5) = '_exam');

    if set_clause is not null then
      execute format('update public.%I set %s', tbl, set_clause);
    end if;

    execute format(
      'update public.%I set opened = NULL, present = NULL, teacher_remark = NULL, check_count = 0, can_check_result = false',
      tbl
    );
  end loop;
end $$;

commit;

-- NOTE ON COLUMN ORDER:
-- PostgreSQL does not provide an ALTER TABLE command that moves existing
-- columns. The application editor already places student details first and
-- results second. For a clean Supabase-side display without rebuilding the
-- live tables, run 22-ordered-result-views.sql after this migration. It
-- creates ordered views with personal fields first, then result fields.
