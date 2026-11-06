# FIGYJ Nexus — Deployment

## Render Web Service settings

- Repository: FIGYJ/Nexus
- Branch: main
- Runtime: Node
- Root Directory: leave blank
- Build Command: npm install
- Start Command: npm start
- Health Check Path: /healthz

## Required Render environment variables

Add these in the Render service's Environment settings. Never commit their values to GitHub or place them in Blogger HTML.

- BROWSERLESS_TOKEN: private token from your Browserless dashboard.
- VERIFY_ADMIN_TOKEN: a long random secret (at least 32 random characters).
- FIGYJ_ORIGINS: optional comma-separated browser origins. Defaults to the known FIGYJ Blogger domains.\n- MONETAG_SMARTLINK_URL: `https://uplcm.com/4/8865570` (configuration only; never opened by the verification endpoint).

## First test

1. Deploy the service.
2. Open https://YOUR-SERVICE.onrender.com/healthz. It should return JSON with status "ok".
3. Call POST /api/test-browserless with Authorization: Bearer YOUR_VERIFY_ADMIN_TOKEN and an empty JSON body.
4. This endpoint opens only https://example.com through Browserless and returns its title, description, heading, final URL and HTTP status.

The browserless test endpoint deliberately does not accept arbitrary URLs. It does not inspect Monetag, Adsterra, HilltopAds, Mondiad or any advertising redirect.\n\n## Monetag SmartLink configuration check\n\n1. Add `MONETAG_SMARTLINK_URL` in Render Environment with the publisher's SmartLink URL.\n2. Open `/admin-test` and use the **Check saved SmartLink configuration** form.\n3. The authenticated endpoint validates HTTPS, the `uplcm.com/4/ZONE_ID` path and reports the zone ID. It does not make a network request to the SmartLink, follow redirects, or generate ad events.\n4. Live destination inspection remains disabled; this configuration check does not reveal the advertiser landing page.

## Safety and limitations

- Automated inspection of advertising redirect links remains disabled pending provider-specific guidance.
- A server-side observation cannot guarantee the exact offer delivered to an individual reader.
- This scaffold does not generate or measure advertising clicks or impressions.
- Monetag's reported impressions, clicks and revenue remain separate from FIGYJ pageviews and outbound-click measurements.
- The 15-second limit applies to this harmless connectivity test; it is not a promise that every destination can be verified within that time.
