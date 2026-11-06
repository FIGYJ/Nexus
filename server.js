import express from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { chromium } from "playwright-core";
import { isIP } from "node:net";

const app = express();
const PORT = Number(process.env.PORT || 3000);
const MAX_VERIFY_MS = 15_000;

// Deliberately restricted to harmless test domains by default.
// Do NOT add a monetized SmartLink or advertising redirect host here.
const SAFE_TEST_HOSTS = new Set(
  (process.env.SAFE_TEST_HOSTS || "example.com,iana.org")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean)
);

const ALLOWED_ORIGINS = (process.env.FIGYJ_ORIGINS ||
  "https://www.figyj.blog,https://figyj.blog,https://figyj.blogspot.com")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    // Allow non-browser health checks; enforce the configured list for browsers.
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    return callback(new Error("Origin not allowed"));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));
app.use(express.json({ limit: "2kb" }));

app.use("/api/", rateLimit({
  windowMs: 60_000,
  limit: 12,
  standardHeaders: "draft-7",
  legacyHeaders: false
}));

function hostIsAllowed(hostname) {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (!host || isIP(host) !== 0) return false;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    return false;
  }
  return [...SAFE_TEST_HOSTS].some(
    (allowed) => host === allowed || host.endsWith("." + allowed)
  );
}

function validateTestUrl(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new Error("Enter a valid URL.");
  }

  if (url.protocol !== "https:") {
    throw new Error("Only HTTPS test URLs are accepted.");
  }
  if (url.username || url.password) {
    throw new Error("URLs containing credentials are not accepted.");
  }
  if (!hostIsAllowed(url.hostname)) {
    throw new Error("This host is not on the safe test allowlist.");
  }
  return url;
}

app.get("/healthz", (_req, res) => {
  res.json({
    status: "ok",
    service: "FIGYJ Destination Verification",
    mode: "safe-test-only",
    maxVerificationMs: MAX_VERIFY_MS
  });
});

app.post("/api/verify-test", async (req, res) => {
  const startedAt = Date.now();
  let browser;

  try {
    if (!process.env.BROWSERLESS_TOKEN) {
      return res.status(503).json({
        status: "unavailable",
        reason: "Browserless has not been configured on the server."
      });
    }

    const input = req.body?.url;
    if (typeof input !== "string" || input.length > 1500) {
      return res.status(400).json({ status: "invalid", reason: "A URL is required." });
    }

    const startUrl = validateTestUrl(input);
    const endpoint = new URL("wss://production-sfo.browserless.io/chromium/playwright");
    endpoint.searchParams.set("token", process.env.BROWSERLESS_TOKEN);

    const connectTimeout = Math.max(1000, Math.min(7000, MAX_VERIFY_MS - (Date.now() - startedAt)));
    browser = await chromium.connect(endpoint.toString(), { timeout: connectTimeout });

    const context = await browser.newContext({
      javaScriptEnabled: true,
      acceptDownloads: false,
      serviceWorkers: "block"
    });
    const page = await context.newPage();

    // Prevent navigation and subresource requests from leaving the test allowlist.
    await page.route("**/*", async (route) => {
      const requestUrl = route.request().url();
      if (/^(data:|blob:|about:)/i.test(requestUrl)) {
        return route.continue();
      }
      try {
        const parsed = new URL(requestUrl);
        if ((parsed.protocol === "https:" || parsed.protocol === "http:") &&
            hostIsAllowed(parsed.hostname)) {
          return route.continue();
        }
      } catch {
        // Abort malformed or unsupported requests.
      }
      return route.abort("blockedbyclient");
    });

    const remaining = Math.max(1000, MAX_VERIFY_MS - (Date.now() - startedAt));
    const response = await page.goto(startUrl.toString(), {
      waitUntil: "domcontentloaded",
      timeout: Math.min(9000, remaining)
    });

    const finalUrl = new URL(page.url());
    if (!hostIsAllowed(finalUrl.hostname)) {
      return res.status(200).json({
        status: "unverified",
        reason: "The page navigated outside the safe test allowlist.",
        elapsedMs: Date.now() - startedAt
      });
    }

    const metadata = await page.evaluate(() => {
      const getMeta = (selector) =>
        document.querySelector(selector)?.getAttribute("content")?.trim() || "";

      return {
        title: document.title?.trim() || "",
        description:
          getMeta('meta[name="description"]') ||
          getMeta('meta[property="og:description"]') ||
          getMeta('meta[name="twitter:description"]')
      };
    });

    const statusCode = response?.status() ?? null;
    const verified = Boolean(
      response?.ok() && metadata.title && metadata.description
    );

    return res.status(200).json({
      status: verified ? "verified" : "unverified",
      finalUrl: finalUrl.toString(),
      title: metadata.title || null,
      description: metadata.description || null,
      httpStatus: statusCode,
      elapsedMs: Date.now() - startedAt,
      note: "This endpoint is for harmless allowlisted test pages only. It does not inspect advertising links."
    });
  } catch (error) {
    const timedOut = Date.now() - startedAt >= MAX_VERIFY_MS - 250;
    return res.status(200).json({
      status: timedOut ? "timeout" : "unverified",
      reason: timedOut ? "The 15-second verification window expired." : "The test page could not be verified.",
      elapsedMs: Date.now() - startedAt
    });
  } finally {
    if (browser) {
      try { await browser.close(); } catch { /* Ignore cleanup errors. */ }
    }
  }
});

app.get("/", (_req, res) => {
  res.type("text").send("FIGYJ Destination Verification service is running.");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`FIGYJ Destination Verification listening on port ${PORT}`);
});
