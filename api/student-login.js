import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ error: "Server misconfigured: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing in Vercel's Environment Variables." });
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { student_id, pin } = req.query;

    if (!student_id || !pin) {
      return res.status(400).json({ error: "Missing Student ID or PIN." });
    }

    // Try JSS first, then SSS. Login itself never reads or changes
    // check_count — that's only touched when Check Result is clicked.
    let student = null;
    let section = null;

    const { data: jssMatch } = await supabase
      .from('jss_students')
      .select('full_name, class, year')
      .eq('student_id', student_id)
      .eq('pin', pin)
      .maybeSingle();

    if (jssMatch) {
      student = jssMatch;
      section = 'jss_students';
    } else {
      const { data: sssMatch } = await supabase
        .from('sss_students')
        .select('full_name, class, dept, year')
        .eq('student_id', student_id)
        .eq('pin', pin)
        .maybeSingle();

      if (sssMatch) {
        student = sssMatch;
        section = 'sss_students';
      }
    }

    if (!student) {
      return res.status(404).json({ error: "Student ID or PIN not recognized." });
    }

    return res.status(200).json({
      full_name: student.full_name,
      class: student.class,
      dept: student.dept || null,
      year: student.year,
      section,
    });
  } catch (err) {
    console.error("student-login error:", err);
    return res.status(500).json({ error: "Server error: " + err.message });
  }
}
