import express from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { timingSafeEqual } from "node:crypto";
import { chromium } from "playwright-core";

const app = express();
const PORT = Number(process.env.PORT || 10000);
const TEST_URL = process.env.RENDER_EXTERNAL_URL
  ? new URL("/test-redirect", process.env.RENDER_EXTERNAL_URL).toString()
  : "https://example.com";
const MAX_TEST_MS = 15_000;
const SPONSORED_CONFIG_PATH = process.env.FIGYJ_SPONSORED_CONFIG_PATH || "/var/data/sponsored-content.json";
const SPONSORED_PLACEMENTS = ["article-body", "after-article", "related-articles", "homepage"];
const SPONSORED_DEFAULTS = Object.fromEntries(SPONSORED_PLACEMENTS.map((id) => [id, { enabled:false, title:"Discover something worth exploring", description:"Explore an external resource selected for FIGYJ readers.", ctaLabel:"Visit sponsored destination", destinationUrl:"", destinationVerified:false, disclosure:"Sponsored content" }]));

const allowedOrigins = (process.env.FIGYJ_ORIGINS ||
  "https://www.figyj.blog,https://figyj.blog,https://figyj.blogspot.com")
  .split(",").map((value) => value.trim()).filter(Boolean);

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    const renderHost = process.env.RENDER_EXTERNAL_HOSTNAME || "";
    const renderOrigin = renderHost ? "https://" + renderHost : "";
    const renderExternalUrl = process.env.RENDER_EXTERNAL_URL || "";
    if (
      !origin ||
      allowedOrigins.includes(origin) ||
      (renderOrigin && origin === renderOrigin) ||
      (renderExternalUrl && origin === renderExternalUrl)
    ) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  methods: ["GET", "POST", "PUT", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204
}));
app.use(express.json({ limit: "16kb" }));
app.use("/assets", express.static("public", { fallthrough: false }));

app.use("/api/", rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false
}));

function normalizeSponsoredConfig(input) {
  const placements = {};
  for (const id of SPONSORED_PLACEMENTS) {
    const raw = input?.placements?.[id] || {}, base = SPONSORED_DEFAULTS[id];
    const text = (key, max) => typeof raw[key] === "string" ? raw[key].trim().slice(0, max) : base[key];
    const candidate = text("destinationUrl", 2048);
    let destinationUrl = "";
    if (candidate) { try { const u = new URL(candidate); if (u.protocol === "https:" && u.hostname) destinationUrl = u.toString(); } catch {} }
    placements[id] = {
      enabled: raw.enabled === true,
      title: text("title",120) || base.title,
      description: text("description",500) || base.description,
      ctaLabel: text("ctaLabel",70) || base.ctaLabel,
      destinationUrl,
      destinationVerified: raw.destinationVerified === true && Boolean(destinationUrl),
      disclosure: text("disclosure",50) || base.disclosure
    };
  }
  return { placements };
}
function supabaseHeaders(extra = {}) {
  return {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    Authorization: "Bearer " + (process.env.SUPABASE_SERVICE_ROLE_KEY || ""),
    "Content-Type": "application/json",
    ...extra
  };
}
function ensureSupabaseConfigured() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const error = new Error("Supabase storage is not configured.");
    error.code = "SUPABASE_NOT_CONFIGURED";
    throw error;
  }
}
function supabaseRestUrl(query = "") {
  const base = (process.env.SUPABASE_URL || "").replace(/\\/$/, "");
  return base + "/rest/v1/figyj_sponsored_config" + query;
}
async function readSponsoredConfig() {
  ensureSupabaseConfigured();
  const response = await fetch(supabaseRestUrl("?id=eq.1&select=config"), {
    headers: supabaseHeaders(),
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error("Supabase read failed: HTTP " + response.status);
  const rows = await response.json();
  return rows.length ? normalizeSponsoredConfig(rows[0].config) : { placements: structuredClone(SPONSORED_DEFAULTS) };
}
app.get("/api/sponsored-config", async (_req,res) => {
  try { res.set("Cache-Control","no-store").json(await readSponsoredConfig()); }
  catch (error) {
    const missing = error.code === "SUPABASE_NOT_CONFIGURED";
    res.status(missing ? 503 : 500).json({error: missing ? "Sponsored settings storage is not configured." : "Could not read sponsored placement settings."});
  }
});
app.put("/api/sponsored-config", async (req,res) => {
  if (!isAuthorized(req)) return res.status(401).json({error:"Unauthorized."});
  try {
    ensureSupabaseConfigured();
    const config = normalizeSponsoredConfig(req.body);
    const response = await fetch(supabaseRestUrl(), {
      method: "POST",
      headers: supabaseHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify({ id: 1, config, updated_at: new Date().toISOString() }),
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) throw new Error("Supabase write failed: HTTP " + response.status);
    res.set("Cache-Control","no-store").json(config);
  } catch (error) {
    const missing = error.code === "SUPABASE_NOT_CONFIGURED";
    console.error("Sponsored settings storage error:", error.message);
    res.status(missing ? 503 : 500).json({error: missing ? "Supabase storage is not configured on the service." : "Could not save settings to Supabase. Check the database table and server credentials."});
  }
});

function isAuthorized(req) {
  const expected = process.env.VERIFY_ADMIN_TOKEN || "";
  const supplied = (req.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

app.get("/healthz", (_req, res) => {
  res.json({
    status: "ok",
    service: "FIGYJ Destination Verification",
    mode: "browserless-test-smartlink-configuration-and-sponsored-content"
  });
});

app.get("/admin-test", (_req, res) => {
  // A same-origin utility page: the secret is entered by the account owner,
  // sent over HTTPS in an Authorization header, and never stored by this page.
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
  );
  res.type("html").send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FIGYJ Browserless Test</title>
<style>
body{font:16px system-ui,sans-serif;max-width:650px;margin:40px auto;padding:0 18px;color:#172033}
label{display:block;font-weight:650;margin:18px 0 6px}
input{width:100%;box-sizing:border-box;padding:12px;border:1px solid #aab4c2;border-radius:7px;font:inherit}
button{margin-top:16px;padding:12px 18px;border:0;border-radius:7px;background:#174ea6;color:white;font-weight:700;font:inherit;cursor:pointer}
pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f5f8;padding:14px;border-radius:8px}
small{color:#596579}
</style>
</head>
<body>
<h1>FIGYJ Browserless connection test</h1>
<p>This test follows a controlled redirect chain on the FIGYJ service and ends at a harmless page with known metadata. It does not open or inspect advertising links.</p>
<form id="test-form">
<label for="admin-token">VERIFY_ADMIN_TOKEN</label>
<input id="admin-token" type="password" autocomplete="off" required>
<button type="submit">Run harmless Browserless test</button>
</form>
<p><small>Your token is sent only to this FIGYJ service over HTTPS. It is not saved by this page. Do not share it.</small></p>
<hr>
<h2>Monetag SmartLink configuration</h2>
<p>This checks only the saved URL format and zone ID. It does not open the link, follow redirects, or create advertising activity.</p>
<form id="smartlink-form">
<label for="smartlink-token">VERIFY_ADMIN_TOKEN</label>
<input id="smartlink-token" type="password" autocomplete="off" required>
<button type="submit">Check saved SmartLink configuration</button>
</form>
<pre id="smartlink-result" aria-live="polite">Not checked yet.</pre>
<pre id="result" aria-live="polite">Ready when you are.</pre>
<script>
document.getElementById("test-form").addEventListener("submit", async function(event) {
  event.preventDefault();
  const tokenInput = document.getElementById("admin-token");
  const result = document.getElementById("result");
  const token = tokenInput.value;
  result.textContent = "Testing controlled HTTP and JavaScript redirects on FIGYJ…";
  try {
    const response = await fetch("/api/test-browserless", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token
      },
      body: "{}"
    });
    const raw = await response.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      data = { status: "http_error", httpStatus: response.status, response: raw.slice(0, 300) };
    }
    result.textContent = "HTTP " + response.status + "\\n" + JSON.stringify(data, null, 2);
    tokenInput.value = "";
  } catch (error) {
    result.textContent = "Request failed: " + (error && error.message ? error.message : "network error") +
      "\\nReload this page and check the Render deployment status.";
    tokenInput.value = "";
  }
});
document.getElementById("smartlink-form").addEventListener("submit", async function(event) {
  event.preventDefault();
  const tokenInput = document.getElementById("smartlink-token");
  const result = document.getElementById("smartlink-result");
  const token = tokenInput.value;
  result.textContent = "Checking saved URL configuration without opening the SmartLink…";
  try {
    const response = await fetch("/api/smartlink-config", {
      method: "GET",
      headers: { "Authorization": "Bearer " + token }
    });
    const raw = await response.text();
    let data;
    try { data = JSON.parse(raw); }
    catch { data = { status: "http_error", httpStatus: response.status }; }
    result.textContent = "HTTP " + response.status + "\\n" + JSON.stringify(data, null, 2);
  } catch (error) {
    result.textContent = "Request failed: " + (error && error.message ? error.message : "network error");
  } finally {
    tokenInput.value = "";
  }
});
</script>
</body>
</html>`);
});

app.get("/test-landing", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>FIGYJ Metadata Test Page</title>
  <meta name="description" content="This harmless test page confirms that FIGYJ can retrieve a real page title and meta description through Browserless.">
  <meta property="og:description" content="Open test page for FIGYJ metadata extraction.">
</head>
<body>
  <main>
    <h1>Browserless metadata extraction is working</h1>
    <p>This page is hosted by the FIGYJ verification service for safe testing.</p>
  </main>
</body>
</html>`);
});

// Harmless redirect-chain fixtures hosted by this service.
// These routes never touch an advertising network.
app.get("/test-redirect", (_req, res) => {
  res.redirect(302, "/test-js-redirect");
});

app.get("/test-js-redirect", (_req, res) => {
  // Permit the inline JavaScript only on this harmless test fixture.
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
  );
  res.type("html").send(`<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Redirect fixture</title></head>
<body>
  <p>Following a controlled same-site JavaScript redirect…</p>
  <script>
    setTimeout(() => {
      window.location.replace("/test-landing");
    }, 250);
  </script>
</body>
</html>`);
});

app.get("/api/smartlink-config", (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ status: "unauthorized" });
  }

  const configuredUrl = process.env.MONETAG_SMARTLINK_URL || "";
  if (!configuredUrl) {
    return res.status(200).json({
      status: "not_configured",
      requiredEnvironmentVariable: "MONETAG_SMARTLINK_URL",
      inspection: "disabled",
      note: "Add the SmartLink URL in Render environment settings. This endpoint does not open it."
    });
  }

  try {
    const parsed = new URL(configuredUrl);
    const match = parsed.pathname.match(/^\/4\/(\d+)\/?$/);
    const valid = parsed.protocol === "https:" &&
      parsed.hostname === "uplcm.com" &&
      !parsed.username && !parsed.password &&
      !parsed.search && !parsed.hash && Boolean(match);

    if (!valid) {
      return res.status(200).json({
        status: "invalid_configuration",
        inspection: "disabled",
        note: "Expected an HTTPS Monetag SmartLink in the form https://uplcm.com/4/ZONE_ID with no query string."
      });
    }

    return res.json({
      status: "configured_not_inspected",
      provider: "Monetag",
      linkType: "Direct Link (SmartLink)",
      host: parsed.hostname,
      zoneId: match[1],
      inspection: "disabled",
      advertisingEventsGenerated: false,
      note: "Only the saved URL structure was checked. No network request was sent to the SmartLink."
    });
  } catch {
    return res.status(200).json({
      status: "invalid_configuration",
      inspection: "disabled",
      note: "MONETAG_SMARTLINK_URL is not a valid URL."
    });
  }
});

app.post("/api/test-browserless", async (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ status: "unauthorized" });
  }

  const token = process.env.BROWSERLESS_TOKEN || "";
  if (!token) {
    return res.status(503).json({
      status: "not_configured",
      reason: "BROWSERLESS_TOKEN is not configured on the server."
    });
  }

  let browser;
  let stage = "connect_browserless";
  const startedAt = Date.now();
  let timeoutId;

  try {
    const endpoint = new URL("wss://production-sfo.browserless.io");
    endpoint.searchParams.set("token", token);

    const browserPromise = (async () => {
      browser = await chromium.connectOverCDP(endpoint.toString(), {
        timeout: 8_000
      });
      stage = "create_browser_page";
      const context = browser.contexts()[0] || await browser.newContext();
      const page = await context.newPage();
      const redirectTrail = [];
      page.on("response", (navigationResponse) => {
        if (navigationResponse.request().isNavigationRequest()) {
          redirectTrail.push({
            url: navigationResponse.url(),
            status: navigationResponse.status()
          });
        }
      });

      stage = "follow_http_redirect";
      const response = await page.goto(TEST_URL, {
        waitUntil: "domcontentloaded",
        timeout: 7_000
      });

      // The fixture includes a brief JavaScript redirect after the HTTP 302.
      stage = "follow_javascript_redirect";
      await page.waitForURL((url) => url.pathname === "/test-landing", {
        timeout: 5_000
      });

      stage = "extract_metadata";
      const metadata = await page.evaluate(() => ({
        title: document.title?.trim() || null,
        description:
          document.querySelector('meta[name="description"]')
            ?.getAttribute("content")?.trim() ||
          document.querySelector('meta[property="og:description"]')
            ?.getAttribute("content")?.trim() || null,
        heading: document.querySelector("h1")?.textContent?.trim() || null
      }));

      return {
        status: response?.ok() && metadata.title ? "connected" : "partial",
        testUrl: TEST_URL,
        finalUrl: page.url(),
        httpStatus: response?.status() ?? null,
        redirectTrail,
        ...metadata,
        elapsedMs: Date.now() - startedAt,
        note: "Harmless same-site redirect test only. No advertising link was opened."
      };
    })();

    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error("The 15-second test window expired."));
      }, MAX_TEST_MS);
    });

    const result = await Promise.race([browserPromise, timeoutPromise]);
    return res.json(result);
  } catch (error) {
    const timedOut = Date.now() - startedAt >= MAX_TEST_MS - 250 ||
      error?.message?.includes("15 seconds");
    const safeMessage = String(error?.message || "Unknown error")
      .replaceAll(token, "[credential redacted]")
      .slice(0, 220);
    return res.json({
      status: timedOut ? "timeout" : "failed",
      stage,
      reason: timedOut
        ? "The 15-second test window expired."
        : "The harmless redirect test failed at the reported stage.",
      diagnostic: safeMessage,
      elapsedMs: Date.now() - startedAt
    });
  } finally {
    clearTimeout(timeoutId);
    try { await browser?.close(); } catch { /* best-effort cleanup */ }
  }
});

app.get("/", (_req, res) => {
  res.type("text").send("FIGYJ Destination Verification service is running.");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("FIGYJ Destination Verification listening on port " + PORT);
});
