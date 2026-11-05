-- Go-Tegs ordered Supabase result views
-- Run AFTER 21-results-schema-alignment.sql.
-- These views are provided because PostgreSQL does not support moving table
-- columns in-place. They present the same data in the requested order:
-- student/personal details first, then result fields.
--
-- They do not replace the underlying tables and do not delete any data.

do $$
declare
  cols text;
begin
  select string_agg(format('%I', column_name), ', ' order by
    case
      when column_name in ('id','full_name','student_id','class','dept','pin','dob','is_paid','profile_pic_path') then 1
      when column_name in ('check_count','can_check_result') then 2
      when column_name in ('opened','present','teacher_remark') then 3
      when right(column_name, 4) = '_mtt' then 4
      when right(column_name, 5) = '_exam' then 5
      else 6
    end,
    ordinal_position
  ) into cols
  from information_schema.columns
  where table_schema='public' and table_name='jss_students';

  execute 'create or replace view public.jss_students_ordered as select ' || cols || ' from public.jss_students';

  select string_agg(format('%I', column_name), ', ' order by
    case
      when column_name in ('id','full_name','student_id','class','dept','pin','dob','is_paid','profile_pic_path') then 1
      when column_name in ('check_count','can_check_result') then 2
      when column_name in ('opened','present','teacher_remark') then 3
      when right(column_name, 4) = '_mtt' then 4
      when right(column_name, 5) = '_exam' then 5
      else 6
    end,
    ordinal_position
  ) into cols
  from information_schema.columns
  where table_schema='public' and table_name='sss_students';

  execute 'create or replace view public.sss_students_ordered as select ' || cols || ' from public.sss_students';
end $$;
