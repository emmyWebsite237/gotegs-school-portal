Go-Tegs functional alignment patch

REPLACE these files at the same paths:
- admin/index.html
- admin/admin-records/index.html
- api/admin-students.js
- api/verify-result.js
- assets/js/records-common.js
- index.html
- assets/css/home.css
- student/result/view.html

RUN IN SUPABASE RESULTS PROJECT, IN ORDER:
1. supabase/21-results-schema-alignment.sql
2. supabase/22-ordered-result-views.sql (optional; creates ordered views because PostgreSQL cannot move existing table columns in-place)

The schema migration intentionally clears existing *_mtt and *_exam values, opened/present/teacher_remark, resets check_count to 0, and sets can_check_result=false, matching the earlier requested reset.

The site code now uses `present`, `_mtt`, and `_exam` consistently. SSS also includes Catering C.P. MTT and Digital Technology MTT/Exam.
