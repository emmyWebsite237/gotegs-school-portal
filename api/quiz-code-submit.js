import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: "Method not allowed." });
    }

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ error: "Server misconfigured: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing in Vercel's Environment Variables." });
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { quiz_id, student_id, answers } = req.body || {};

    if (!quiz_id || !student_id || !Array.isArray(answers)) {
      return res.status(400).json({ error: "Missing quiz_id, student_id, or answers." });
    }

    const { data: quiz, error: quizError } = await supabase
      .from('quiz_codes')
      .select('*')
      .eq('id', quiz_id)
      .maybeSingle();

    if (quizError) throw quizError;
    if (!quiz) return res.status(404).json({ error: "Quiz not found." });

    const norm = v => String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const classMatchesRestriction = (studentValue, restriction) => {
      const student = norm(studentValue).replace(/\s+/g, '');
      const allowed = norm(restriction).replace(/\s+/g, '');
      return !allowed || student.startsWith(allowed);
    };

    // Resolve the student's real class from the database rather than trusting a
    // browser-provided class value. This keeps class restrictions enforceable.
    let studentClass = null;
    const { data: jssStudent, error: jssStudentError } = await supabase
      .from('jss_students')
      .select('class')
      .eq('student_id', student_id)
      .maybeSingle();
    if (jssStudentError) throw jssStudentError;
    if (jssStudent?.class) studentClass = jssStudent.class;
    if (!studentClass) {
      const { data: sssStudent, error: sssStudentError } = await supabase
        .from('sss_students')
        .select('class')
        .eq('student_id', student_id)
        .maybeSingle();
      if (sssStudentError) throw sssStudentError;
      if (sssStudent?.class) studentClass = sssStudent.class;
    }
    if (!studentClass) return res.status(403).json({ error: 'Your student class could not be verified.' });

    if (quiz.class_restriction && !classMatchesRestriction(studentClass, quiz.class_restriction)) {
      return res.status(403).json({ error: `This quiz is only available to classes starting with “${quiz.class_restriction}”.` });
    }

    // Re-check attempts server-side in case of a race (e.g. two tabs open)
    const { count, error: countError } = await supabase
      .from('quiz_code_attempts')
      .select('*', { count: 'exact', head: true })
      .eq('quiz_code_id', quiz_id)
      .eq('student_id', student_id);

    if (countError) throw countError;
    // NULL means unlimited attempts for practice-library quizzes.
    if (quiz.attempts_allowed != null && count >= quiz.attempts_allowed) {
      return res.status(403).json({ error: "You've already used all your attempts for this quiz." });
    }

    // Fetch the real answers server-side — the client never sees these
    // until this point, and only the ones marked show_answers_after.
    const { data: questions, error: qError } = await supabase
      .from('quiz_code_questions')
      .select('*')
      .eq('quiz_code_id', quiz_id);

    if (qError) throw qError;

    let score = 0;
    const answerMap = {};
    answers.forEach((a) => { answerMap[a.question_id] = a.selected; });

    const breakdown = questions.map((q) => {
      const selected = answerMap[q.id] || null;
      const isCorrect = selected === q.correct_option;
      if (isCorrect) score++;
      return {
        question_id: q.id,
        question: q.question,
        selected,
        correct_option: q.correct_option,
        explanation: q.explanation || 'No explanation was provided for this question.',
        is_correct: isCorrect,
      };
    });

    await supabase.from('quiz_code_attempts').insert({
      quiz_code_id: quiz_id,
      student_id,
      score,
      total: questions.length,
    });

    return res.status(200).json({
      score,
      total: questions.length,
      show_answers_after: true,
      breakdown,
    });
  } catch (err) {
    console.error("quiz-code-submit error:", err);
    return res.status(500).json({ error: "Server error: " + err.message });
  }
}
