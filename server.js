import express from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { timingSafeEqual } from "node:crypto";
import { chromium } from "playwright-core";

const app = express();
const PORT = Number(process.env.PORT || 10000);
const TEST_URL = "https://example.com";
const MAX_TEST_MS = 15_000;

const allowedOrigins = (process.env.FIGYJ_ORIGINS ||
  "https://www.figyj.blog,https://figyj.blog,https://figyj.blogspot.com")
  .split(",").map((value) => value.trim()).filter(Boolean);

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Origin not allowed"));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json({ limit: "1kb" }));

app.use("/api/", rateLimit({
  windowMs: 60_000,
  limit: 8,
  standardHeaders: "draft-7",
  legacyHeaders: false
}));

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
    mode: "browserless-connection-test-only"
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
<p>This test visits <strong>https://example.com</strong> only. It does not open or inspect advertising links.</p>
<form id="test-form">
<label for="admin-token">VERIFY_ADMIN_TOKEN</label>
<input id="admin-token" type="password" autocomplete="off" required>
<button type="submit">Run harmless Browserless test</button>
</form>
<p><small>Your token is sent only to this FIGYJ service over HTTPS. It is not saved by this page. Do not share it.</small></p>
<pre id="result" aria-live="polite">Ready when you are.</pre>
<script>
document.getElementById("test-form").addEventListener("submit", async function(event) {
  event.preventDefault();
  const tokenInput = document.getElementById("admin-token");
  const result = document.getElementById("result");
  const token = tokenInput.value;
  result.textContent = "Testing Browserless with example.com…";
  try {
    const response = await fetch("/api/test-browserless", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token
      },
      body: "{}"
    });
    const data = await response.json();
    result.textContent = JSON.stringify(data, null, 2);
    tokenInput.value = "";
  } catch (error) {
    result.textContent = "The request could not be completed. Check the service and try again.";
    tokenInput.value = "";
  }
});
</script>
</body>
</html>`);
});

app.post("/api/test-browserless", async (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ status: "unauthorized" });
  }

  const token = process.env.BROWSERLESS_TOKEN;
  if (!token) {
    return res.status(503).json({
      status: "not_configured",
      reason: "BROWSERLESS_TOKEN is not configured on the server."
    });
  }

  let browser;
  const startedAt = Date.now();
  let timeoutId;

  try {
    const endpoint = new URL("wss://production-sfo.browserless.io/");
    endpoint.searchParams.set("token", token);

    const browserPromise = (async () => {
      browser = await chromium.connectOverCDP(endpoint.toString(), {
        timeout: 8_000
      });
      const context = browser.contexts()[0] || await browser.newContext();
      const page = await context.newPage();

      const response = await page.goto(TEST_URL, {
        waitUntil: "domcontentloaded",
        timeout: 7_000
      });

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
        ...metadata,
        elapsedMs: Date.now() - startedAt,
        note: "Harmless connection test only. No advertising link was opened."
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
    return res.json({
      status: timedOut ? "timeout" : "failed",
      reason: timedOut
        ? "The 15-second test window expired."
        : "Browserless could not complete the harmless test. Check server logs and credentials.",
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
