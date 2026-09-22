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
    return payload.sub === 'gotegs-admin' && payload.exp > Math.floor(Date.now() / 1000);
  } catch { return false; }
}
function body(req) { if (!req.body) return {}; if (typeof req.body === 'object') return req.body; try { return JSON.parse(req.body); } catch { return {}; } }
function tableName(section) { return section === 'sss_students' ? 'sss_students' : section === 'jss_students' ? 'jss_students' : null; }

export default async function handler(req, res) {
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Server misconfigured.' });
    const token = req.headers.authorization || '';
    if (!verifyToken(token)) return res.status(401).json({ error: 'Admin session expired. Log in again.' });
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const input = body(req);
    const action = input.action || 'list';

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

    if (action === 'list') {
      const [jss, sss] = await Promise.all([
        supabase.from('jss_students').select('id,student_id,full_name,class,check_count,can_check_result,is_paid').order('full_name'),
        supabase.from('sss_students').select('id,student_id,full_name,class,dept,check_count,can_check_result,is_paid').order('full_name')
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

    if (action === 'set-access' || action === 'reset-count') {
      const table = tableName(input.section);
      if (!table || !input.id) return res.status(400).json({ error: 'Invalid student reference.' });
      const update = action === 'set-access'
        ? { can_check_result: Boolean(input.allowed) }
        : { check_count: 0 };
      const { error } = await supabase.from(table).update(update).eq('id', input.id);
      if (error) return res.status(500).json({ error: 'Could not update student result access.' });
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'Unknown admin-results action.' });
  } catch (err) {
    console.error('admin-results error:', err);
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
}
