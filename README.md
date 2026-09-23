# Go-Tegs International School Portal

## Canonical structure

- Public site: root HTML pages such as `/`, `/about.html`, `/contact.html`, `/gallery.html`, `/enrolment.html`, `/updates.html`, and `/faq.html`.
- Private student workspace: `/student/` with Dashboard, Profile, Results, Lesson Notes, Quiz & Practice, Quiz Code, Store, and inactive future modules.
- Private admin workspace: `/admin/` with student/results management, placement, lesson notes, updates, store, social links, quiz codes, gallery, result printing, and inactive tournaments.
- Server APIs: `/api/`. Keep the Vercel Hobby limit at 12 functions; the application is designed around 10.
- Supabase migrations: `/supabase/`, run against the results/school-portal project as documented in each SQL file.

## Supabase projects

The site uses two separate Supabase projects. The browser-side public configuration belongs to the `gotegs-portal` project. Server-side student, result, admin, quiz, and profile operations use the `gotegs-school-portal` deployment environment variables. Never put a service-role key into frontend code.

## Placement

Student identity remains stable by Student ID. The Admin Students & Results editor uses **Promote / Change Placement**. The `admin_move_student` RPC performs the move atomically. Same-arm class changes update the class and reset the new result set. Cross-arm moves copy shared identity/profile fields, save the previous row as a snapshot in `student_placement_history`, initialise a clean result set, and then remove the source row in the same transaction. Previous placement history remains queryable by Student ID.

## Quiz library

Admin-created quizzes can be marked **Visible to students** for the Quiz & Practice library or **Code-only / prescribed** for teacher-assigned use. Students can search or request a random library quiz. The existing Quiz Code flow remains the prescribed-test path.

## Result printing

The Result Print Centre prepares one student report per PDF page using the established report styling. Preview generation does not increment student result-check counts, and the preview can be cancelled before completion.

## Maintenance rule

Keep one canonical `README.md`. Do not recreate duplicate root student-only pages. Student-only tools live under `/student/`; old URLs should redirect rather than remain as duplicate pages. Patches should contain only files that actually need replacing/adding.

For this organized structure, remove these legacy files from GitHub when they are still present in an older checkout: `README.txt`, `DELETE-api-admin-settings.md`, `assets/notes.js`, `quiz.html`, `quiz-code.html`, and `store.html`. The canonical student routes are `/student/quiz/`, `/student/quiz-code/`, and `/student/store/`.
## Database migration rule

The SQL files are migration history. On the live database, run a migration once and do not blindly rerun older destructive migrations such as the old JSS3/SSS3 cleanup. Later migrations are additive/idempotent where practical. The current placement migration is `24-placement-and-quiz-library.sql`.


## Patch application note

This release adds the placement and quiz-library features on top of the latest organized project. Run `supabase/24-placement-and-quiz-library.sql` once in the results Supabase project. The migration creates the atomic `admin_move_student` function and `student_placement_history` and adds `quiz_codes.library_visible`.

The project is intentionally kept at 10 Vercel Serverless Functions. If the GitHub checkout still contains the legacy files `api/admin-settings.js`, `api/admin-results.js`, or `api/get-section-results.js`, delete them before deployment; the current code consolidates those responsibilities into the existing 10-function set. Also remove the legacy duplicate root files listed in the Maintenance rule if they are still present.
