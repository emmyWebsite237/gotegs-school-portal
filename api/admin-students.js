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
    if (!secret) return false;
    const expected = createHmac('sha256', secret).update(raw).digest('base64url');
    const a = Buffer.from(sig), b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
    const payload = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    return payload.sub === 'gotegs-admin' && Number(payload.exp) > Math.floor(Date.now() / 1000);
  } catch { return false; }
}

function body(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body); } catch { return {}; }
}
function tableName(section) {
  if (section === 'sss_students') return 'sss_students';
  if (section === 'jss_students') return 'jss_students';
  return null;
}
function cleanText(value, max = 160) { return String(value ?? '').trim().slice(0, max); }
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
  if ('present' in incoming) out.present = nullableNumber(incoming.present);
  if ('teacher_remark' in incoming) out.teacher_remark = cleanText(incoming.teacher_remark, 1000) || null;
  if ('can_check_result' in incoming) out.can_check_result = Boolean(incoming.can_check_result);
  return out;
}
function normalizeStudent(input, table) {
  const student = input && typeof input === 'object' ? input : {};
  const update = {
    full_name: cleanText(student.full_name),
    student_id: cleanText(student.student_id, 80),
    class: cleanText(student.class, 40),
    pin: cleanText(student.pin, 80),
    dob: nullableDate(student.dob),
    is_paid: Boolean(student.is_paid)
  };
  if (table === 'sss_students') update.dept = cleanText(student.dept, 80) || null;
  return update;
}

export default async function handler(req, res) {
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ error: 'Server misconfigured: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.' });
    }
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

    if (action === 'create') {
      if (!table) return res.status(400).json({ error: 'Choose JSS or SSS before adding a student.' });
      const student = normalizeStudent(input.student, table);
      if (!student.full_name || !student.student_id || !student.class || !student.pin) {
        return res.status(400).json({ error: 'Full name, Student ID, Class and PIN are required.' });
      }

      const [jssDup, sssDup] = await Promise.all([
        supabase.from('jss_students').select('id').eq('student_id', student.student_id).maybeSingle(),
        supabase.from('sss_students').select('id').eq('student_id', student.student_id).maybeSingle()
      ]);
      if (jssDup.error || sssDup.error) throw (jssDup.error || sssDup.error);
      if (jssDup.data || sssDup.data) return res.status(409).json({ error: 'That Student ID already exists.' });

      const { data, error } = await supabase.from(table).insert(student).select('*').single();
      if (error) return res.status(400).json({ error: 'Could not add student: ' + error.message });
      return res.status(201).json({ success: true, student: { ...data, section: table, dept: table === 'jss_students' ? null : data.dept } });
    }

    if (!table || !input.id) return res.status(400).json({ error: 'Invalid student reference.' });

    if (action === 'get') {
      const { data, error } = await supabase.from(table).select('*').eq('id', input.id).maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Student record not found.' });
      return res.status(200).json({ student: { ...data, section: table, dept: table === 'jss_students' ? null : data.dept } });
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

    if (action === 'update-result') {
      const incoming = input.data && typeof input.data === 'object' ? input.data : {};
      const update = resultUpdateFrom(incoming, table);
      if (Object.keys(update).length === 0) {
        return res.status(400).json({ error: 'No result fields were supplied.' });
      }
      const { data, error } = await supabase
        .from(table)
        .update(update)
        .eq('id', input.id)
        .select('*')
        .maybeSingle();
      if (error) return res.status(400).json({ error: 'Could not save result: ' + error.message });
      if (!data) return res.status(404).json({ error: 'Student record not found.' });
      return res.status(200).json({ success: true, student: { ...data, section: table, dept: table === 'jss_students' ? null : data.dept } });
    }

    if (action === 'save' || action === 'update') {
      const student = normalizeStudent(input.student || input.data, table);
      if (!student.full_name || !student.student_id || !student.class || !student.pin) {
        return res.status(400).json({ error: 'Full name, Student ID, Class and PIN are required.' });
      }
      const result = input.result && typeof input.result === 'object' ? input.result : {};
      const update = { ...student, ...resultUpdateFrom(result, table) };
      const { data, error } = await supabase.from(table).update(update).eq('id', input.id).select('*').maybeSingle();
      if (error) return res.status(400).json({ error: 'Could not save student and result: ' + error.message });
      if (!data) return res.status(404).json({ error: 'Student record not found.' });
      return res.status(200).json({ success: true, student: { ...data, section: table, dept: table === 'jss_students' ? null : data.dept } });
    }

    if (action === 'delete') {
      let existing = await supabase.from(table).select('id,profile_pic_path').eq('id', input.id).maybeSingle();
      if (existing.error) existing = await supabase.from(table).select('id').eq('id', input.id).maybeSingle();
      if (existing.error) throw existing.error;
      if (!existing.data) return res.status(404).json({ error: 'Student record not found.' });

      const profilePath = existing.data.profile_pic_path;
      if (profilePath) {
        try { await supabase.storage.from('student-profile-pics').remove([profilePath]); } catch (_) {}
      }

      const { error } = await supabase.from(table).delete().eq('id', input.id);
      if (error) return res.status(400).json({ error: 'Could not delete student: ' + error.message });
      return res.status(200).json({ success: true, deleted_id: input.id, section: table });
    }

    return res.status(400).json({ error: 'Unknown admin-students action.' });
  } catch (err) {
    console.error('admin-students error:', err);
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
}
