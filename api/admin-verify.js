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
    const parts = String(token || '').split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
    const [raw, signature] = parts;
    const expected = createHmac('sha256', sessionSecret()).update(raw).digest('base64url');
    if (!secureEqual(signature, expected)) return false;
    const payload = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    return payload?.sub === 'gotegs-admin'
      && Number.isFinite(payload?.exp)
      && payload.exp > now
      && Number.isFinite(payload?.iat)
      && payload.iat <= now + 60;
  } catch {
    return false;
  }
}


function cleanGalleryText(value, max = 300) {
  return String(value ?? '').trim().slice(0, max);
}

function makeCloudinaryUrl(cloudName, publicId) {
  const cloud = cleanGalleryText(cloudName, 120).replace(/[^a-zA-Z0-9_-]/g, '');
  const publicIdClean = cleanGalleryText(publicId, 500).replace(/^\/+|\/+$/g, '');
  if (!cloud || !publicIdClean) return '';
  return `https://res.cloudinary.com/${cloud}/image/upload/f_auto,q_auto/${publicIdClean}`;
}

function normalizeCloudinaryUrl(value) {
  const url = cleanGalleryText(value, 1200);
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'res.cloudinary.com') return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

async function listCloudinaryGalleryAssets(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });

  const cloudName = cleanGalleryText(process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_NAME || 'euzmro0n', 120)
    .replace(/[^a-zA-Z0-9_-]/g, '');
  const apiKey = String(process.env.CLOUDINARY_API_KEY || '').trim();
  const apiSecret = String(process.env.CLOUDINARY_API_SECRET || '').trim();
  if (!cloudName || !apiKey || !apiSecret) {
    return res.status(503).json({
      error: 'Cloudinary asset listing is not configured. Set CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET in the server environment.'
    });
  }

  const params = new URLSearchParams({ max_results: '500' });
  const cursor = cleanGalleryText(req.query?.cursor, 1000);
  if (cursor) params.set('next_cursor', cursor);

  try {
    const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/resources/image/upload?${params.toString()}`, {
      method: 'GET',
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data?.error?.message || `Cloudinary returned HTTP ${response.status}.`;
      return res.status(response.status === 401 || response.status === 403 ? 502 : 500)
        .json({ error: `Could not list Cloudinary assets: ${message}` });
    }

    const images = (Array.isArray(data.resources) ? data.resources : [])
      .filter(asset => asset?.secure_url && asset?.resource_type === 'image')
      .map((asset, index) => {
        const publicId = String(asset.public_id || '');
        const displayName = String(asset.display_name || publicId.split('/').pop() || `School photo ${index + 1}`);
        return {
          id: String(asset.asset_id || publicId),
          title: displayName,
          alt_text: displayName,
          cloud_name: cloudName,
          public_id: publicId,
          cloudinary_url: asset.secure_url,
          created_at: asset.created_at || null,
          display_order: index,
        };
      });

    return res.status(200).json({ images, next_cursor: data.next_cursor || null, source: 'cloudinary' });
  } catch (error) {
    return res.status(502).json({ error: `Could not contact Cloudinary: ${error.message || 'network error'}` });
  }
}

async function handleGallery(req, res, supabase) {
  if (String(req.query?.gallery || '') === 'cloudinary') {
    return await listCloudinaryGalleryAssets(req, res);
  }

  // Public gallery feed: only published display data is returned.
  if (String(req.query?.gallery || '') === 'public') {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });
    const { data, error } = await supabase
      .from('gallery_images')
      .select('id,title,alt_text,cloudinary_url,display_order')
      .eq('is_published', true)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: 'Could not load gallery: ' + error.message });
    return res.status(200).json({ images: data || [] });
  }

  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!verifyToken(token)) return res.status(401).json({ error: 'Admin session expired. Log in again.' });

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('gallery_images')
      .select('*')
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: 'Could not load gallery: ' + error.message });
    return res.status(200).json({ images: data || [] });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  const input = jsonBody(req);
  const action = String(input.action || '');

  if (action === 'create') {
    const title = cleanGalleryText(input.title, 160);
    const altText = cleanGalleryText(input.alt_text, 240) || title || 'Go-Tegs school gallery photo';
    const cloudName = cleanGalleryText(input.cloud_name, 120);
    const publicId = cleanGalleryText(input.public_id, 500);
    const directUrl = normalizeCloudinaryUrl(input.cloudinary_url);
    const url = directUrl || makeCloudinaryUrl(cloudName, publicId);
    if (!url) return res.status(400).json({ error: 'Enter a valid Cloudinary cloud name and public ID, or a full Cloudinary delivery URL.' });
    const requestedOrder = Number(input.display_order);
    const displayOrder = Number.isFinite(requestedOrder) ? Math.max(0, Math.min(2147483647, Math.trunc(requestedOrder))) : 0;
    const row = {
      title: title || null,
      alt_text: altText,
      cloud_name: cloudName || null,
      public_id: publicId || null,
      cloudinary_url: url,
      display_order: displayOrder,
      is_published: input.is_published !== false,
    };
    const { data, error } = await supabase.from('gallery_images').insert(row).select('*').single();
    if (error) return res.status(400).json({ error: 'Could not add gallery image: ' + error.message });
    return res.status(201).json({ success: true, image: data });
  }

  if (!input.id) return res.status(400).json({ error: 'Gallery image reference is required.' });

  if (action === 'toggle') {
    const { data: existing, error: readError } = await supabase.from('gallery_images').select('id,is_published').eq('id', input.id).maybeSingle();
    if (readError) return res.status(400).json({ error: 'Could not read gallery image: ' + readError.message });
    if (!existing) return res.status(404).json({ error: 'Gallery image not found.' });
    const { data, error } = await supabase.from('gallery_images').update({ is_published: !existing.is_published }).eq('id', input.id).select('id,is_published').maybeSingle();
    if (error) return res.status(400).json({ error: 'Could not change publish state: ' + error.message });
    return res.status(200).json({ success: true, is_published: !!data?.is_published });
  }

  if (action === 'delete') {
    const { error } = await supabase.from('gallery_images').delete().eq('id', input.id);
    if (error) return res.status(400).json({ error: 'Could not delete gallery image: ' + error.message });
    return res.status(200).json({ success: true, deleted_id: input.id });
  }

  if (action === 'update') {
    const update = {};
    if ('title' in input) update.title = cleanGalleryText(input.title, 160) || null;
    if ('alt_text' in input) update.alt_text = cleanGalleryText(input.alt_text, 240) || 'Go-Tegs school gallery photo';
    if ('cloud_name' in input) update.cloud_name = cleanGalleryText(input.cloud_name, 120) || null;
    if ('public_id' in input) update.public_id = cleanGalleryText(input.public_id, 500) || null;
    if ('display_order' in input) {
      const requestedOrder = Number(input.display_order);
      update.display_order = Number.isFinite(requestedOrder) ? Math.max(0, Math.min(2147483647, Math.trunc(requestedOrder))) : 0;
    }
    if ('is_published' in input) update.is_published = input.is_published !== false;

    if ('cloudinary_url' in input || 'cloud_name' in input || 'public_id' in input) {
      const direct = normalizeCloudinaryUrl(input.cloudinary_url);
      const existing = await supabase.from('gallery_images').select('cloud_name,public_id,cloudinary_url').eq('id', input.id).maybeSingle();
      if (existing.error) return res.status(400).json({ error: 'Could not read existing gallery image: ' + existing.error.message });
      const cloud = update.cloud_name ?? existing.data?.cloud_name ?? '';
      const publicId = update.public_id ?? existing.data?.public_id ?? '';
      const nextUrl = direct || makeCloudinaryUrl(cloud, publicId);
      if (!nextUrl) return res.status(400).json({ error: 'The Cloudinary cloud name/public ID or URL is invalid.' });
      update.cloudinary_url = nextUrl;
    }

    const { data, error } = await supabase.from('gallery_images').update(update).eq('id', input.id).select('*').maybeSingle();
    if (error) return res.status(400).json({ error: 'Could not update gallery image: ' + error.message });
    if (!data) return res.status(404).json({ error: 'Gallery image not found.' });
    return res.status(200).json({ success: true, image: data });
  }

  return res.status(400).json({ error: 'Unknown gallery action.' });
}

export default async function handler(req, res) {
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ error: 'Server misconfigured: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.' });
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    // Consolidated gallery endpoint — public reads and authenticated admin management.
    if (req.query?.gallery) {
      return await handleGallery(req, res, supabase);
    }

    // Consolidated lesson-term access endpoint. /api/term-access is rewritten here.
    if (String(req.query?.term_access || '') === '1') {
      const TERMS = ['Term 1','Term 2','Term 3'];
      if (req.method === 'GET') {
        const { data, error } = await supabase.from('lesson_term_access').select('term,enabled').order('term_index',{ascending:true});
        if (error) return res.status(500).json({ error: 'Could not load lesson-term access: ' + error.message });
        const access = Object.fromEntries(TERMS.map(t => [t,false]));
        (data || []).forEach(row => { if (TERMS.includes(row.term)) access[row.term] = row.enabled === true; });
        return res.status(200).json({ access });
      }
      if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed.' });
      const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i,'');
      if (!verifyToken(token)) return res.status(401).json({ error:'Admin session expired. Log in again.' });
      const requested = jsonBody(req).access || {};
      const updates = TERMS.map((term,i)=>({term,term_index:i+1,enabled:requested[term]===true,updated_at:new Date().toISOString()}));
      const { error } = await supabase.from('lesson_term_access').upsert(updates,{onConflict:'term'});
      if (error) return res.status(500).json({ error:'Could not update lesson-term access: '+error.message });
      return res.status(200).json({ success:true, access:Object.fromEntries(updates.map(x=>[x.term,x.enabled])) });
    }

    // Consolidated admin settings endpoint. Existing /api/admin-settings requests
    // are rewritten here by vercel.json, so no extra Serverless Function is needed.
    if (String(req.query?.settings || '') === '1') {
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

      const input = jsonBody(req);
      const year = String(input.year || '').trim();
      const newPassword = String(input.new_password || '');
      if (!year) return res.status(400).json({ error: 'Enter the current school year/session.' });
      if (year.length > 32) return res.status(400).json({ error: 'Year/session is too long.' });
      if (newPassword && newPassword.length < 6) return res.status(400).json({ error: 'New admin password must be at least 6 characters.' });

      const { data: row, error: readError } = await supabase
        .from('admin_portal')
        .select('id')
        .order('id', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (readError || !row) return res.status(404).json({ error: 'No admin_portal row exists. Run the supplied Supabase migration first.' });

      const update = { year };
      if (newPassword) {
        update.admin_password = newPassword;
        update.admin_password_hash = null;
      }

      const { error } = await supabase.from('admin_portal').update(update).eq('id', row.id);
      if (error) return res.status(500).json({ error: 'Could not save admin settings: ' + error.message });
      return res.status(200).json({ success: true, year });
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
