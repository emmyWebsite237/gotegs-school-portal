import { createClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'crypto';

function jsonBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body); } catch { return {}; }
}

function secureEqual(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

function verifyPasswordRow(row, password) {
  const input = String(password || '');
  if (!input) return false;
  if (row?.admin_password && secureEqual(row.admin_password, input)) return true;
  return Boolean(process.env.ADMIN_GATE_PASSWORD && secureEqual(process.env.ADMIN_GATE_PASSWORD, input));
}

function sessionSecret() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing');
  return process.env.ADMIN_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
}

function signToken() {
  const now = Math.floor(Date.now() / 1000);
  const payload = { sub: 'gotegs-admin', iat: now, exp: now + (30 * 60) };
  const raw = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', sessionSecret()).update(raw).digest('base64url');
  return `${raw}.${sig}`;
}

function verifyToken(token) {
  try {
    if (!token) return false;
    const [raw, sig] = String(token).split('.');
    if (!raw || !sig) return false;
    const expected = createHmac('sha256', sessionSecret()).update(raw).digest('base64url');
    if (sig.length !== expected.length) return false;
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
    const payload = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    return payload.sub === 'gotegs-admin' && Number(payload.exp) > Math.floor(Date.now() / 1000);
  } catch { return false; }
}

function settingsBody(req) {
  const value = jsonBody(req);
  return {
    year: String(value.year || '').trim(),
    new_password: String(value.new_password || '')
  };
}

async function handleAdminSettings(req, res, supabase) {
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('admin_portal')
      .select('year')
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) return res.status(500).json({ error: 'Could not load result session year.' });
    return res.status(200).json({ year: data?.year || '' });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!verifyToken(token)) return res.status(401).json({ error: 'Admin session expired. Log in again.' });

  const { year, new_password } = settingsBody(req);
  if (!year) return res.status(400).json({ error: 'Enter the current school year/session.' });
  if (year.length > 32) return res.status(400).json({ error: 'Year/session is too long.' });
  if (new_password && new_password.length < 6) return res.status(400).json({ error: 'New admin password must be at least 6 characters.' });

  const { data: row, error: readError } = await supabase
    .from('admin_portal')
    .select('id')
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (readError || !row) return res.status(404).json({ error: 'No admin_portal row exists. Run the supplied Supabase migration first.' });

  const update = { year };
  if (new_password) {
    update.admin_password = new_password;
    update.admin_password_hash = null;
  }
  const { error } = await supabase.from('admin_portal').update(update).eq('id', row.id);
  if (error) return res.status(500).json({ error: 'Could not save admin settings: ' + error.message });
  return res.status(200).json({ success: true, year });
}

export default async function handler(req, res) {
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ error: 'Server misconfigured: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.' });
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    // Consolidated admin settings endpoint: this keeps Vercel Hobby under the 12-function limit.
    if (String(req.query?.settings || '') === '1') {
      return await handleAdminSettings(req, res, supabase);
    }

    const body = jsonBody(req);
    const password = body.password;

    // Legacy records-page compatibility: name + pin still works.
    if (!password && req.query?.name && req.query?.pin) {
      const { data, error } = await supabase
        .from('admin_portal')
        .select('id,admin_name,admin_pin')
        .ilike('admin_name', req.query.name)
        .eq('admin_pin', req.query.pin)
        .limit(1)
        .maybeSingle();
      if (error || !data) return res.status(401).json({ error: 'Unauthorized' });
      return res.status(200).json({ success: true, token: signToken() });
    }

    const { data: row, error } = await supabase
      .from('admin_portal')
      .select('id, admin_password, admin_pin')
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) return res.status(500).json({ error: 'Could not read admin settings.' });
    if (!row) return res.status(404).json({ error: 'No admin_portal row exists.' });
    if (!verifyPasswordRow(row, password)) return res.status(401).json({ error: 'Incorrect password.' });

    return res.status(200).json({ success: true, token: signToken() });
  } catch (err) {
    console.error('admin-verify error:', err);
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
}
