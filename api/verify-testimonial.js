import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

export default async function handler(req, res) {
  const { student_id, pin } = req.query;

  if (!student_id || !pin) {
    return res.status(400).json({ error: "Missing Student ID or PIN." });
  }

  const { data: record, error } = await supabase
    .from('testimonials')
    .select('*')
    .eq('student_id', student_id)
    .eq('pin', pin)
    .single();

  if (error || !record) {
    return res.status(404).json({ error: "No testimonial record found. Please verify ID and PIN." });
  }

  // Same 3-attempt trial limit used on the results side
  if (record.check_count >= 3) {
    return res.status(403).json({ error: "Trial attempts exhausted (3/3). Please contact Go-Tegs Admin." });
  }

  await supabase
    .from('testimonials')
    .update({ check_count: (record.check_count || 0) + 1 })
    .eq('id', record.id);

  return res.status(200).json({
    full_name: record.full_name,
    dob: record.dob,
    last_class: record.last_class,
    dept: record.dept,
    admission_date: record.admission_date,
    leaving_date: record.leaving_date,
    conduct: record.conduct,
    character_remark: record.character_remark,
    extracurricular: record.extracurricular,
    position_held: record.position_held,
    principal_remark: record.principal_remark,
    is_paid: record.is_paid,
  });
}
