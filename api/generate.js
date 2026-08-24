// 생성된 파일입니다. 편집하지 마세요. 소스: server/vercel-generate.ts (npm run build:fn)

// server/env.ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
var DEFAULT_MODEL = "gemini-2.5-flash";
function parseDotEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}
function readDotEnv(dir) {
  for (const name of [".env.local", ".env"]) {
    try {
      return parseDotEnv(readFileSync(resolve(dir, name), "utf8"));
    } catch {
    }
  }
  return {};
}
function loadServerConfig(dir = process.cwd()) {
  const file = readDotEnv(dir);
  return {
    apiKey: process.env.GEMINI_API_KEY || file.GEMINI_API_KEY || "",
    model: process.env.GEMINI_MODEL || file.GEMINI_MODEL || DEFAULT_MODEL
  };
}

// src/core/codec.ts
var TRANSPARENT_CHAR = ".";
var ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+-*/=<>!?@#$%&";
var MAX_SPEC_COLORS = ALPHABET.length;

// server/http.ts
function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}
function readBody(req, maxBytes = 1024 * 1024) {
  return new Promise((resolve2, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > maxBytes) {
        reject(new Error(`\uC694\uCCAD \uBCF8\uBB38\uC774 \uB108\uBB34 \uD07D\uB2C8\uB2E4 (\uCD5C\uB300 ${maxBytes} bytes).`));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve2(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
function requestUrl(req) {
  return new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
}

// server/gemini.ts
var ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
var SYSTEM_INSTRUCTION = [
  "\uB2F9\uC2E0\uC740 \uD53D\uC140 \uC544\uD2B8 \uB3C4\uD130\uC785\uB2C8\uB2E4. \uC694\uCCAD\uBC1B\uC740 \uB300\uC0C1\uC744 \uC9C0\uC815\uB41C \uD06C\uAE30\uC758 \uD53D\uC140 \uADF8\uB9AC\uB4DC\uB85C \uADF8\uB9BD\uB2C8\uB2E4.",
  "",
  "\uADDC\uCE59:",
  "- \uC0C9\uC740 4~10\uC885\uC73C\uB85C \uC81C\uD55C\uD569\uB2C8\uB2E4. \uC0C9\uC774 \uB9CE\uC73C\uBA74 \uD53D\uC140 \uC544\uD2B8\uB85C \uBCF4\uC774\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.",
  "- \uC678\uACFD\uC120\uC740 \uBCF8\uCCB4\uBCF4\uB2E4 \uD6E8\uC52C \uC5B4\uB450\uC6B4 \uC0C9\uC73C\uB85C \uC2E4\uB8E8\uC5E3 \uC804\uCCB4\uB97C \uAC10\uC309\uB2C8\uB2E4.",
  "- \uBA85\uC554\uC740 \uC704\uC5D0\uC11C \uBE5B\uC774 \uC624\uB294 \uAC83\uC73C\uB85C \uD1B5\uC77C\uD569\uB2C8\uB2E4. \uC0C1\uB2E8 \uACBD\uACC4\uB294 \uBC1D\uAC8C, \uD558\uB2E8\uC740 \uC5B4\uB461\uAC8C.",
  "- \uCE94\uBC84\uC2A4\uB97C \uB109\uB109\uD788 \uCC44\uC6B0\uB418 \uC0AC\uBC29 1\uD53D\uC140\uC740 \uBE44\uC6CC \uC678\uACFD\uC120\uC774 \uC798\uB9AC\uC9C0 \uC54A\uAC8C \uD569\uB2C8\uB2E4.",
  '- \uBC30\uACBD\uC740 \uBC18\uB4DC\uC2DC "." (\uD22C\uBA85)\uC73C\uB85C \uB461\uB2C8\uB2E4. \uBC30\uACBD\uC0C9\uC744 \uCE60\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.',
  "- \uC791\uC740 \uD06C\uAE30\uC5D0\uC11C \uD615\uD0DC\uAC00 \uC77D\uD788\uB294 \uAC83\uC774 \uB514\uD14C\uC77C\uBCF4\uB2E4 \uC911\uC694\uD569\uB2C8\uB2E4. \uC2E4\uB8E8\uC5E3\uC744 \uBA3C\uC800 \uC7A1\uC73C\uC138\uC694.",
  "- \uC88C\uC6B0 \uB300\uCE6D\uC774 \uC5B4\uC6B8\uB9AC\uB294 \uB300\uC0C1(\uC0DD\uBB3C, \uC815\uBA74 \uC5BC\uAD74)\uC740 \uB300\uCE6D\uC73C\uB85C \uADF8\uB9BD\uB2C8\uB2E4.",
  "",
  'palette\uC758 char\uB294 \uBC18\uB4DC\uC2DC \uD55C \uAE00\uC790\uC774\uBA70, "." \uC740 \uD22C\uBA85\uC73C\uB85C \uC608\uC57D\uB418\uC5B4 \uC788\uC73C\uB2C8 palette\uC5D0 \uB123\uC9C0 \uB9C8\uC138\uC694.',
  "rows\uB294 \uC815\uD655\uD788 h\uAC1C\uC758 \uBB38\uC790\uC5F4\uC774\uACE0, \uAC01 \uBB38\uC790\uC5F4\uC740 \uC815\uD655\uD788 w\uAE00\uC790\uC5EC\uC57C \uD569\uB2C8\uB2E4. \uAE00\uC790 \uC218\uB97C \uC138\uBA74\uC11C \uC791\uC131\uD558\uC138\uC694."
].join("\n");
var RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    palette: {
      type: "ARRAY",
      description: "\uC0AC\uC6A9\uD560 \uC0C9 \uBAA9\uB85D. 4~10\uAC1C.",
      items: {
        type: "OBJECT",
        properties: {
          char: { type: "STRING", description: "\uADF8\uB9AC\uB4DC\uC5D0\uC11C \uC774 \uC0C9\uC744 \uB098\uD0C0\uB0BC \uD55C \uAE00\uC790" },
          hex: { type: "STRING", description: "#rrggbb \uD615\uC2DD" }
        },
        required: ["char", "hex"]
      }
    },
    rows: {
      type: "ARRAY",
      description: "\uC704\uC5D0\uC11C \uC544\uB798\uB85C h\uAC1C\uC758 \uD589. \uAC01 \uD589\uC740 w\uAE00\uC790.",
      items: { type: "STRING" }
    }
  },
  required: ["palette", "rows"]
};
function repairSpec(raw, w, h) {
  const warnings = [];
  const palette = { [TRANSPARENT_CHAR]: "transparent" };
  for (const entry of raw.palette ?? []) {
    const char = (entry.char ?? "").trim();
    const hex = (entry.hex ?? "").trim();
    if (char.length !== 1 || char === TRANSPARENT_CHAR) continue;
    if (!/^#[0-9a-fA-F]{3,8}$/.test(hex)) continue;
    palette[char] = hex;
  }
  if (Object.keys(palette).length <= 1) {
    throw new Error("\uBAA8\uB378\uC774 \uC4F8 \uC218 \uC788\uB294 \uD314\uB808\uD2B8\uB97C \uBC18\uD658\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.");
  }
  let rows = (raw.rows ?? []).map((r) => String(r));
  if (rows.length !== h) {
    warnings.push(`\uD589 \uC218\uAC00 ${rows.length}\uAC1C\uB85C \uC654\uC2B5\uB2C8\uB2E4. ${h}\uAC1C\uB85C \uB9DE\uCDC4\uC2B5\uB2C8\uB2E4.`);
    rows = rows.slice(0, h);
    while (rows.length < h) rows.push(TRANSPARENT_CHAR.repeat(w));
  }
  let lengthFixes = 0;
  let charFixes = 0;
  rows = rows.map((row) => {
    let fixed = row;
    if (fixed.length !== w) {
      lengthFixes++;
      fixed = fixed.length > w ? fixed.slice(0, w) : fixed + TRANSPARENT_CHAR.repeat(w - fixed.length);
    }
    return [...fixed].map((ch) => {
      if (palette[ch] !== void 0) return ch;
      charFixes++;
      return TRANSPARENT_CHAR;
    }).join("");
  });
  if (lengthFixes > 0) warnings.push(`${lengthFixes}\uAC1C \uD589\uC758 \uAE38\uC774\uB97C ${w}\uAE00\uC790\uB85C \uB9DE\uCDC4\uC2B5\uB2C8\uB2E4.`);
  if (charFixes > 0) warnings.push(`\uD314\uB808\uD2B8\uC5D0 \uC5C6\uB294 \uAE00\uC790 ${charFixes}\uAC1C\uB97C \uD22C\uBA85\uC73C\uB85C \uCC98\uB9AC\uD588\uC2B5\uB2C8\uB2E4.`);
  return { w, h, palette, rows, warnings };
}
async function callGemini(apiKey, model, prompt, w, h) {
  const res = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // 쿼리스트링이 아니라 헤더로 보낸다. URL은 로그와 히스토리에 남는다.
      "x-goog-api-key": apiKey
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      contents: [
        {
          role: "user",
          parts: [{ text: `${w}x${h} \uD53D\uC140 \uC544\uD2B8\uB85C \uADF8\uB824\uC8FC\uC138\uC694: ${prompt}` }]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        temperature: 1
      }
    })
  });
  const bodyText = await res.text();
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const parsed = JSON.parse(bodyText);
      if (parsed.error?.message) detail = `${parsed.error.status ?? res.status}: ${parsed.error.message}`;
    } catch {
      detail = `HTTP ${res.status} ${bodyText.slice(0, 200)}`;
    }
    throw new Error(`Gemini \uD638\uCD9C \uC2E4\uD328 \u2014 ${detail}`);
  }
  const payload = JSON.parse(bodyText);
  if (payload.promptFeedback?.blockReason) {
    throw new Error(`\uC694\uCCAD\uC774 \uCC28\uB2E8\uB418\uC5C8\uC2B5\uB2C8\uB2E4: ${payload.promptFeedback.blockReason}`);
  }
  const text = payload.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (text.trim().length === 0) throw new Error("\uBAA8\uB378\uC774 \uBE48 \uC751\uB2F5\uC744 \uBC18\uD658\uD588\uC2B5\uB2C8\uB2E4.");
  return JSON.parse(text);
}
function createGeminiHandler(config) {
  return async (req, res, url) => {
    if (url.pathname !== "/api/generate") return false;
    if (req.method === "GET") {
      send(res, 200, { ready: config.apiKey.length > 0, model: config.model });
      return true;
    }
    if (req.method !== "POST") {
      send(res, 405, { error: `${req.method} \uB294 \uC9C0\uC6D0\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.` });
      return true;
    }
    if (config.apiKey.length === 0) {
      send(res, 503, {
        error: "GEMINI_API_KEY \uAC00 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4. GEMINI_API_KEY=... \uB85C \uC11C\uBC84\uB97C \uC2E4\uD589\uD558\uAC70\uB098 .env \uC5D0 \uCC44\uC6B0\uC138\uC694."
      });
      return true;
    }
    try {
      const parsed = JSON.parse(await readBody(req, 64 * 1024));
      const prompt = typeof parsed.prompt === "string" ? parsed.prompt.trim() : "";
      const w = Math.min(64, Math.max(8, Number(parsed.w) || 32));
      const h = Math.min(64, Math.max(8, Number(parsed.h) || 32));
      if (prompt.length === 0) {
        send(res, 400, { error: "\uD504\uB86C\uD504\uD2B8\uAC00 \uBE44\uC5B4 \uC788\uC2B5\uB2C8\uB2E4." });
        return true;
      }
      if (Number(parsed.w) > 64 || Number(parsed.h) > 64) {
        send(res, 400, {
          error: "AI \uC0DD\uC131\uC740 64x64\uAE4C\uC9C0 \uC9C0\uC6D0\uD569\uB2C8\uB2E4. \uB354 \uD070 \uCE94\uBC84\uC2A4\uB294 \uC0DD\uC131 \uD6C4 \uD06C\uAE30\uB97C \uB298\uB9AC\uC138\uC694."
        });
        return true;
      }
      const raw = await callGemini(config.apiKey, config.model, prompt, w, h);
      const { warnings, ...spec } = repairSpec(raw, w, h);
      send(res, 200, { spec, warnings, model: config.model });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[gemini] ${message}`);
      send(res, 502, { error: message });
    }
    return true;
  };
}

// server/vercel-generate.ts
var handler = createGeminiHandler(loadServerConfig());
async function generate(req, res) {
  const handled = await handler(req, res, requestUrl(req));
  if (!handled) send(res, 404, { error: "\uC54C \uC218 \uC5C6\uB294 \uC5D4\uB4DC\uD3EC\uC778\uD2B8\uC785\uB2C8\uB2E4." });
}
export {
  generate as default
};
