# Go-Tegs Store + Student Section Label Update

Apply these replacements to the current Go-Tegs project.

## Changes
- Moves Store into `/student/store/index.html`.
- Adds Store to desktop and mobile Student Portal navigation.
- Adds Store card to the Student Dashboard.
- Removes Store from the public navbar.
- Redirects legacy `/store.html` and `/store` URLs to the protected Student Store.
- Displays student sections as **Junior Arm** / **Senior Arm** while retaining the internal Supabase table names for data operations.

## After copying
Delete the old root file: `/store.html`.
Do not change the Supabase `jss_students` / `sss_students` table names; they remain internal identifiers.
