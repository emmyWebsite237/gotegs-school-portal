import { createClient } from '@supabase/supabase-js'
import { createHmac, timingSafeEqual } from 'crypto'

function verifyToken(token) {
  try {
    const secret = process.env.ADMIN_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!token || !secret) return false;
    const [raw, sig] = String(token).split('.');
    if (!raw || !sig) return false;
    const expected = createHmac('sha256', secret).update(raw).digest('base64url');
    if (Buffer.byteLength(sig) !== Buffer.byteLength(expected)) return false;
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
    const p = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    return p.sub === 'gotegs-admin' && Number(p.exp) > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

function cleanQuestion(q, orderIndex) {
  return {
    question: String(q?.question || '').trim(),
    option_a: String(q?.option_a || '').trim(),
    option_b: String(q?.option_b || '').trim(),
    option_c: q?.option_c ? String(q.option_c).trim() : null,
    option_d: q?.option_d ? String(q.option_d).trim() : null,
    correct_option: ['a', 'b', 'c', 'd'].includes(q?.correct_option) ? q.correct_option : null,
    order_index: orderIndex,
  };
}

function validateQuizPayload(body) {
  const title = String(body?.title || '').trim();
  const questions = Array.isArray(body?.questions) ? body.questions : [];
  if (!title || !questions.length) return 'A title and at least one question are required.';
  for (const q of questions) {
    if (!String(q?.question || '').trim() || !String(q?.option_a || '').trim() || !String(q?.option_b || '').trim() || !['a','b','c','d'].includes(q?.correct_option)) {
      return 'Every question needs text, options A and B, and a valid correct answer.';
    }
  }
  return null;
}

export default async function handler(req, res) {
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ error: "Server misconfigured: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing in Vercel's Environment Variables." });
    }

    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!verifyToken(token)) return res.status(401).json({ error: 'Admin session expired. Log in again.' });

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const id = req.query?.id ? String(req.query.id) : '';

    // GET /api/list-quiz-codes                 -> list all tests
    // GET /api/list-quiz-codes?id=...          -> load one test + questions for editing
    if (req.method === 'GET') {
      if (id) {
        const { data: quiz, error: quizError } = await supabase
          .from('quiz_codes')
          .select('*')
          .eq('id', id)
          .maybeSingle();
        if (quizError) throw quizError;
        if (!quiz) return res.status(404).json({ error: 'Quiz test not found.' });

        const { data: questions, error: qError } = await supabase
          .from('quiz_code_questions')
          .select('id, question, option_a, option_b, option_c, option_d, correct_option, order_index')
          .eq('quiz_code_id', quiz.id)
          .order('order_index', { ascending: true });
        if (qError) throw qError;
        return res.status(200).json({ quiz, questions: questions || [] });
      }

      const { data: quizzes, error } = await supabase
        .from('quiz_codes')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;

      const withCounts = await Promise.all((quizzes || []).map(async (q) => {
        const { count } = await supabase
          .from('quiz_code_attempts')
          .select('*', { count: 'exact', head: true })
          .eq('quiz_code_id', q.id);
        const { count: questionCount } = await supabase
          .from('quiz_code_questions')
          .select('*', { count: 'exact', head: true })
          .eq('quiz_code_id', q.id);
        return { ...q, attempt_count: count || 0, question_count: questionCount || 0 };
      }));

      return res.status(200).json({ quizzes: withCounts });
    }

    // PUT /api/list-quiz-codes?id=... -> update test details + replace its questions
    if (req.method === 'PUT') {
      const body = req.body || {};
      const errorMessage = validateQuizPayload(body);
      if (errorMessage) return res.status(400).json({ error: errorMessage });
      const targetId = String(body.id || id || '');
      if (!targetId) return res.status(400).json({ error: 'Missing quiz test ID.' });

      const { data: existing, error: existingError } = await supabase
        .from('quiz_codes')
        .select('id, code')
        .eq('id', targetId)
        .maybeSingle();
      if (existingError) throw existingError;
      if (!existing) return res.status(404).json({ error: 'Quiz test not found.' });

      const { data: quiz, error: updateError } = await supabase
        .from('quiz_codes')
        .update({
          title: String(body.title).trim(),
          class_restriction: String(body.class_restriction || '').trim() || null,
          time_limit_minutes: body.time_limit_minutes == null || body.time_limit_minutes === '' ? null : Number(body.time_limit_minutes),
          attempts_allowed: Number(body.attempts_allowed) || 1,
          show_answers_after: body.show_answers_after !== false,
          expires_at: body.expires_at || null,
          library_visible: body.library_visible !== false,
        })
        .eq('id', targetId)
        .select()
        .single();
      if (updateError) throw updateError;

      // Existing attempt history is deliberately preserved. Only the question set is replaced.
      const { error: deleteQuestionsError } = await supabase
        .from('quiz_code_questions')
        .delete()
        .eq('quiz_code_id', targetId);
      if (deleteQuestionsError) throw deleteQuestionsError;

      const rows = body.questions.map(cleanQuestion).map((q, index) => ({
        quiz_code_id: targetId,
        ...q,
        order_index: index,
      }));
      const { error: insertQuestionsError } = await supabase.from('quiz_code_questions').insert(rows);
      if (insertQuestionsError) throw insertQuestionsError;

      return res.status(200).json({ quiz, code: existing.code });
    }

    // DELETE /api/list-quiz-codes?id=... -> delete test, questions and recorded attempts
    if (req.method === 'DELETE') {
      const targetId = String(id || req.body?.id || '');
      if (!targetId) return res.status(400).json({ error: 'Missing quiz test ID.' });

      const { data: existing, error: existingError } = await supabase
        .from('quiz_codes')
        .select('id, code, title')
        .eq('id', targetId)
        .maybeSingle();
      if (existingError) throw existingError;
      if (!existing) return res.status(404).json({ error: 'Quiz test not found.' });

      const { error: attemptsError } = await supabase.from('quiz_code_attempts').delete().eq('quiz_code_id', targetId);
      if (attemptsError) throw attemptsError;
      const { error: questionsError } = await supabase.from('quiz_code_questions').delete().eq('quiz_code_id', targetId);
      if (questionsError) throw questionsError;
      const { error: quizError } = await supabase.from('quiz_codes').delete().eq('id', targetId);
      if (quizError) throw quizError;

      return res.status(200).json({ deleted: true, code: existing.code, title: existing.title });
    }

    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (err) {
    console.error('list-quiz-codes error:', err);
    return res.status(500).json({ error: 'Server error: ' + (err?.message || 'Unknown error') });
  }
}
