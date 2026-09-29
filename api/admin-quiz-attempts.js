import { createClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'crypto';

function verifyToken(token) {
  try {
    const [raw, sig] = String(token || '').replace(/^Bearer\s+/i, '').split('.');
    if (!raw || !sig) return false;
    const secret = process.env.ADMIN_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!secret) return false;
    const expected = createHmac('sha256', secret).update(raw).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
    const payload = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    return payload.sub === 'gotegs-admin' && Number(payload.exp) > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

function text(value, fallback = '') {
  const v = String(value ?? '').trim();
  return v || fallback;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });
    if (!verifyToken(req.headers.authorization || '')) {
      return res.status(401).json({ error: 'Admin session expired. Log in again.' });
    }
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ error: 'Server misconfigured: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.' });
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const [attemptsResult, quizzesResult, jssResult, sssResult] = await Promise.all([
      supabase
        .from('quiz_code_attempts')
        .select('id,quiz_code_id,student_id,score,total,submitted_at')
        .order('submitted_at', { ascending: false }),
      supabase
        .from('quiz_codes')
        .select('id,code,title,subject,class_restriction,attempts_allowed')
        .order('created_at', { ascending: false }),
      supabase
        .from('jss_students')
        .select('student_id,full_name,class'),
      supabase
        .from('sss_students')
        .select('student_id,full_name,class')
    ]);

    for (const result of [attemptsResult, quizzesResult, jssResult, sssResult]) {
      if (result.error) throw result.error;
    }

    const studentMap = new Map();
    for (const row of [...(jssResult.data || []), ...(sssResult.data || [])]) {
      studentMap.set(String(row.student_id), {
        full_name: text(row.full_name, 'Unknown student'),
        class: text(row.class, '—'),
      });
    }

    const quizMap = new Map((quizzesResult.data || []).map(row => [String(row.id), row]));
    const grouped = new Map();

    for (const attempt of attemptsResult.data || []) {
      const quiz = quizMap.get(String(attempt.quiz_code_id));
      const student = studentMap.get(String(attempt.student_id));
      const studentId = String(attempt.student_id);
      const quizId = String(attempt.quiz_code_id);
      const key = `${studentId}::${quizId}`;
      const current = grouped.get(key) || {
        key,
        student_id: studentId,
        student_name: student?.full_name || 'Unknown student',
        class: student?.class || '—',
        quiz_id: quizId,
        quiz_code: quiz?.code || '—',
        test_title: quiz?.title || 'Deleted test',
        subject: quiz?.subject || 'General Practice',
        attempts: 0,
        latest_score: null,
        latest_total: null,
        latest_submitted_at: null,
      };

      current.attempts += 1;
      const submitted = attempt.submitted_at ? new Date(attempt.submitted_at) : null;
      const latest = current.latest_submitted_at ? new Date(current.latest_submitted_at) : null;
      if (!latest || (submitted && submitted > latest)) {
        current.latest_score = Number(attempt.score ?? 0);
        current.latest_total = Number(attempt.total ?? 0);
        current.latest_submitted_at = attempt.submitted_at || null;
      }
      grouped.set(key, current);
    }

    const rows = [...grouped.values()].sort((a, b) => {
      const byName = a.student_name.localeCompare(b.student_name);
      if (byName !== 0) return byName;
      return b.attempts - a.attempts || a.test_title.localeCompare(b.test_title);
    });

    const maxAttempts = rows.reduce((max, row) => Math.max(max, row.attempts), 0);
    const totalAttempts = (attemptsResult.data || []).length;
    const uniqueStudents = new Set((attemptsResult.data || []).map(row => String(row.student_id))).size;
    const uniqueTests = new Set((attemptsResult.data || []).map(row => String(row.quiz_code_id))).size;

    return res.status(200).json({
      generated_at: new Date().toISOString(),
      summary: {
        total_attempts: totalAttempts,
        unique_students: uniqueStudents,
        unique_tests: uniqueTests,
        max_attempts_per_student_test: maxAttempts,
      },
      tests: (quizzesResult.data || []).map(q => ({
        id: q.id,
        code: q.code,
        title: q.title,
        subject: q.subject || 'General Practice',
      })),
      rows,
    });
  } catch (err) {
    console.error('admin-quiz-attempts error:', err);
    return res.status(500).json({ error: 'Could not load quiz attempts: ' + (err?.message || 'Unknown error') });
  }
}
