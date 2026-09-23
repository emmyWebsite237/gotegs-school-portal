# Go-Tegs Deep Student Portal Rendering Fix

Built against gotegs-school-portal-main (9).

Root cause:
- `/lesson-notes/...` legacy pages are intentionally treated as authenticated student routes by `assets/js/main.js`.
- Those pages loaded only `style.css`, while the shared runtime injected the private student shell.
- The shell therefore rendered as plain HTML, causing the repeated logo/nav/mobile elements and huge whitespace seen on direct lesson-note URLs.

Fix:
- `main.js` now centrally ensures `/assets/css/portal.css` for every protected student route.
- Legacy `/lesson-notes/...` pages also load `portal.css` directly and use the private shell body class, preventing first-paint unstyled shell rendering.
- The Student Store and key student pages use the same direct protection.
- Portal palette is refreshed to a modern ink/violet/mint system rather than the old maroon/gold look.
- No database/API changes and no new Vercel function.

Replace files at their exact paths. Do not remove the existing `/lesson-notes/...` pages.
