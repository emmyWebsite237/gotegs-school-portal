-- Go-Tegs quiz corrections data. Run in the RESULTS Supabase project.
ALTER TABLE public.quiz_code_questions
  ADD COLUMN IF NOT EXISTS explanation text;

UPDATE public.quiz_code_questions
SET explanation = COALESCE(explanation, 'No explanation was provided for this question.')
WHERE explanation IS NULL;

NOTIFY pgrst, 'reload schema';
