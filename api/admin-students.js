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
function cleanText(value, max = 120) { return String(value ?? '').trim().slice(0, max); }
function nullableDate(value) { const t = cleanText(value, 30); return t || null; }
function nullableNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value); return Number.isFinite(n) ? n : null;
}
function resultUpdateFrom(incoming, section) {
  const out = {};
  for (const base of (SUBJECTS[section] || [])) {
    const mtt = `${base}_mtt`, score = `${base}_score`;
    if (mtt in incoming) out[mtt] = nullableNumber(incoming[mtt]);
    if (score in incoming) out[score] = nullableNumber(incoming[score]);
  }
  if ('opened' in incoming) out.opened = nullableNumber(incoming.opened);
  if ('is_present' in incoming) out.is_present = nullableNumber(incoming.is_present);
  if ('teacher_remark' in incoming) out.teacher_remark = cleanText(incoming.teacher_remark, 1000) || null;
  if ('can_check_result' in incoming) out.can_check_result = Boolean(incoming.can_check_result);
  return out;
}

export default async function handler(req, res) {
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Server misconfigured: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.' });
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
    if (!verifyToken(req.headers.authorization || '')) return res.status(401).json({ error: 'Admin session expired. Log in again.' });

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
      return res.status(200).json({ students: [
        ...(jss.data || []).map(x => ({ ...x, section: 'jss_students', dept: null })),
        ...(sss.data || []).map(x => ({ ...x, section: 'sss_students' }))
      ]});
    }

    const table = tableName(input.section);
    if (!table || !input.id) return res.status(400).json({ error: 'Invalid student reference.' });

    if (action === 'get') {
      const { data, error } = await supabase.from(table).select('*').eq('id', input.id).maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Student record not found.' });
      return res.status(200).json({ student: { ...data, section: table } });
    }

    if (action === 'set-access') {
      const allowed = Boolean(input.allowed);
      const { data, error } = await supabase.from(table).update({ can_check_result: allowed }).eq('id', input.id).select('id,can_check_result').maybeSingle();
      if (error) return res.status(400).json({ error: 'Could not update result access: ' + error.message });
      if (!data) return res.status(404).json({ error: 'Student record not found.' });
      return res.status(200).json({ success: true, can_check_result: data.can_check_result === true });
    }

    if (action === 'reset-count') {
      const { data, error } = await supabase.from(table).update({ check_count: 0 }).eq('id', input.id).select('id,check_count').maybeSingle();
      if (error) return res.status(400).json({ error: 'Could not reset check count: ' + error.message });
      if (!data) return res.status(404).json({ error: 'Student record not found.' });
      return res.status(200).json({ success: true, check_count: Number(data.check_count || 0) });
    }

    if (action === 'save' || action === 'update') {
      const student = input.student && typeof input.student === 'object' ? input.student : (input.data && typeof input.data === 'object' ? input.data : {});
      const result = input.result && typeof input.result === 'object' ? input.result : {};
      const update = {
        full_name: cleanText(student.full_name, 160),
        student_id: cleanText(student.student_id, 80),
        class: cleanText(student.class, 40),
        pin: cleanText(student.pin, 80),
        dob: nullableDate(student.dob),
        is_paid: Boolean(student.is_paid)
      };
      if (!update.full_name || !update.student_id || !update.class || !update.pin) return res.status(400).json({ error: 'Full name, Student ID, Class and PIN are required.' });
      if (table === 'sss_students') update.dept = cleanText(student.dept, 80) || null;
      Object.assign(update, resultUpdateFrom(result, table));

      const { data, error } = await supabase.from(table).update(update).eq('id', input.id).select('*').maybeSingle();
      if (error) return res.status(400).json({ error: 'Could not save student and result: ' + error.message });
      if (!data) return res.status(404).json({ error: 'Student record not found.' });
      return res.status(200).json({ success: true, student: { ...data, section: table, dept: table === 'jss_students' ? null : data.dept } });
    }

    return res.status(400).json({ error: 'Unknown admin-students action.' });
  } catch (err) {
    console.error('admin-students error:', err);
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
}
