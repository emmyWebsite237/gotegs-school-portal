import { createClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual, createHash } from 'crypto';

function secret() {
  return process.env.ADMIN_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}
function verifyToken(token) {
  try {
    if (!token) return false;
    const [raw, sig] = String(token).split('.');
    if (!raw || !sig) return false;
    const expected = createHmac('sha256', secret()).update(raw).digest('base64url');
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
    const payload = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    return payload.sub === 'gotegs-admin' && Number(payload.exp) > Math.floor(Date.now() / 1000);
  } catch { return false; }
}
function body(req) { if (!req.body) return {}; if (typeof req.body === 'object') return req.body; try { return JSON.parse(req.body); } catch { return {}; } }

export default async function handler(req, res) {
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Server misconfigured.' });
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    if (req.method === 'GET') {
      const { data, error } = await supabase.from('admin_portal').select('year').order('id', { ascending: true }).limit(1).maybeSingle();
      if (error) return res.status(500).json({ error: 'Could not load result session year.' });
      return res.status(200).json({ year: data?.year || '' });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!verifyToken(token)) return res.status(401).json({ error: 'Admin session expired. Log in again.' });

    const input = body(req);
    const year = String(input.year || '').trim();
    const newPassword = String(input.new_password || '');
    if (!year) return res.status(400).json({ error: 'Enter the current school year/session.' });
    if (year.length > 32) return res.status(400).json({ error: 'Year/session is too long.' });
    if (newPassword && newPassword.length < 6) return res.status(400).json({ error: 'New admin password must be at least 6 characters.' });

    const { data: row, error: readError } = await supabase.from('admin_portal').select('id').order('id', { ascending: true }).limit(1).maybeSingle();
    if (readError || !row) return res.status(404).json({ error: 'No admin_portal row exists. Run the supplied Supabase migration first.' });

    const update = { year };
    if (newPassword) {
      update.admin_password_hash = createHash('sha256').update(newPassword, 'utf8').digest('hex');
      update.admin_password = null;
    }

    const { error } = await supabase.from('admin_portal').update(update).eq('id', row.id);
    if (error) return res.status(500).json({ error: 'Could not save admin settings: ' + error.message });
    return res.status(200).json({ success: true, year });
  } catch (err) {
    console.error('admin-settings error:', err);
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
}
