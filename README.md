# Go-Tegs International School — current project notes

This repository is the canonical website source. Keep one README and update it when the project structure or deployment rules change.

## Current architecture
- Public site pages live at the project root (`index.html`, `about.html`, `contact.html`, `gallery.html`, `updates.html`, `enrolment.html`, `faq.html`).
- Authenticated student tools live under `/student/`.
- Admin tools live under `/admin/`.
- Lesson Notes content remains under `/lesson-notes/` and is loaded into the private student shell for protected routes.
- Vercel uses 10 Serverless Functions on the Hobby plan.
- Two Supabase projects are used: `gotegs-portal` for the public/browser-side setup and `gotegs-school-portal` for the server-side school/result data, as configured in the project environment/API design.

## Lesson Notes
- Lesson Notes use static DOCX files stored in the repository under `/lesson-notes/documents/`.
- Student navigation remains `Class → Term → Subject → View Note`.
- The View Note page builds a same-site document URL; it does not expose a GitHub raw-file URL.
- Document folders are organised as `/lesson-notes/documents/jss/jss1/term1/`, `/jss/jss2/`, `/jss/jss3/`, and `/ss/ss1/`, `/ss/ss2/`, `/ss/ss3/`, each with `term1`, `term2`, and `term3`.
- Subject filenames should match the subject label exactly, followed by `.docx` (for example `Mathematics.docx`).
- The student View Note page uses Microsoft Office Online to render the same-site DOCX URL in a preview.
- Supabase is no longer used for lesson-note content.
- Upload a class/term's DOCX files to the matching repository folder and test them one by one.

## Quiz
- Practice Library quizzes: unlimited attempts, no class restriction, and non-Maths timing of 15 seconds per question.
- Code-prescribed quizzes retain their own configured class/attempt/time controls.
- Student quiz routes live under `/student/quiz/` and `/student/quiz-code/`.

## Safe cleanup candidates
These files are not referenced by the active application and may be deleted after you confirm there is no separate workflow depending on them:
- `assets/notes.js` — obsolete duplicate of the active `assets/js/notes.js`.
- `assets/js/auth.js` — empty legacy admin auth placeholder; authentication is handled by `assets/js/main.js` and the admin API.
- `assets/js/social-links.js` — currently unreferenced; current pages do not load it.
- `english-20-quiz-import-sample.json` — development/sample quiz only; not required for the live site.

`admin/admin-result/index.html` is a compatibility redirect and can be deleted only after you are comfortable abandoning old bookmarks/links to the former Results admin path.

The SQL files under `/supabase/` are migration/history files and are not loaded by the website. Keep them until the live database schema is backed up in a known master migration; then they can be consolidated rather than deleted piecemeal.
