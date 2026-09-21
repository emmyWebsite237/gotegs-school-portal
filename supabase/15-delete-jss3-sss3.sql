-- Run ONCE in your RESULTS Supabase project (SQL Editor).
-- Deletes every student row currently in JSS 3 and SSS 3, so you can
-- re-add that batch fresh under the new GTS/### ID scheme.

delete from jss_students where class = 'JSS 3';
delete from sss_students where class = 'SSS 3';
