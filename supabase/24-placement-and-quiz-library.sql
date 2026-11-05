-- Go-Tegs placement + quiz library migration
-- Run once in the RESULTS Supabase project.

begin;

drop function if exists public.admin_move_student(text,text,text,text,text,text);

create extension if not exists pgcrypto;

-- Placement history keeps a snapshot of the old record before promotion/change.
create table if not exists public.student_placement_history (
  id uuid primary key default gen_random_uuid(),
  student_id text not null,
  full_name text,
  from_section text not null,
  from_class text,
  to_section text not null,
  to_class text not null,
  school_year text,
  snapshot jsonb not null default '{}'::jsonb,
  changed_by text,
  changed_at timestamptz not null default now()
);

create index if not exists student_placement_history_student_id_idx
  on public.student_placement_history(student_id, changed_at desc);

alter table public.student_placement_history enable row level security;
revoke all on public.student_placement_history from anon, authenticated;
grant all on public.student_placement_history to service_role;

-- A practice-library switch lets admin-created tests be visible for free practice,
-- while prescribed tests can remain code-only.
alter table public.quiz_codes
  add column if not exists library_visible boolean not null default true;

update public.quiz_codes set library_visible = true where library_visible is null;
create index if not exists quiz_codes_library_visible_created_idx
  on public.quiz_codes(library_visible, created_at desc);

-- Atomic placement operation. Same-arm moves change class and start a fresh result
-- set; cross-arm moves copy common identity/profile fields to the destination table,
-- reset the destination result fields, record a snapshot, then remove the source row
-- in the same transaction. The RPC is the only entry point used by the admin API.
create or replace function public.admin_move_student(
  p_student_id text,
  p_from_section text,
  p_to_section text,
  p_to_class text,
  p_to_dept text default null,
  p_school_year text default null,
  p_changed_by text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  src text := p_from_section;
  dst text := p_to_section;
  old_class text;
  student_name text;
  snapshot jsonb;
  effective_year text := p_school_year;
  existing_count integer;
  reset_clause text;
  insert_cols text;
  select_cols text;
  missing_required text;
begin
  if src not in ('jss_students','sss_students') or dst not in ('jss_students','sss_students') then
    raise exception 'Invalid student section.';
  end if;

  if p_to_class is null or btrim(p_to_class) = '' then
    raise exception 'A destination class is required.';
  end if;

  if effective_year is null or btrim(effective_year) = '' then
    select year into effective_year
    from public.admin_portal
    order by id asc
    limit 1;
  end if;

  -- Prevent two administrator tabs from moving the same student concurrently.
  perform pg_advisory_xact_lock(hashtext(coalesce(p_student_id, '')));

  execute format(
    'select to_jsonb(t), t.full_name, t.class from public.%I t where t.student_id = $1 for update',
    src
  ) into snapshot, student_name, old_class using p_student_id;

  if snapshot is null then
    raise exception 'Student was not found in the selected section.';
  end if;

  if src = dst then
    if old_class = p_to_class then
      raise exception 'The student is already in that class.';
    end if;

    insert into public.student_placement_history
      (student_id, full_name, from_section, from_class, to_section, to_class, school_year, snapshot, changed_by)
    values
      (p_student_id, student_name, src, old_class, dst, p_to_class, effective_year, snapshot, p_changed_by);

    select string_agg(format('%I = NULL', column_name), ', ' order by ordinal_position)
      into reset_clause
    from information_schema.columns
    where table_schema='public'
      and table_name=dst
      and (
        right(column_name, 4) = '_mtt'
        or right(column_name, 5) = '_exam'
        or column_name in ('opened','present','teacher_remark','principal_remark')
      );

    reset_clause := coalesce(reset_clause || ', ', '');
    if exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name=dst and column_name='check_count'
    ) then
      reset_clause := reset_clause || 'check_count = 0';
    end if;
    if exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name=dst and column_name='can_check_result'
    ) then
      if right(reset_clause, 1) <> ' ' and reset_clause <> '' then reset_clause := reset_clause || ', '; end if;
      reset_clause := reset_clause || 'can_check_result = false';
    end if;

    if dst = 'sss_students' and p_to_dept is not null then
      execute format('update public.%I set class = $1%s, dept = $3 where student_id = $2',
        dst,
        case when reset_clause <> '' then ', ' || reset_clause else '' end
      ) using p_to_class, p_student_id, p_to_dept;
    else
      execute format('update public.%I set class = $1%s where student_id = $2',
        dst,
        case when reset_clause <> '' then ', ' || reset_clause else '' end
      ) using p_to_class, p_student_id;
    end if;

    return jsonb_build_object(
      'moved', true, 'same_table', true, 'student_id', p_student_id,
      'full_name', student_name, 'from_section', src, 'from_class', old_class,
      'to_section', dst, 'to_class', p_to_class, 'school_year', effective_year
    );
  end if;

  if dst = 'jss_students' then
    -- The source row is in SSS by this point; only destination duplicates matter.
    select count(*) into existing_count from public.jss_students where student_id = p_student_id;
  else
    select count(*) into existing_count from public.sss_students where student_id = p_student_id;
  end if;
  if existing_count > 0 then
    raise exception 'A student with this Student ID already exists in the destination section.';
  end if;

  -- Copy only columns shared by source and destination that are clearly identity/profile
  -- fields. Result/session/access columns are deliberately excluded and reset below.
  select
    string_agg(format('%I', d.column_name), ', ' order by d.ordinal_position),
    string_agg(format('s.%I', d.column_name), ', ' order by d.ordinal_position)
  into insert_cols, select_cols
  from information_schema.columns d
  join information_schema.columns s
    on s.table_schema='public'
   and s.table_name=src
   and s.column_name=d.column_name
  where d.table_schema='public'
    and d.table_name=dst
    and d.column_name not in (
      'id','created_at','updated_at','year','term','check_count','can_check_result',
      'opened','present','teacher_remark','principal_remark'
    )
    and right(d.column_name, 4) <> '_mtt'
    and right(d.column_name, 5) <> '_exam'
    and coalesce(d.is_generated, 'NEVER') = 'NEVER';

  if insert_cols is null then
    raise exception 'No shared identity fields are available for this placement.';
  end if;

  -- Catch destination columns that are mandatory but cannot be supplied from the source.
  select string_agg(d.column_name, ', ' order by d.ordinal_position)
    into missing_required
  from information_schema.columns d
  where d.table_schema='public'
    and d.table_name=dst
    and d.is_nullable='NO'
    and d.column_default is null
    and coalesce(d.is_identity, 'NO') = 'NO'
    and coalesce(d.is_generated, 'NEVER') = 'NEVER'
    and d.column_name not in ('id','year','term','check_count','can_check_result','opened','present','teacher_remark','principal_remark')
    and right(d.column_name, 4) <> '_mtt'
    and right(d.column_name, 5) <> '_exam'
    and not exists (
      select 1
      from information_schema.columns s
      where s.table_schema='public' and s.table_name=src and s.column_name=d.column_name
    );

  if missing_required is not null then
    raise exception 'Destination table needs additional required fields: %', missing_required;
  end if;

  execute format(
    'insert into public.%I (%s) select %s from public.%I s where s.student_id = $1',
    dst, insert_cols, select_cols, src
  ) using p_student_id;

  select string_agg(format('%I = NULL', column_name), ', ' order by ordinal_position)
    into reset_clause
  from information_schema.columns
  where table_schema='public'
    and table_name=dst
    and (
      right(column_name, 4) = '_mtt'
      or right(column_name, 5) = '_exam'
      or column_name in ('opened','present','teacher_remark','principal_remark')
    );

  reset_clause := coalesce(reset_clause || ', ', '');
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name=dst and column_name='check_count'
  ) then
    reset_clause := reset_clause || 'check_count = 0';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name=dst and column_name='can_check_result'
  ) then
    if right(reset_clause, 1) <> ' ' and reset_clause <> '' then reset_clause := reset_clause || ', '; end if;
    reset_clause := reset_clause || 'can_check_result = false';
  end if;

  if reset_clause <> '' then
    execute format('update public.%I set %s where student_id = $1', dst, reset_clause)
      using p_student_id;
  end if;

  if dst = 'sss_students' and p_to_dept is not null then
    execute format('update public.%I set class = $1, dept = $3 where student_id = $2', dst)
      using p_to_class, p_student_id, p_to_dept;
  else
    execute format('update public.%I set class = $1 where student_id = $2', dst)
      using p_to_class, p_student_id;
  end if;

  insert into public.student_placement_history
    (student_id, full_name, from_section, from_class, to_section, to_class, school_year, snapshot, changed_by)
  values
    (p_student_id, student_name, src, old_class, dst, p_to_class, effective_year, snapshot, p_changed_by);

  execute format('delete from public.%I where student_id = $1', src)
    using p_student_id;

  return jsonb_build_object(
    'moved', true, 'same_table', false, 'student_id', p_student_id,
    'full_name', student_name, 'from_section', src, 'from_class', old_class,
    'to_section', dst, 'to_class', p_to_class, 'school_year', effective_year
  );
end;
$$;

revoke all on function public.admin_move_student(text,text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.admin_move_student(text,text,text,text,text,text,text) to service_role;

commit;
