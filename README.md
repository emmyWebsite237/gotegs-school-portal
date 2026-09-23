# Go-Tegs International School Website — Canonical Project Notes

This repository is the maintained source for the Go-Tegs public website, private student portal, admin workspace, lesson notes, records, results, quiz-code system and school store. Future edits should be made against the latest canonical project structure rather than stacking old patch ZIPs.

## Project layout

- `index.html` — public homepage
- `about.html`, `contact.html`, `enrolment.html`, `faq.html`, `gallery.html`, `updates.html` — public-site pages
- `student/` — authenticated student workspace and student-only tools
- `admin/` — authenticated admin workspace and management directories
- `lesson-notes/` — legacy/compatible lesson-note routes kept because existing links and relative class/term paths depend on them
- `assets/css/` — shared, admin and portal styles
- `assets/js/` — shared browser runtime and feature scripts
- `api/` — exactly 10 Vercel Serverless Functions; do not add a new function casually on the Hobby plan
- `partials/` — public navbar/footer and private student shell
- `supabase/` — database migrations kept in numbered order

## Current student portal

The private portal contains Dashboard, Profile, Results, Lesson Notes, Quiz & Practice, Quiz Code, Store, Tournaments (Coming Soon) and School Leaving Testimonial (Coming Soon). Public navigation/footer is not shown inside the authenticated student workspace.

The Store is canonical at `student/store/index.html`. The old root `store.html` is removed from the source and `/store.html` is redirected to the private student store for legacy bookmarks.

## Admin workspace

The admin area remains private and uses the existing authentication flow. Student details and results are edited together under `admin/admin-records/`. Lesson Note administration remains under `admin/admin-notes/` with its existing JSS/SSS class/term directories. The old `admin/admin-result/` page is retained as a compatibility redirect to the combined Students & Results workspace.

## Supabase separation

There are two Supabase projects with different responsibilities.

1. `gotegs-portal` — the browser-facing portal configuration uses the public URL/anon key that is already intentionally present in GitHub/frontend code.
2. `gotegs-school-portal` — server-side/admin/results functionality uses deployment environment variables such as `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Never place a service-role key in frontend code or GitHub.

## Vercel

The project is configured as ESM (`"type": "module"`) with Node 24.x. The deployed API count is intentionally held to 10. Before adding an endpoint, consolidate it into an existing function where practical.

## Cleanup rules

These files are temporary/duplicate and should not be reintroduced:

- `README.txt` — duplicate of the canonical `README.md`
- `DELETE-api-admin-settings.md` — temporary patch instruction, not application code
- `assets/notes.js` — obsolete duplicate/bridge script; the active lesson-note runtime is `assets/js/notes.js`
- `store.html` — old public store location; use `student/store/index.html` instead

The compatibility file `admin/admin-result/index.html` is intentionally kept as a legacy redirect. The testimonial API is also intentionally retained for future reactivation even though that student module is currently marked Coming Soon.

## Editing rule for future changes

Keep one canonical `README.md`. Keep application code in its proper directory. When making a change, modify the existing canonical file rather than creating another numbered/temporary copy. Update this README only when a structural rule, integration, route, or deployment convention changes.

## Deployment

Preserve the two Supabase project separation described above. After database changes, run the numbered SQL migration in the correct Supabase project before deploying dependent frontend/API code.
