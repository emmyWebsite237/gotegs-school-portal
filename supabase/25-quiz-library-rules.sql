-- Go-Tegs quiz-library rules update
-- Practice-library quizzes are open to every class, unlimited attempts,
-- and use 15 seconds per question for every subject except Mathematics.

alter table if exists public.quiz_codes
  add column if not exists subject text;

alter table if exists public.quiz_codes
  add column if not exists time_limit_seconds integer;

-- Unlimited practice attempts are represented by NULL.
alter table if exists public.quiz_codes
  alter column attempts_allowed drop not null;

-- Seed missing subjects conservatively.
update public.quiz_codes
set subject = case
  when lower(title) like '%math%' then 'Mathematics'
  else 'General Practice'
end
where subject is null or btrim(subject) = '';

-- Existing practice-library quizzes are intentionally open to all classes
-- and unlimited. Their non-mathematics timer is derived from question count.
update public.quiz_codes q
set class_restriction = null,
    attempts_allowed = null,
    time_limit_seconds = case
      when lower(coalesce(q.subject,'')) = 'mathematics' then
        case when q.time_limit_minutes is null then null else q.time_limit_minutes * 60 end
      else
        (select count(*) * 15 from public.quiz_code_questions qq where qq.quiz_code_id = q.id)
    end,
    time_limit_minutes = case
      when lower(coalesce(q.subject,'')) = 'mathematics' then q.time_limit_minutes
      else ceil((select count(*) * 15.0 from public.quiz_code_questions qq where qq.quiz_code_id = q.id) / 60.0)::integer
    end
where q.library_visible = true;

create index if not exists quiz_codes_subject_idx
  on public.quiz_codes(subject);

-- Do not expose the service role or change public RLS posture here.
