import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ error: "Server misconfigured: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing in Vercel's Environment Variables." });
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { code, quiz_id, student_id, class: studentClass, library } = req.query;
    if (!student_id) return res.status(400).json({ error: "Missing student reference." });
    const cleanStudentId = String(student_id).trim();
    const cleanClass = String(studentClass || '').trim();

    // Student practice library: safe metadata only; answers and codes are never exposed.
    if (String(library || '') === '1') {
      const { data: quizzes, error } = await supabase
        .from('quiz_codes')
        .select('id,title,class_restriction,time_limit_minutes,attempts_allowed,expires_at,created_at,library_visible')
        .eq('library_visible', true)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const now = new Date();
      const available = [];
      for (const q of quizzes || []) {
        if (q.expires_at && new Date(q.expires_at) < now) continue;
        if (q.class_restriction && q.class_restriction !== cleanClass) continue;
        const { count, error: countError } = await supabase.from('quiz_code_attempts').select('*', { count: 'exact', head: true }).eq('quiz_code_id', q.id).eq('student_id', cleanStudentId);
        if (countError) throw countError;
        if ((count || 0) >= Number(q.attempts_allowed || 1)) continue;
        const { count: questionCount, error: qCountError } = await supabase.from('quiz_code_questions').select('*', { count: 'exact', head: true }).eq('quiz_code_id', q.id);
        if (qCountError) throw qCountError;
        available.push({
          id: q.id,
          title: q.title,
          class_restriction: q.class_restriction,
          time_limit_minutes: q.time_limit_minutes,
          attempts_remaining: Number(q.attempts_allowed || 1) - Number(count || 0),
          question_count: Number(questionCount || 0),
          expires_at: q.expires_at,
          created_at: q.created_at,
        });
      }
      return res.status(200).json({ quizzes: available });
    }

    let quizQuery = supabase.from('quiz_codes').select('*');
    if (quiz_id) quizQuery = quizQuery.eq('id', String(quiz_id));
    else if (code) quizQuery = quizQuery.eq('code', String(code).trim().toUpperCase());
    else return res.status(400).json({ error: "Missing quiz code or quiz reference." });

    const { data: quiz, error: quizError } = await quizQuery.maybeSingle();
    if (quizError) throw quizError;
    if (!quiz) return res.status(404).json({ error: "That quiz could not be found." });
    if (quiz_id && quiz.library_visible !== true) return res.status(403).json({ error: "That quiz is not available in the practice library." });
    if (quiz.expires_at && new Date(quiz.expires_at) < new Date()) return res.status(403).json({ error: "This quiz has expired." });
    if (quiz.class_restriction && quiz.class_restriction !== cleanClass) return res.status(403).json({ error: `This quiz is only available to ${quiz.class_restriction} students.` });

    const { count, error: countError } = await supabase.from('quiz_code_attempts').select('*', { count: 'exact', head: true }).eq('quiz_code_id', quiz.id).eq('student_id', cleanStudentId);
    if (countError) throw countError;
    if (count >= quiz.attempts_allowed) return res.status(403).json({ error: `You've used all ${quiz.attempts_allowed} of your attempts for this quiz.` });

    const { data: questions, error: qError } = await supabase
      .from('quiz_code_questions')
      .select('id, question, option_a, option_b, option_c, option_d, order_index')
      .eq('quiz_code_id', quiz.id)
      .order('order_index', { ascending: true });
    if (qError) throw qError;

    return res.status(200).json({
      quiz_id: quiz.id,
      code: code ? String(code).trim().toUpperCase() : null,
      title: quiz.title,
      class_restriction: quiz.class_restriction,
      time_limit_minutes: quiz.time_limit_minutes,
      attempts_remaining: quiz.attempts_allowed - count,
      expires_at: quiz.expires_at,
      questions,
    });
  } catch (err) {
    console.error("quiz-code-fetch error:", err);
    return res.status(500).json({ error: "Server error: " + err.message });
  }
}
