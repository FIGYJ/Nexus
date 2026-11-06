# FIGYJ Sponsored Content Module

## Preview and admin
- Preview: `/assets/sponsored-preview.html`
- Settings: `/assets/sponsored-admin.html`
- Browser module: `/assets/sponsored-content.js`
- Styles: `/assets/sponsored-content.css`

## Independent placement controls
The admin page manages `article-body`, `after-article`, `related-articles`, and `homepage` separately. Each placement has its own enabled state, headline, description, CTA label, disclosure, HTTPS destination URL, and destination-verification flag. Saving uses the existing `VERIFY_ADMIN_TOKEN` in an Authorization header; the token is not embedded in Blogger or stored by the page.

## Persistence requirement
Settings are stored at `FIGYJ_SPONSORED_CONFIG_PATH`, defaulting to `/var/data/sponsored-content.json`. On Render, attach a persistent disk mounted at `/var/data` to retain settings across redeploys and restarts. Without a persistent disk, the service filesystem may be cleared during redeploy/restart. Set `FIGYJ_SPONSORED_CONFIG_PATH` if using another persistent mount.

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