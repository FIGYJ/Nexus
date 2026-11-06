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
