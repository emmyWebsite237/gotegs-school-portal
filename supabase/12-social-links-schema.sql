-- Run in the SAME Supabase project used for updates/store/lesson-notes.
-- (When you later consolidate everything into one project, just re-run
-- this there — nothing else references the old project for this table.)

create table if not exists social_links (
  id uuid primary key default gen_random_uuid(),
  platform text not null,   -- 'facebook' | 'twitter' | 'instagram' | 'whatsapp' | 'tiktok' | 'youtube'
  url text not null,
  display_order integer default 0,
  created_at timestamptz not null default now()
);

alter table social_links enable row level security;

create policy "Public can read social links"
  on social_links for select
  using (true);

create policy "Anyone with anon key can insert social links"
  on social_links for insert
  with check (true);

create policy "Anyone with anon key can update social links"
  on social_links for update
  using (true);

create policy "Anyone with anon key can delete social links"
  on social_links for delete
  using (true);
