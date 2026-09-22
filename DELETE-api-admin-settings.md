# Required one-time deletion

Before redeploying, delete this file from the GitHub repository:

`api/admin-settings.js`

Why: Vercel Hobby allows no more than 12 Serverless Functions in one Deployment. Your current deployment has 13 because `api/admin-settings.js` is an extra function.

Its GET/POST behavior has been consolidated into:

`/api/admin-verify?settings=1`

The included `vercel.json` rewrite also keeps any existing frontend calls to `/api/admin-settings` working, so you do not need to hunt down every old URL.
