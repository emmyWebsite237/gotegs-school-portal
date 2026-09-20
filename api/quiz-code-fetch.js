import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ error: "Server misconfigured: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing in Vercel's Environment Variables." });
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { code, student_id, class: studentClass } = req.query;

    if (!code || !student_id) {
      return res.status(400).json({ error: "Missing quiz code or Student ID." });
    }

    const cleanCode = code.trim().toUpperCase();

    const { data: quiz, error: quizError } = await supabase
      .from('quiz_codes')
      .select('*')
      .eq('code', cleanCode)
      .maybeSingle();

    if (quizError) throw quizError;
    if (!quiz) {
      return res.status(404).json({ error: "That quiz code was not found." });
    }

    if (quiz.expires_at && new Date(quiz.expires_at) < new Date()) {
      return res.status(403).json({ error: "This quiz code has expired." });
    }

    if (quiz.class_restriction && studentClass && quiz.class_restriction !== studentClass) {
      return res.status(403).json({ error: `This quiz is only available to ${quiz.class_restriction} students.` });
    }

    const { count, error: countError } = await supabase
      .from('quiz_code_attempts')
      .select('*', { count: 'exact', head: true })
      .eq('quiz_code_id', quiz.id)
      .eq('student_id', student_id);

    if (countError) throw countError;
    if (count >= quiz.attempts_allowed) {
      return res.status(403).json({ error: `You've used all ${quiz.attempts_allowed} of your attempts for this quiz.` });
    }

    // Deliberately excludes correct_option — never sent to the browser
    // until after the student submits their answers.
    const { data: questions, error: qError } = await supabase
      .from('quiz_code_questions')
      .select('id, question, option_a, option_b, option_c, option_d, order_index')
      .eq('quiz_code_id', quiz.id)
      .order('order_index', { ascending: true });

    if (qError) throw qError;

    return res.status(200).json({
      quiz_id: quiz.id,
      title: quiz.title,
      time_limit_minutes: quiz.time_limit_minutes,
      attempts_remaining: quiz.attempts_allowed - count,
      questions,
    });
  } catch (err) {
    console.error("quiz-code-fetch error:", err);
    return res.status(500).json({ error: "Server error: " + err.message });
  }
}
