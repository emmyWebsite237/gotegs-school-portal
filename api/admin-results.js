import { createClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'crypto';

const SUBJECTS = {
  jss_students: ['english','maths','basic_science','basic_tech','bus_stud','agric','social_stud','home_econs','sec_edu','french','music','dic','history','cmp','phe','cca','lit'],
  sss_students: ['maths','english','civic','physics','chem','bio','fmath','dp','econs','agric','crs','catering_c_p','dic','lit_in_eng']
};

function verifyToken(token) {
  try {
    const [raw, sig] = String(token || '').replace(/^Bearer\s+/i, '').split('.');
    if (!raw || !sig) return false;
    const secret = process.env.ADMIN_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const expected = createHmac('sha256', secret).update(raw).digest('base64url');
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
    const payload = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    return payload.sub === 'gotegs-admin' && Number(payload.exp) > Math.floor(Date.now() / 1000);
  } catch { return false; }
}
function body(req) { if (!req.body) return {}; if (typeof req.body === 'object') return req.body; try { return JSON.parse(req.body); } catch { return {}; } }
function tableName(section) { return section === 'sss_students' ? 'sss_students' : section === 'jss_students' ? 'jss_students' : null; }
function toNullableNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function resultColumns(section) {
  const bases = SUBJECTS[section] || [];
  const cols = [];
  for (const base of bases) {
    cols.push(`${base}_mtt`, `${base}_score`);
  }
  cols.push('opened', 'is_present', 'teacher_remark');
  return cols;
}

export default async function handler(req, res) {
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Server misconfigured.' });
    const token = req.headers.authorization || '';
    if (!verifyToken(token)) return res.status(401).json({ error: 'Admin session expired. Log in again.' });
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const input = body(req);
    const action = input.action || 'list';

    if (action === 'list') {
      const [jss, sss] = await Promise.all([
        supabase.from('jss_students').select('*').order('full_name'),
        supabase.from('sss_students').select('*').order('full_name')
      ]);
      if (jss.error) throw jss.error;
      if (sss.error) throw sss.error;
      return res.status(200).json({
        students: [
          ...(jss.data || []).map(x => ({ ...x, section: 'jss_students', dept: null })),
          ...(sss.data || []).map(x => ({ ...x, section: 'sss_students' }))
        ]
      });
    }

    const table = tableName(input.section);
    if (!table || !input.id) return res.status(400).json({ error: 'Invalid student reference.' });

    if (action === 'get') {
      const { data, error } = await supabase.from(table).select('*').eq('id', input.id).maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Student record not found.' });
      return res.status(200).json({ student: { ...data, section: table } });
    }

    if (action === 'set-access' || action === 'reset-count') {
      const update = action === 'set-access'
        ? { can_check_result: Boolean(input.allowed) }
        : { check_count: 0 };
      const { error } = await supabase.from(table).update(update).eq('id', input.id);
      if (error) return res.status(400).json({ error: 'Could not update result control: ' + error.message });
      return res.status(200).json({ success: true });
    }

    if (action === 'update-result') {
      const incoming = input.data && typeof input.data === 'object' ? input.data : {};
      const update = {};
      for (const col of resultColumns(table)) {
        if (!(col in incoming)) continue;
        if (col === 'teacher_remark') {
          update[col] = String(incoming[col] ?? '').trim().slice(0, 1000) || null;
        } else {
          const value = toNullableNumber(incoming[col]);
          update[col] = value;
        }
      }
      if (Object.keys(update).length === 0) return res.status(400).json({ error: 'No result fields were supplied.' });
      const { data, error } = await supabase.from(table)
        .update(update)
        .eq('id', input.id)
        .select('*')
        .maybeSingle();
      if (error) return res.status(400).json({ error: 'Could not save result: ' + error.message });
      if (!data) return res.status(404).json({ error: 'Student record not found.' });
      return res.status(200).json({ success: true, student: { ...data, section: table } });
    }

    return res.status(400).json({ error: 'Unknown admin-results action.' });
  } catch (err) {
    console.error('admin-results error:', err);
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
}
