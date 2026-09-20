-- ==========================================================================
-- Go-Tegs — Quiz Codes schema
-- Run in your RESULTS Supabase project (same one as jss_students,
-- sss_students, admin_portal, testimonials).
--
-- SECURITY NOTE: correct_option is only ever read server-side, by the
-- quiz-code API functions using the SERVICE ROLE key. It is never sent
-- to the browser before a student submits their answers.
-- ==========================================================================

create table if not exists quiz_codes (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,              -- e.g. "MATH24A" — what students type in
  title text not null,
  class_restriction text,                 -- e.g. 'JSS 1', or null = any class
  time_limit_minutes integer,             -- null = no time limit
  attempts_allowed integer not null default 1,
  show_answers_after boolean not null default true,
  expires_at timestamptz,                 -- null = never expires
  created_at timestamptz not null default now()
);

create table if not exists quiz_code_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_code_id uuid not null references quiz_codes(id) on delete cascade,
  question text not null,
  option_a text not null,
  option_b text not null,
  option_c text,
  option_d text,
  correct_option text not null check (correct_option in ('a','b','c','d')),
  order_index integer not null default 0
);

create table if not exists quiz_code_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_code_id uuid not null references quiz_codes(id) on delete cascade,
  student_id text not null,
  score integer not null,
  total integer not null,
  submitted_at timestamptz not null default now()
);

-- No public RLS policies here on purpose — these tables are only ever
-- touched server-side (via the service role key in your api/ functions),
-- the same pattern as jss_students/sss_students/testimonials.
alter table quiz_codes enable row level security;
alter table quiz_code_questions enable row level security;
alter table quiz_code_attempts enable row level security;
