import express from "express";
import rateLimit from "express-rate-limit";

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "50kb" }));
app.use(express.static("public"));

const KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const SYSTEM =
  "This API serves only a historical role-play chat website. Only do tasks of that kind: " +
  "output the requested JSON profile of a historical figure, or reply in character as one. " +
  "Politely refuse anything unrelated (coding, homework, general assistant tasks).";

const limiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: Number(process.env.RATE_LIMIT || 20),
  standardHeaders: true,
  legacyHeaders: false,
});

const valid = (m) =>
  Array.isArray(m) && m.length > 0 && m.length <= 20 &&
  m[0].role === "user" && m[m.length - 1].role === "user" &&
  m.every((x) => x && (x.role === "user" || x.role === "assistant") &&
    typeof x.content === "string" && x.content.length > 0 && x.content.length <= 4000);

const go = (body) =>
  fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": KEY },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45000),
  });

app.post("/api/chat", limiter, async (req, res) => {
  const { messages, json } = req.body || {};
  if (!KEY) return res.status(500).json({ error: "no_key" });
  if (!valid(messages)) return res.status(400).json({ error: "bad_request" });
  const t0 = Date.now();
  try {
    const body = {
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      generationConfig: {
        maxOutputTokens: json ? 4096 : 2048,
        thinkingConfig: { thinkingBudget: 0 }, // düşünmə rejimini söndürür: daha sürətli
        ...(json ? { responseMimeType: "application/json" } : {}),
      },
      safetySettings: [
        "HARM_CATEGORY_HARASSMENT",
        "HARM_CATEGORY_HATE_SPEECH",
        "HARM_CATEGORY_SEXUALLY_EXPLICIT",
        "HARM_CATEGORY_DANGEROUS_CONTENT",
      ].map((category) => ({ category, threshold: "BLOCK_ONLY_HIGH" })),
    };
    let r = await go(body);
    if (r.status === 400) {
      // bu model thinkingConfig-i qəbul etmirsə, onsuz yenidən cəhd et
      delete body.generationConfig.thinkingConfig;
      r = await go(body);
    }
    if (r.status === 429) return res.status(429).json({ error: "quota" });
    if (!r.ok) {
      console.error("gemini", r.status, await r.text());
      return res.status(502).json({ error: "upstream" });
    }
    const d = await r.json();
    const text = (d.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
    if (!text) {
      console.error("empty reply", JSON.stringify(d.promptFeedback), d.candidates?.[0]?.finishReason);
      return res.status(502).json({ error: "empty" });
    }
    console.log("ok", json ? "json" : "chat", Date.now() - t0, "ms");
    res.json({ text });
  } catch (e) {
    console.error("fail", e.name, e.message);
    res.status(502).json({ error: "upstream" });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("ChatWithHistory: http://localhost:" + port));
