-- ==========================================================================
-- 30 · Products table for the Go-Tegs School Store
-- ==========================================================================

CREATE TABLE IF NOT EXISTS products (
  id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text         NOT NULL,
  category      text         NOT NULL DEFAULT 'Books',
  price         numeric,
  image_url     text,
  display_order integer      NOT NULL DEFAULT 0,
  available     boolean      NOT NULL DEFAULT true,
  created_at    timestamptz  NOT NULL DEFAULT now()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Allow anon / authenticated reads
CREATE POLICY "Products are publicly readable"
  ON products FOR SELECT USING (true);

-- ==========================================================================
-- Seed data — Nigerian school store products
-- ==========================================================================

INSERT INTO products (name, category, price, display_order) VALUES
  -- Books
  ('Mathematics Textbook (JSS)',       'Books', 3500,  1),
  ('English Language Textbook (JSS)',   'Books', 3500,  2),
  ('Mathematics Textbook (SSS)',       'Books', 4000,  3),
  ('English Language Textbook (SSS)',   'Books', 4000,  4),
  ('Biology Textbook',                 'Books', 4500,  5),
  ('Chemistry Textbook',               'Books', 4500,  6),
  ('Physics Textbook',                 'Books', 4500,  7),
  ('Basic Science Textbook',           'Books', 3000,  8),
  ('Social Studies Textbook',          'Books', 3000,  9),
  ('Government Textbook',             'Books', 3500, 10),
  ('Economics Textbook',               'Books', 4000, 11),
  ('Computer Studies Textbook',        'Books', 3500, 12),
  ('Agricultural Science Textbook',    'Books', 3000, 13),
  ('Literature Textbook',             'Books', 3000, 14),

  -- Stationery
  ('Exercise Book (40 Leaves)',        'Stationery',  250,  1),
  ('Exercise Book (80 Leaves)',        'Stationery',  450,  2),
  ('Mathematical Set',                 'Stationery', 1500,  3),
  ('School Bag',                       'Stationery', 8000,  4),
  ('Pen (Pack of 5)',                  'Stationery',  500,  5),
  ('Pencil (Pack of 12)',              'Stationery',  400,  6),
  ('Eraser',                           'Stationery',  100,  7),
  ('Ruler (30cm)',                     'Stationery',  200,  8),
  ('School Notebook',                  'Stationery',  600,  9),
  ('Graph Paper Pad',                  'Stationery',  350, 10);
