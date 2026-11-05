import { createClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'crypto';

function verifyToken(token) {
  try {
    const secret = process.env.ADMIN_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!token || !secret) return false;
    const [raw, sig] = String(token).split('.');
    if (!raw || !sig) return false;
    const expected = createHmac('sha256', secret).update(raw).digest('base64url');
    if (Buffer.byteLength(sig) !== Buffer.byteLength(expected)) return false;
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
    const p = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    return p.sub === 'gotegs-admin' && Number(p.exp) > Math.floor(Date.now() / 1000);
  } catch { return false; }
}

const TERMS = ['Term 1', 'Term 2', 'Term 3'];

export default async function handler(req, res) {
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ error: 'Supabase environment variables are missing.' });
    }
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('lesson_term_access')
        .select('term,enabled')
        .order('term_index', { ascending: true });
      if (error) throw error;
      const access = Object.fromEntries(TERMS.map(t => [t, false]));
      (data || []).forEach(row => { if (TERMS.includes(row.term)) access[row.term] = row.enabled === true; });
      return res.status(200).json({ access });
    }

    if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed.' });
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!verifyToken(token)) return res.status(401).json({ error: 'Admin session expired. Log in again.' });

    const body = req.body || {};
    const requested = body.access || {};
    const updates = TERMS.map((term, i) => ({
      term,
      term_index: i + 1,
      enabled: requested[term] === true,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from('lesson_term_access').upsert(updates, { onConflict: 'term' });
    if (error) throw error;
    return res.status(200).json({ success: true, access: Object.fromEntries(updates.map(r => [r.term, r.enabled])) });
  } catch (err) {
    console.error('term-access error:', err);
    return res.status(500).json({ error: 'Could not update lesson-term access: ' + (err?.message || 'Unknown error') });
  }
}
