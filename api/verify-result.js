import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

export default async function handler(req, res) {
  try {
    const { student_id, year, class: student_class, dept, pin } = req.query;

    if (!student_id || !year || !student_class || !pin) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    const tableName = student_class.includes("SSS") ? "sss_students" : "jss_students";

    let query = supabase
      .from(tableName)
      .select('*')
      .eq('student_id', student_id)
      .eq('year', year)
      .eq('class', student_class)
      .eq('pin', pin);

    if (student_class.includes("SSS") && dept) {
      query = query.eq('dept', dept);
    }

    const { data: student, error } = await query.single();

    if (error || !student) {
      return res.status(404).json({ error: "No record found. Please verify ID, PIN, and Class/Dept." });
    }

    // Security: Check attempt counts
    if (student.check_count >= 3) {
      return res.status(403).json({ error: "Trial attempts exhausted (3/3). Please contact Go-Tegs Admin." });
    }

    // Update check count in database
    await supabase
      .from(tableName)
      .update({ check_count: (student.check_count || 0) + 1 })
      .eq('id', student.id);

    // Build subject list from *_mtt columns, paired with the EXISTING
    // *_score column for that subject (which represents the Examination
    // mark). A subject only appears if BOTH values are filled in.
    const subjectBaseNames = Object.keys(student)
      .filter(key => key.endsWith('_mtt'))
      .map(key => key.replace(/_mtt$/, ''));

    const scores = subjectBaseNames
      .filter(base => student[`${base}_mtt`] !== null && student[`${base}_mtt`] !== undefined
                    && student[`${base}_score`] !== null && student[`${base}_score`] !== undefined)
      .map(base => {
        const mtt = Number(student[`${base}_mtt`]);
        const exam = Number(student[`${base}_score`]);
        return {
          subject: base,
          mtt,
          exam,
          total: mtt + exam,
        };
      });

    // RETURN THE DATA TO FRONTEND
    return res.status(200).json({
      full_name: student.full_name,
      dob: student.dob,
      term: student.term,
      is_paid: student.is_paid,
      opened: student.opened || 0,
      present: student.present || 0,
      teacher_remark: student.teacher_remark || "No comment provided.",
      scores: scores
    });
  } catch (err) {
    // Any unexpected error now returns a readable message instead of a
    // bare, undiagnosable 500 — check this in the browser Network tab
    // (or Vercel's function logs) if something still goes wrong.
    console.error("verify-result error:", err);
    return res.status(500).json({ error: "Server error: " + err.message });
  }
}
