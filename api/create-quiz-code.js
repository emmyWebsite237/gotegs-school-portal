import { createClient } from '@supabase/supabase-js'
import { createHmac, timingSafeEqual } from 'crypto'

function verifyToken(token) {
  try {
    const secret = process.env.ADMIN_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!token || !secret) return false;
    const [raw, sig] = String(token).split('.'); if (!raw || !sig) return false;
    const expected = createHmac('sha256', secret).update(raw).digest('base64url');
    if (Buffer.byteLength(sig) !== Buffer.byteLength(expected)) return false;
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
    const p = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    return p.sub === 'gotegs-admin' && Number(p.exp) > Math.floor(Date.now()/1000);
  } catch { return false; }
}

function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O/0/I/1 to avoid confusion
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: "Method not allowed." });
    }

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ error: "Server misconfigured: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing in Vercel's Environment Variables." });
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!verifyToken(token)) return res.status(401).json({ error: 'Admin session expired. Log in again.' });
    const {
      title, subject, class_restriction, time_limit_minutes, time_limit_seconds, attempts_allowed,
      show_answers_after, expires_at, library_visible, questions,
    } = req.body || {};

    if (!title || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: "A title and at least one question are required." });
    }

    for (const q of questions) {
      if (!q.question || !q.option_a || !q.option_b || !q.correct_option) {
        return res.status(400).json({ error: "Every question needs text, at least options A and B, and a correct answer selected." });
      }
    }

    // Generate a unique code, retrying on the rare collision
    let code = randomCode();
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data: existing } = await supabase.from('quiz_codes').select('id').eq('code', code).maybeSingle();
      if (!existing) break;
      code = randomCode();
    }

    const isLibrary = library_visible !== false;
    const cleanSubject = String(subject || '').trim() || 'General Practice';
    let storedClass = class_restriction || null;
    let storedAttempts = Number(attempts_allowed) || 1;
    let storedSeconds = time_limit_seconds == null || time_limit_seconds === '' ? null : Number(time_limit_seconds);
    let storedMinutes = time_limit_minutes == null || time_limit_minutes === '' ? null : Number(time_limit_minutes);

    if (isLibrary) {
      // Practice-library quizzes are open to every class and can be repeated without limit.
      storedClass = null;
      storedAttempts = null;
      if (cleanSubject.toLowerCase() !== 'mathematics') {
        storedSeconds = questions.length * 15;
        storedMinutes = Math.ceil(storedSeconds / 60);
      } else if (storedSeconds == null && storedMinutes != null) {
        storedSeconds = storedMinutes * 60;
      }
    }

    const { data: quiz, error: quizError } = await supabase
      .from('quiz_codes')
      .insert({
        code,
        title,
        subject: cleanSubject,
        class_restriction: storedClass,
        time_limit_minutes: storedMinutes,
        time_limit_seconds: storedSeconds,
        attempts_allowed: storedAttempts,
        show_answers_after: show_answers_after !== false,
        expires_at: expires_at || null,
        library_visible: isLibrary,
      })
      .select()
      .single();

    if (quizError) throw quizError;

    const rows = questions.map((q, i) => ({
      quiz_code_id: quiz.id,
      question: q.question,
      option_a: q.option_a,
      option_b: q.option_b,
      option_c: q.option_c || null,
      option_d: q.option_d || null,
      correct_option: q.correct_option,
      order_index: i,
    }));

    const { error: qError } = await supabase.from('quiz_code_questions').insert(rows);
    if (qError) throw qError;

    return res.status(200).json({ code });
  } catch (err) {
    console.error("create-quiz-code error:", err);
    return res.status(500).json({ error: "Server error: " + err.message });
  }
}
