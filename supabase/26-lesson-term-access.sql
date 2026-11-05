-- Go-Tegs global lesson-note term access control.
-- Term access is separate from lesson-note content: Supabase stores only the
-- three on/off switches. The actual lesson documents remain outside Supabase.
create table if not exists public.lesson_term_access (
  term text primary key check (term in ('Term 1','Term 2','Term 3')),
  term_index integer not null unique check (term_index between 1 and 3),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.lesson_term_access (term, term_index, enabled)
values
  ('Term 1', 1, true),
  ('Term 2', 2, false),
  ('Term 3', 3, false)
on conflict (term) do nothing;

alter table public.lesson_term_access enable row level security;
-- The site reads access through /api/term-access with the service role.
-- No public table policies are required.

-- Refresh PostgREST's schema cache immediately after creating the table.
NOTIFY pgrst, 'reload schema';
