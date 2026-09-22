import { createClient } from '@supabase/supabase-js';
import { createHash, createHmac, timingSafeEqual } from 'crypto';

function jsonBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body); } catch { return {}; }
}

function hashPassword(password) {
  return createHash('sha256').update(String(password), 'utf8').digest('hex');
}

function secureEqual(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

function sessionSecret() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing');
  return process.env.ADMIN_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
}

function signToken() {
  const payload = { sub: 'gotegs-admin', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + (8 * 60 * 60) };
  const raw = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', sessionSecret()).update(raw).digest('base64url');
  return `${raw}.${sig}`;
}

function verifyPasswordRow(row, password) {
  const input = String(password || '');
  if (!input) return false;
  if (row?.admin_password_hash && secureEqual(row.admin_password_hash, hashPassword(input))) return true;
  if (row?.admin_password && secureEqual(row.admin_password, input)) return true; // one-time compatibility for older table versions
  if (process.env.ADMIN_GATE_PASSWORD && secureEqual(process.env.ADMIN_GATE_PASSWORD, input)) return true;
  return false;
}

export default async function handler(req, res) {
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ error: 'Server misconfigured: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.' });
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const body = jsonBody(req);
    let password = body.password;

    // Legacy records-page compatibility: name + pin still works during migration.
    if (!password && req.query?.name && req.query?.pin) {
      const { data, error } = await supabase.from('admin_portal').select('id,admin_name,admin_pin,admin_password_hash,admin_password').ilike('admin_name', req.query.name).eq('admin_pin', req.query.pin).limit(1).maybeSingle();
      if (error || !data) return res.status(401).json({ error: 'Unauthorized' });
      const token = signToken();
      return res.status(200).json({ success: true, token });
    }

    const { data: row, error } = await supabase
      .from('admin_portal')
      .select('id, admin_password_hash, admin_password, admin_pin')
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) return res.status(500).json({ error: 'Could not read admin settings.' });
    if (!verifyPasswordRow(row, password)) return res.status(401).json({ error: 'Incorrect password.' });

    // Upgrade a legacy plaintext admin_password to a hash as soon as it is used.
    if (row?.admin_password && !row?.admin_password_hash && row?.id) {
      await supabase.from('admin_portal').update({ admin_password_hash: hashPassword(password), admin_password: null }).eq('id', row.id);
    }

    return res.status(200).json({ success: true, token: signToken() });
  } catch (err) {
    console.error('admin-verify error:', err);
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
}
