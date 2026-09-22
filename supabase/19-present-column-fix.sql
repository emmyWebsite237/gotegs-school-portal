-- Go-Tegs: align result attendance field with the live schema
-- Your student tables use `present`, not `is_present`.
-- Run this in the RESULTS Supabase project.

begin;

-- Make the live column nullable so the requested attendance reset can use NULL.
alter table if exists public.jss_students
  alter column present drop not null;

alter table if exists public.sss_students
  alter column present drop not null;

-- Clear the attendance value after the column-name correction.
update public.jss_students set present = null;
update public.sss_students set present = null;

commit;
