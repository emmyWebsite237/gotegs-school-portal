import { createClient } from '@supabase/supabase-js'

const FALLBACK_PRODUCTS = [
  // Books
  { id: 'b1', name: 'Mathematics Textbook (JSS)', category: 'Books', price: 3500, display_order: 1, available: true },
  { id: 'b2', name: 'English Language Textbook (JSS)', category: 'Books', price: 3500, display_order: 2, available: true },
  { id: 'b3', name: 'Mathematics Textbook (SSS)', category: 'Books', price: 4000, display_order: 3, available: true },
  { id: 'b4', name: 'English Language Textbook (SSS)', category: 'Books', price: 4000, display_order: 4, available: true },
  { id: 'b5', name: 'Biology Textbook', category: 'Books', price: 4500, display_order: 5, available: true },
  { id: 'b6', name: 'Chemistry Textbook', category: 'Books', price: 4500, display_order: 6, available: true },
  { id: 'b7', name: 'Physics Textbook', category: 'Books', price: 4500, display_order: 7, available: true },
  { id: 'b8', name: 'Basic Science Textbook', category: 'Books', price: 3000, display_order: 8, available: true },
  { id: 'b9', name: 'Social Studies Textbook', category: 'Books', price: 3000, display_order: 9, available: true },
  { id: 'b10', name: 'Government Textbook', category: 'Books', price: 3500, display_order: 10, available: true },
  { id: 'b11', name: 'Economics Textbook', category: 'Books', price: 4000, display_order: 11, available: true },
  { id: 'b12', name: 'Computer Studies Textbook', category: 'Books', price: 3500, display_order: 12, available: true },
  { id: 'b13', name: 'Agricultural Science Textbook', category: 'Books', price: 3000, display_order: 13, available: true },
  { id: 'b14', name: 'Literature in English Textbook', category: 'Books', price: 3000, display_order: 14, available: true },

  // Stationery
  { id: 's1', name: 'Exercise Book (40 Leaves)', category: 'Stationery', price: 250, display_order: 1, available: true },
  { id: 's2', name: 'Exercise Book (80 Leaves)', category: 'Stationery', price: 450, display_order: 2, available: true },
  { id: 's3', name: 'Mathematical Set (Oxford/Helix)', category: 'Stationery', price: 1500, display_order: 3, available: true },
  { id: 's4', name: 'Standard School Backpack', category: 'Stationery', price: 8000, display_order: 4, available: true },
  { id: 's5', name: 'Ballpoint Pen (Pack of 5)', category: 'Stationery', price: 500, display_order: 5, available: true },
  { id: 's6', name: 'HB Pencils (Pack of 12)', category: 'Stationery', price: 400, display_order: 6, available: true },
  { id: 's7', name: 'Eraser & Sharpener Set', category: 'Stationery', price: 200, display_order: 7, available: true },
  { id: 's8', name: 'Clear Plastic Ruler (30cm)', category: 'Stationery', price: 200, display_order: 8, available: true },
  { id: 's9', name: 'Hardcover School Notebook (2B)', category: 'Stationery', price: 750, display_order: 9, available: true },
  { id: 's10', name: 'Graph / Drawing Sheet Pad', category: 'Stationery', price: 350, display_order: 10, available: true }
];

export default async function handler(req, res) {
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(200).json({ products: FALLBACK_PRODUCTS, source: 'fallback' });
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('available', true)
      .order('category', { ascending: true })
      .order('display_order', { ascending: true });

    if (error || !data || data.length === 0) {
      return res.status(200).json({ products: FALLBACK_PRODUCTS, source: 'fallback' });
    }

    return res.status(200).json({ products: data, source: 'supabase' });
  } catch (err) {
    console.error("store-products error:", err);
    return res.status(200).json({ products: FALLBACK_PRODUCTS, source: 'fallback' });
  }
}
