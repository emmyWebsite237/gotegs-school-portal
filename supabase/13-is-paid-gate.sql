-- Run in your RESULTS Supabase project (jss_students, sss_students, testimonials)
-- The is_paid column already exists in your tables (it was already used for
-- the "UNOFFICIAL COPY" watermark) — this just makes sure no row is left
-- with a NULL value, which would otherwise behave unpredictably.
--
-- IMPORTANT: after running this, every student's result/testimonial will
-- show "Result not available yet" / "Testimonial not available yet" until
-- you explicitly set is_paid = true for that row in Table Editor.

update jss_students set is_paid = false where is_paid is null;
update sss_students set is_paid = false where is_paid is null;
update testimonials set is_paid = false where is_paid is null;

-- To release a specific student's result once ready, e.g.:
--   update jss_students set is_paid = true where student_id = 'GT/J/001';
