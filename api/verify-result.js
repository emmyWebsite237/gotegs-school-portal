import { createClient } from '@supabase/supabase-js';

function safeStudent(student, table) {
  if (!student) return null;
  return { ...student, section: table, dept: table === 'jss_students' ? null : student.dept ?? null };
}

export default async function handler(req, res) {
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ error: "Server misconfigured: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing in Vercel's Environment Variables." });
    }
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { student_id, pin } = req.query || {};
    if (!student_id || !pin) return res.status(400).json({ error: 'Your signed-in student session and result PIN are required.' });

    const [jss, sss] = await Promise.all([
      supabase.from('jss_students').select('*').eq('student_id', student_id).eq('pin', pin).maybeSingle(),
      supabase.from('sss_students').select('*').eq('student_id', student_id).eq('pin', pin).maybeSingle()
    ]);
    if (jss.error) throw jss.error;
    if (sss.error) throw sss.error;

    const matches = [];
    if (jss.data) matches.push(safeStudent(jss.data, 'jss_students'));
    if (sss.data) matches.push(safeStudent(sss.data, 'sss_students'));
    if (matches.length === 0) return res.status(404).json({ error: 'That PIN does not match the signed-in student account.' });
    if (matches.length > 1) return res.status(409).json({ error: 'More than one student record matches this ID and PIN. Please contact the school administration.' });

    const student = matches[0];
    const tableName = student.section;
    const currentCount = Number(student.check_count || 0);
    if (currentCount >= 3) return res.status(403).json({ error: 'Trial attempts exhausted (3/3). Please contact Go-Tegs Admin.' });

    if (student.can_check_result !== true) {
      const { error: countError } = await supabase.from(tableName).update({ check_count: currentCount + 1 }).eq('id', student.id);
      if (countError) console.error('Could not increment denied result check:', countError);
      return res.status(403).json({ error: `Result checking is currently disabled for this student. Attempt ${currentCount + 1}/3 has been recorded.` });
    }

    if (student.is_paid !== true) {
      return res.status(403).json({ error: 'Result not available yet. Please contact the school administration.' });
    }

    const nextCount = currentCount + 1;
    const { error: countError } = await supabase.from(tableName).update({ check_count: nextCount }).eq('id', student.id);
    if (countError) console.error('Could not increment result check:', countError);

    const { data: settings, error: settingsError } = await supabase
      .from('admin_portal').select('year').order('id', { ascending: true }).limit(1).maybeSingle();
    if (settingsError) throw settingsError;
    const currentYear = settings?.year || '';

    const subjectBases = Object.keys(student)
      .filter(key => key.endsWith('_mtt'))
      .map(key => key.replace(/_mtt$/, ''));

    const seen = new Set();
    const scores = subjectBases
      .filter(base => !seen.has(base) && (seen.add(base), true))
      .map(base => {
        const mttValue = student[`${base}_mtt`];
        const examValue = student[`${base}_exam`];
        if (mttValue === null || mttValue === undefined || examValue === null || examValue === undefined) return null;
        const mtt = Number(mttValue);
        const exam = Number(examValue);
        return { subject: base, mtt, exam, total: mtt + exam };
      })
      .filter(Boolean);

    return res.status(200).json({
      full_name: student.full_name,
      dob: student.dob,
      class: student.class,
      dept: student.dept || null,
      section: tableName,
      year: currentYear,
      is_paid: student.is_paid,
      opened: student.opened ?? 0,
      present: student.present ?? 0,
      teacher_remark: student.teacher_remark || 'No comment provided.',
      principal_remark: student.principal_remark || '',
      scores,
      check_count: nextCount
    });
  } catch (err) {
    console.error('verify-result error:', err);
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
}
