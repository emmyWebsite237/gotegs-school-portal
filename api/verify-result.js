import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ error: "Server misconfigured: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing in Vercel's Environment Variables." });
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { student_id, class: student_class, dept, pin } = req.query;
    if (!student_id || !student_class || !pin) return res.status(400).json({ error: "Missing required fields." });

    const tableName = student_class.includes("SSS") ? "sss_students" : "jss_students";
    let query = supabase.from(tableName).select('*').eq('student_id', student_id).eq('class', student_class).eq('pin', pin);
    if (student_class.includes("SSS") && dept) query = query.eq('dept', dept);

    const { data: student, error } = await query.maybeSingle();
    if (error || !student) return res.status(404).json({ error: "No record found. Please verify ID, PIN, and Class/Dept." });

    // Logical rule: a valid student attempt is counted even when access is denied.
    // This check must happen before returning the access-denied response.
    const currentCount = Number(student.check_count || 0);
    if (currentCount >= 3) return res.status(403).json({ error: "Trial attempts exhausted (3/3). Please contact Go-Tegs Admin." });

    if (student.can_check_result !== true) {
      const { error: countError } = await supabase.from(tableName).update({ check_count: currentCount + 1 }).eq('id', student.id);
      if (countError) console.error('Could not increment denied result check:', countError);
      return res.status(403).json({ error: `Result checking is currently disabled for this student. Attempt ${currentCount + 1}/3 has been recorded.` });
    }

    // Payment availability still does not consume an attempt because the student
    // is permitted to check, but the report itself has not been released.
    if (student.is_paid !== true) {
      return res.status(403).json({ error: "Result not available yet. Please contact the school administration." });
    }

    const nextCount = currentCount + 1;
    const { error: countError } = await supabase.from(tableName).update({ check_count: nextCount }).eq('id', student.id);
    if (countError) console.error('Could not increment result check:', countError);

    const { data: settings } = await supabase.from('admin_portal').select('year').order('id', { ascending:true }).limit(1).maybeSingle();
    const currentYear = settings?.year || '';

    const subjectBaseNames = Object.keys(student)
      .filter(key => key.endsWith('_mtt'))
      .map(key => key.replace(/_mtt$/, ''));

    const scores = subjectBaseNames
      .filter(base => student[`${base}_mtt`] !== null && student[`${base}_mtt`] !== undefined && student[`${base}_exam`] !== null && student[`${base}_exam`] !== undefined)
      .map(base => {
        const mtt = Number(student[`${base}_mtt`]);
        const exam = Number(student[`${base}_exam`]);
        return { subject: base, mtt, exam, total: mtt + exam };
      });

    const present = student.present ?? 0;
    return res.status(200).json({
      full_name: student.full_name,
      dob: student.dob,
      year: currentYear,
      is_paid: student.is_paid,
      opened: student.opened ?? 0,
      present,
      teacher_remark: student.teacher_remark || "No comment provided.",
      scores,
      check_count: nextCount
    });
  } catch (err) {
    console.error("verify-result error:", err);
    return res.status(500).json({ error: "Server error: " + err.message });
  }
}
