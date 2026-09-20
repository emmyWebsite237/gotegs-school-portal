import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ error: "Server misconfigured: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing in Vercel's Environment Variables." });
    }

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
