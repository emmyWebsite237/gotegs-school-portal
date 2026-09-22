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

export default async function handler(req, res) {
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ error: "Server misconfigured: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing in Vercel's Environment Variables." });
    }

    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!verifyToken(token)) return res.status(401).json({ error: 'Admin session expired. Log in again.' });
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    const { data: quizzes, error } = await supabase
      .from('quiz_codes')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const withCounts = await Promise.all(quizzes.map(async (q) => {
      const { count } = await supabase
        .from('quiz_code_attempts')
        .select('*', { count: 'exact', head: true })
        .eq('quiz_code_id', q.id);
      return { ...q, attempt_count: count || 0 };
    }));

    return res.status(200).json({ quizzes: withCounts });
  } catch (err) {
    console.error("list-quiz-codes error:", err);
    return res.status(500).json({ error: "Server error: " + err.message });
  }
}
