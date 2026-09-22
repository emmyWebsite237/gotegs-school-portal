import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ error: "Server misconfigured: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing in Vercel's Environment Variables." });
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { student_id, pin } = req.query;

    if (!student_id || !pin) return res.status(400).json({ error: "Missing Student ID or PIN." });

    let student = null;
    let section = null;

    const { data: jssMatch } = await supabase
      .from('jss_students')
      .select('full_name, class')
      .eq('student_id', student_id)
      .eq('pin', pin)
      .maybeSingle();

    if (jssMatch) {
      student = jssMatch;
      section = 'jss_students';
    } else {
      const { data: sssMatch } = await supabase
        .from('sss_students')
        .select('full_name, class, dept')
        .eq('student_id', student_id)
        .eq('pin', pin)
        .maybeSingle();
      if (sssMatch) { student = sssMatch; section = 'sss_students'; }
    }

    if (!student) return res.status(404).json({ error: "Student ID or PIN not recognized." });

    const { data: settings, error: settingsError } = await supabase
      .from('admin_portal').select('year').order('id', { ascending:true }).limit(1).maybeSingle();
    if (settingsError || !settings?.year) return res.status(503).json({ error: "The school year has not been configured by the admin yet." });

    return res.status(200).json({ full_name: student.full_name, class: student.class, dept: student.dept || null, year: settings.year, section });
  } catch (err) {
    console.error("student-login error:", err);
    return res.status(500).json({ error: "Server error: " + err.message });
  }
}
