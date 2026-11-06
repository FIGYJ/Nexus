# FIGYJ Sponsored Content Module

## One placement only
FIGYJ has exactly one sponsored-content placement and one shared configuration object. No separate article, after-article, related-content, or homepage placement controls exist.

## Separate verification records
- `providerLinkConfirmed`: editor-confirmed check that the exact SmartLink and zone ID match the user's Monetag account. It does not verify the offers served.
- `advertiserReviewStatus`: one of `not-reviewed`, `reviewed-no-concern`, or `concern-found`.
- `reviewedDestinationUrl`: the exact HTTPS landing-page URL that was inspected. It must be a specific destination, not the rotating SmartLink itself.
- `advertiserReviewNotes`: editor's notes about the inspection. A review status is retained only when an exact destination URL and notes are supplied.

A rotating SmartLink can serve different advertiser offers over time or across visitors. A review of one landing page must never be represented as approval of all SmartLink offers. The browser module therefore makes no universal advertiser-verification claim.

## Admin and preview
- Preview: `/assets/sponsored-preview.html` — read-only live view of the saved placement and verification records.
- Settings: `/assets/sponsored-admin.html`
- Browser module: `/assets/sponsored-content.js`
- Styles: `/assets/sponsored-content.css`

## Persistence and security
Settings are stored in `public.figyj_sponsored_config` as singleton row `id = 1`. Render uses `SUPABASE_URL` and the server-only `SUPABASE_SERVICE_ROLE_KEY`. Keep RLS enabled and do not add public/anon policies. Admin writes require `VERIFY_ADMIN_TOKEN` in an Authorization header; never put secrets in Blogger or browser code.

## API
- `GET /api/sponsored-config`: returns one public `placement` object.
- `PUT /api/sponsored-config`: validates and saves that single placement.

## Read-only live preview
The preview fetches the saved placement from `GET /api/sponsored-config` with caching disabled. It displays the saved creative, enabled state, SmartLink URL, provider-link confirmation, and any destination-specific advertiser review record. The saved CTA label is rendered as a disabled button, never as an anchor. The preview does not submit configuration changes, open the SmartLink, follow redirects, or emit impression/click analytics events. A manual refresh performs another read-only GET.

## Safety
- CTA is a reader-initiated HTTPS link with `rel="sponsored noopener noreferrer"`.
- FIGYJ does not automatically open SmartLinks, follow redirects, or generate advertising events for verification.
- A provider-link confirmation is not advertiser approval. An advertiser review applies only to its recorded exact landing-page URL and inspection notes.
- Keep sponsored clicks separate from pageviews, internal navigation, Mondiad reporting, and simulated lab data.

Blogger integration remains a later step. Never expose the admin token or Supabase service-role credential in Blogger.