Go-Tegs functional portal patch

1. Replaces the student PIN-only result check flow.
2. Adds the admin Result Archive PDF page and read-only export action; it does not change student check_count.
3. Refreshes the student profile-picture onboarding and profile removal behavior.
4. Refreshes the private student portal palette/layout and fixes the custom pointer from sticking after clicks.
5. No new Vercel Serverless Function is added; the export action is consolidated into api/admin-students.js.

Replace files at their exact paths.
