import { createClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'crypto';

function secret() { return process.env.ADMIN_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''; }
function verifyToken(token) {
  try {
    if (!token || !secret()) return false;
    const [raw, sig] = String(token).split('.'); if (!raw || !sig) return false;
    const expected = createHmac('sha256', secret()).update(raw).digest('base64url');
    if (Buffer.byteLength(sig) !== Buffer.byteLength(expected)) return false;
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
    const payload = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    return payload.sub === 'gotegs-admin' && Number(payload.exp) > Math.floor(Date.now() / 1000);
  } catch { return false; }
}
function body(req) { if (!req.body) return {}; if (typeof req.body === 'object') return req.body; try { return JSON.parse(req.body); } catch { return {}; } }
function adminOnly(req, res) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!verifyToken(token)) { res.status(401).json({ error: 'Admin session expired. Log in again.' }); return false; }
  return true;
}
function validateQuestions(questions) {
  if (!Array.isArray(questions) || !questions.length) return 'Add at least one question.';
  for (const q of questions) if (!q?.question || !q?.option_a || !q?.option_b || !['a','b','c','d'].includes(q.correct_option)) return 'Every question needs text, options A and B, and a valid correct answer.';
  return null;
}

export default async function handler(req, res) {
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Server misconfigured: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.' });
    if (!adminOnly(req, res)) return;
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const id = req.query?.id || body(req).id;

    if (req.method === 'GET') {
      if (!id) return res.status(400).json({ error: 'Quiz ID is required.' });
      const { data: quiz, error } = await supabase.from('quiz_codes').select('*').eq('id', id).maybeSingle();
      if (error) throw error; if (!quiz) return res.status(404).json({ error: 'Quiz not found.' });
      const { data: questions, error: qError } = await supabase.from('quiz_code_questions').select('id, question, option_a, option_b, option_c, option_d, correct_option, order_index').eq('quiz_code_id', id).order('order_index', { ascending: true });
      if (qError) throw qError;
      return res.status(200).json({ quiz, questions: questions || [] });
    }

    if (req.method === 'DELETE') {
      if (!id) return res.status(400).json({ error: 'Quiz ID is required.' });
      const { error } = await supabase.from('quiz_codes').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    if (req.method === 'PUT') {
      if (!id) return res.status(400).json({ error: 'Quiz ID is required.' });
      const input = body(req); const qError = validateQuestions(input.questions); if (qError) return res.status(400).json({ error: qError });
      const title = String(input.title || '').trim(); if (!title) return res.status(400).json({ error: 'Quiz title is required.' });
      const attempts = Math.max(1, Number(input.attempts_allowed) || 1);
      const timeLimit = input.time_limit_minutes ? Math.max(1, Number(input.time_limit_minutes)) : null;
      const expiresAt = input.expires_at || null;
      const { error: uError } = await supabase.from('quiz_codes').update({ title, class_restriction: input.class_restriction || null, time_limit_minutes: timeLimit, attempts_allowed: attempts, show_answers_after: input.show_answers_after !== false, expires_at: expiresAt }).eq('id', id);
      if (uError) throw uError;
      // Replace the question set while keeping the quiz code itself and any recorded attempts.
      const { error: dError } = await supabase.from('quiz_code_questions').delete().eq('quiz_code_id', id); if (dError) throw dError;
      const rows = input.questions.map((q, i) => ({ quiz_code_id: id, question: String(q.question).trim(), option_a: String(q.option_a).trim(), option_b: String(q.option_b).trim(), option_c: q.option_c ? String(q.option_c).trim() : null, option_d: q.option_d ? String(q.option_d).trim() : null, correct_option: q.correct_option, order_index: i }));
      const { error: iError } = await supabase.from('quiz_code_questions').insert(rows); if (iError) throw iError;
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (err) {
    console.error('manage-quiz-code error:', err);
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
}
