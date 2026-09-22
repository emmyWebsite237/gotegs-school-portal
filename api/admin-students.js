import { createClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'crypto';

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

function body(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body); } catch { return {}; }
}

function tableName(section) {
  return section === 'sss_students' ? 'sss_students' : section === 'jss_students' ? 'jss_students' : null;
}

function cleanText(value, max = 120) {
  return String(value ?? '').trim().slice(0, max);
}

function cleanNullableDate(value) {
  const text = cleanText(value, 30);
  if (!text) return null;
  return text;
}

export default async function handler(req, res) {
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ error: 'Server misconfigured: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.' });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
    const token = req.headers.authorization || '';
    if (!verifyToken(token)) return res.status(401).json({ error: 'Admin session expired. Log in again.' });

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const input = body(req);
    const action = input.action || 'list';
    const section = tableName(input.section);

    if (action === 'list') {
      const [jss, sss] = await Promise.all([
        supabase.from('jss_students').select('id,student_id,full_name,class,pin,dob,admission_date,is_paid,check_count,can_check_result,opened,is_present,teacher_remark').order('full_name'),
        supabase.from('sss_students').select('id,student_id,full_name,class,dept,pin,dob,admission_date,is_paid,check_count,can_check_result,opened,is_present,teacher_remark').order('full_name')
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

    if (!section || !input.id) return res.status(400).json({ error: 'Invalid student reference.' });

    if (action === 'get') {
      const detailFields = section === 'sss_students'
        ? 'id,student_id,full_name,class,dept,pin,dob,admission_date,is_paid,check_count,can_check_result,opened,is_present,teacher_remark'
        : 'id,student_id,full_name,class,pin,dob,admission_date,is_paid,check_count,can_check_result,opened,is_present,teacher_remark';
      const { data, error } = await supabase.from(section)
        .select(detailFields)
        .eq('id', input.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Student record not found.' });
      if (section === 'jss_students') data.dept = null;
      return res.status(200).json({ student: { ...data, section } });
    }

    if (action === 'update') {
      const d = input.data && typeof input.data === 'object' ? input.data : {};
      const update = {
        full_name: cleanText(d.full_name, 160),
        student_id: cleanText(d.student_id, 80),
        class: cleanText(d.class, 40),
        pin: cleanText(d.pin, 80),
        dob: cleanNullableDate(d.dob),
        admission_date: cleanNullableDate(d.admission_date),
        is_paid: Boolean(d.is_paid),
      };

      if (!update.full_name || !update.student_id || !update.class || !update.pin) {
        return res.status(400).json({ error: 'Full name, Student ID, Class and PIN are required.' });
      }

      if (section === 'sss_students') update.dept = cleanText(d.dept, 80) || null;

      const detailFields = section === 'sss_students'
        ? 'id,student_id,full_name,class,dept,pin,dob,admission_date,is_paid,check_count,can_check_result,opened,is_present,teacher_remark'
        : 'id,student_id,full_name,class,pin,dob,admission_date,is_paid,check_count,can_check_result,opened,is_present,teacher_remark';
      const { data, error } = await supabase.from(section)
        .update(update)
        .eq('id', input.id)
        .select(detailFields)
        .maybeSingle();
      if (error) return res.status(400).json({ error: 'Could not save student details: ' + error.message });
      if (!data) return res.status(404).json({ error: 'Student record not found.' });
      if (section === 'jss_students') data.dept = null;
      return res.status(200).json({ success: true, student: { ...data, section } });
    }

    return res.status(400).json({ error: 'Unknown admin-students action.' });
  } catch (err) {
    console.error('admin-students error:', err);
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
}
