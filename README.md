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
The active editor is the former paste/type HTML editor. Document-upload lesson notes are not yet active. The old general “download all lesson notes” panel was intentionally removed.

Long unbroken note strings (including dotted leader lines) are contained with `overflow-wrap: anywhere` and fixed-width table/content rules so they do not extend beyond the reading box on mobile.

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


## Lesson Notes — GitHub document mode
Lesson notes are now sourced from public GitHub DOCX files instead of Supabase. Configure the repository once in `assets/js/github-notes-config.js`. Upload documents under `lesson-documents/jss/...` or `lesson-documents/ss/...` using the subject name as the filename. The student flow remains Class → Term → Subject → View Note; View Note opens a document preview. The GitHub repository must be public for the preview URL to be reachable.
