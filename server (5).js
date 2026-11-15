import express from "express";
import rateLimit from "express-rate-limit";

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "50kb" }));
app.use(express.static("public"));

const KEY = process.env.GEMINI_API_KEY;
// Əvvəlcə sürətli və az yüklənən modellər. İstəsəniz GEMINI_MODEL ilə öz modelinizi birinci qoya bilərsiniz.
const CANDIDATES = [
  process.env.GEMINI_MODEL,
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-flash-lite-latest",
  "gemini-flash-latest",
].filter(Boolean);
const uniq = (a) => [...new Set(a)];
let good = null; // axırıncı işləyən model

const SYSTEM =
  "This API serves only a historical role-play chat website. Only do tasks of that kind: " +
  "output the requested JSON profile of a historical figure, or reply in character as one. " +
  "Politely refuse anything unrelated (coding, homework, general assistant tasks).";

const limiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: Number(process.env.RATE_LIMIT || 30),
  standardHeaders: true,
  legacyHeaders: false,
});

const valid = (m) =>
  Array.isArray(m) && m.length > 0 && m.length <= 20 &&
  m[0].role === "user" && m[m.length - 1].role === "user" &&
  m.every((x) => x && (x.role === "user" || x.role === "assistant") &&
    typeof x.content === "string" && x.content.length > 0 && x.content.length <= 4000);

const SAFETY = [
  "HARM_CATEGORY_HARASSMENT",
  "HARM_CATEGORY_HATE_SPEECH",
  "HARM_CATEGORY_SEXUALLY_EXPLICIT",
  "HARM_CATEGORY_DANGEROUS_CONTENT",
].map((category) => ({ category, threshold: "BLOCK_ONLY_HIGH" }));

const mk = (messages, json, thinking) => ({
  systemInstruction: { parts: [{ text: SYSTEM }] },
  contents: messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  })),
  generationConfig: {
    maxOutputTokens: json ? 3000 : 1500,
    ...(thinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
    ...(json ? { responseMimeType: "application/json" } : {}),
  },
  safetySettings: SAFETY,
});

const go = (model, body, ms) =>
  fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": KEY },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(ms),
  });

const textOf = (d) => (d.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");

// Modelləri növbə ilə yoxlayır: biri məşğul, yavaş və ya tapılmayanda növbətiyə keçir.
async function ask(messages, json) {
  const order = uniq([good, ...CANDIDATES].filter(Boolean));
  const t0 = Date.now();
  let lastErr = "no_model";
  for (const m of order) {
    const left = 42000 - (Date.now() - t0);
    if (left < 5000) break;
    try {
      let r = await go(m, mk(messages, json, true), Math.min(12000, left));
      if (r.status === 400) r = await go(m, mk(messages, json, false), Math.min(12000, left));
      if (r.status === 401 || r.status === 403) {
        console.error("key problem", r.status, (await r.text()).slice(0, 300));
        return { error: "key", status: r.status };
      }
      if (!r.ok) {
        lastErr = String(r.status);
        console.error("model", m, r.status, (await r.text()).slice(0, 200));
        continue;
      }
      const text = textOf(await r.json());
      if (!text) { lastErr = "empty"; console.error("model", m, "empty reply"); continue; }
      good = m;
      console.log("ok", m, json ? "json" : "chat", Date.now() - t0, "ms");
      return { text };
    } catch (e) {
      lastErr = e.name;
      console.error("model", m, "fail", e.name);
    }
  }
  return { error: "upstream", status: lastErr };
}

app.post("/api/chat", limiter, async (req, res) => {
  const { messages, json } = req.body || {};
  if (!KEY) return res.status(500).json({ error: "no_key" });
  if (!valid(messages)) return res.status(400).json({ error: "bad_request" });
  const r = await ask(messages, !!json);
  if (r.text) return res.json({ text: r.text });
  res.status(r.status === "429" ? 429 : 502).json(r);
});

// Yoxlama səhifəsi: brauzerdə /api/test açın. Hansı modelin işlədiyini göstərir.
app.get("/api/test", limiter, async (_req, res) => {
  if (!KEY) return res.json({ key: "YOXDUR: Render Environment-də GEMINI_API_KEY əlavə edin" });
  const out = await Promise.all(
    uniq(CANDIDATES).map(async (m) => {
      const t = Date.now();
      try {
        const r = await go(m, mk([{ role: "user", content: "Say OK" }], false, true), 15000);
        const body = await r.text();
        return { model: m, status: r.status, ms: Date.now() - t, info: r.ok ? "işləyir" : body.slice(0, 160) };
      } catch (e) {
        return { model: m, status: "timeout/xəta", ms: Date.now() - t, info: e.name };
      }
    })
  );
  res.json({ key: "var", results: out });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("ChatWithHistory: http://localhost:" + port));
