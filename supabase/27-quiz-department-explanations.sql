-- Go-Tegs Quiz enhancements: department restrictions + question explanations
-- Run in the RESULTS Supabase project. No new Vercel function is required.

alter table if exists public.quiz_codes
  add column if not exists department_restriction text;

alter table if exists public.quiz_code_questions
  add column if not exists explanation text;

create index if not exists quiz_codes_class_department_idx
  on public.quiz_codes(class_restriction, department_restriction);
