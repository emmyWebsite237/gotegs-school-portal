-- Go-Tegs Results / Admin migration
-- Run ONCE in the RESULTS Supabase project (jss_students, sss_students,
-- admin_portal, testimonials).
--
-- This migration intentionally removes student-level year/term storage.
-- The current school year is stored in admin_portal and managed from
-- /admin/index.html. Term is no longer stored in admin_portal.
--
-- It also clears existing marks/attendance/remarks, resets check counts,
-- and adds can_check_result=false so results are opt-in by the admin.

begin;

-- -------------------------------------------------------------------------
-- Student result tables: year/term are no longer row-level fields.
-- -------------------------------------------------------------------------
alter table if exists jss_students drop column if exists year;
alter table if exists jss_students drop column if exists term;
alter table if exists sss_students drop column if exists year;
alter table if exists sss_students drop column if exists term;

-- Every student must be explicitly released before they can view a result.
alter table jss_students add column if not exists can_check_result boolean not null default false;
alter table sss_students add column if not exists can_check_result boolean not null default false;

-- Make fields nullable so the requested clearing can use NULL rather than
-- fake zero/empty values.
alter table jss_students alter column opened drop not null;
alter table jss_students alter column is_present drop not null;
alter table jss_students alter column teacher_remark drop not null;
alter table sss_students alter column opened drop not null;
alter table sss_students alter column is_present drop not null;
alter table sss_students alter column teacher_remark drop not null;

-- -------------------------------------------------------------------------
-- One-time data clear/reset.
-- -------------------------------------------------------------------------
update jss_students
set opened = null,
    is_present = null,
    teacher_remark = null,
    check_count = 0,
    can_check_result = false;

update sss_students
set opened = null,
    is_present = null,
    teacher_remark = null,
    check_count = 0,
    can_check_result = false;

-- Clear every subject's MTT and Examination fields without deleting columns.
do $$
declare
  tbl text;
  set_clause text;
begin
  foreach tbl in array array['jss_students','sss_students'] loop
    select string_agg(format('%I = NULL', column_name), ', ' order by ordinal_position)
      into set_clause
    from information_schema.columns
    where table_schema = 'public'
      and table_name = tbl
      and (column_name like '%_mtt' or column_name like '%_score');

    if set_clause is not null then
      execute format('update public.%I set %s', tbl, set_clause);
    end if;
  end loop;
end $$;

-- -------------------------------------------------------------------------
-- Admin portal: year is global/current-session; term is removed; password
-- is stored as a SHA-256 hash in admin_password_hash.
-- -------------------------------------------------------------------------
alter table admin_portal add column if not exists year text;
alter table admin_portal drop column if exists term;
alter table admin_portal add column if not exists admin_password_hash text;
alter table admin_portal add column if not exists admin_password text;

-- If admin_password exists from an intermediate version, retain it only
-- long enough for the application to upgrade it on first successful login.
-- The application then writes admin_password_hash and clears admin_password.

commit;

-- After this migration, open /admin/ and use your existing ADMIN_GATE_PASSWORD
-- once, if that environment variable is already configured. The app will then
-- store its SHA-256 hash in admin_password_hash and clear admin_password.
-- If no environment password exists, you may temporarily enter your existing
-- admin password in the admin_portal.admin_password column using Supabase Table
-- Editor; the first successful login will upgrade it to admin_password_hash.
-- Then use the Admin Dashboard's Result Control panel to set the school year
-- and optionally replace the admin password.
