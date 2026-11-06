# FIGYJ Sponsored Content Module

## Preview and admin
- Preview: `/assets/sponsored-preview.html`
- Settings: `/assets/sponsored-admin.html`
- Browser module: `/assets/sponsored-content.js`
- Styles: `/assets/sponsored-content.css`

## Independent placement controls
The admin page manages `article-body`, `after-article`, `related-articles`, and `homepage` separately. Each placement has its own enabled state, headline, description, CTA label, disclosure, HTTPS destination URL, and destination-verification flag. Saving uses the existing `VERIFY_ADMIN_TOKEN` in an Authorization header; the token is not embedded in Blogger or stored by the page.

## Persistence requirement (Supabase)
Sponsored placement settings are stored in the Supabase table `public.figyj_sponsored_config`; they no longer depend on a Render persistent disk. The service reads and writes the single configuration row with `id = 1` through the Supabase REST API.

1. Create a Supabase project and run the SQL in `supabase/sponsored-content.sql` in the Supabase SQL Editor.
2. In the Render service environment, set `SUPABASE_URL` to the project URL and `SUPABASE_SERVICE_ROLE_KEY` to the project's service-role secret.
3. Redeploy the service. Keep `SUPABASE_SERVICE_ROLE_KEY` server-side only: never put it in Blogger, browser JavaScript, public HTML, or a client-side environment variable.

The service returns HTTP 503 for sponsored-config requests when these environment variables are missing. Keep the table protected by Row Level Security and do not add public/anon policies. The server's service-role credential is used only by the backend.

## API
- `GET /api/sponsored-config`: public placement configuration, no secrets.
- `PUT /api/sponsored-config`: requires `Authorization: Bearer VERIFY_ADMIN_TOKEN`; validates and saves settings.

## Safety
- CTAs are reader-initiated HTTPS links with `rel="sponsored noopener noreferrer"`.
- Missing or invalid destinations keep the CTA disabled.
- Destination metadata remains unverified until an editor independently checks it.
- No automatic redirects, popups, prefetch, or impression events.
- The click event hook is not persistent analytics. Keep sponsored clicks separate from pageviews, internal navigation, Mondiad reporting, and simulated lab data.

## Blogger integration
Blogger integration is a later step. Load the CSS/module from Nexus and render only placements enabled in public configuration. Never expose the admin token in Blogger.