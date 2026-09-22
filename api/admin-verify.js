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

async function handleGallery(req, res, supabase) {
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
    const displayOrder = Number.isFinite(Number(input.display_order)) ? Number(input.display_order) : 0;
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
    if ('display_order' in input) update.display_order = Number.isFinite(Number(input.display_order)) ? Number(input.display_order) : 0;
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
