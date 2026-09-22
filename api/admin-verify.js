import { createClient } from '@supabase/supabase-js';

function sendJson(res, status, payload) {
  return res.status(status).json(payload);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }

  const body = typeof req.body === 'string'
    ? JSON.parse(req.body || '{}')
    : (req.body || {});
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const pin = typeof body.pin === 'string' ? body.pin : String(body.pin ?? '');

  if (!pin) {
    return sendJson(res, 400, { error: 'Missing admin password or PIN.' });
  }

  // Optional compatibility path: if the deployment already stores a single
  // admin gate password as ADMIN_GATE_PASSWORD, it remains server-side and
  // can authenticate without placing the secret in GitHub/static JavaScript.
  if (process.env.ADMIN_GATE_PASSWORD && pin === process.env.ADMIN_GATE_PASSWORD) {
    return sendJson(res, 200, { success: true });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return sendJson(res, 500, {
      error: 'Admin authentication is not configured. Check the deployment environment variables.'
    });
  }

  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    let query = supabase
      .from('admin_portal')
      .select('admin_name')
      .eq('admin_pin', pin)
      .limit(2);

    // The main gate only needs the saved PIN/password. A name can also be
    // supplied by future clients without changing this endpoint again.
    if (name) query = query.ilike('admin_name', name);

    const { data, error } = await query;

    if (error) {
      console.error('admin-verify Supabase error:', error.message);
      return sendJson(res, 500, {
        error: 'Admin database verification failed. Check the Supabase project and admin_portal table configuration.'
      });
    }

    // Require one unambiguous admin match. Duplicate PINs should not silently
    // authenticate the wrong account.
    if (!Array.isArray(data) || data.length !== 1) {
      return sendJson(res, 401, { error: 'Access denied.' });
    }

    return sendJson(res, 200, { success: true });
  } catch (error) {
    console.error('admin-verify error:', error);
    return sendJson(res, 400, { error: 'Invalid authentication request.' });
  }
}
