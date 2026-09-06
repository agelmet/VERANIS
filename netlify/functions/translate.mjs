/*
  Greek -> English translation for admin.html ("Μετάφραση στα αγγλικά").
  POST /api/translate  { pass, items:[{ id, text }] }  ->  { ok, items:[{ id, text }] }
  Needs ANTHROPIC_API_KEY in the site's environment variables (Netlify → Site configuration →
  Environment variables). Without it the admin shows a friendly "not enabled" message.
*/
import { checkPass } from "./publish.mjs";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

export default async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);
  let body;
  try { body = await req.json(); } catch { return json({ ok: false, error: "bad json" }, 400); }
  if (!(await checkPass(body.pass))) return json({ ok: false, error: "pass" }, 401);

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return json({ ok: false, error: "no-key" }, 503);

  const items = Array.isArray(body.items) ? body.items.slice(0, 40) : [];
  if (!items.length) return json({ ok: true, items: [] });

  const prompt =
    "You translate website copy for a neurosurgeon's private practice in Athens from Greek to natural, " +
    "professional British English. Keep medical terms accurate, keep line breaks (\\n) and <br> tags where they " +
    "appear, keep names, numbers and times unchanged, and never add or remove information. " +
    "Reply ONLY with a JSON array of objects {\"id\":…, \"text\":…} in the same order, nothing else.\n\n" +
    JSON.stringify(items.map((it) => ({ id: String(it.id), text: String(it.text || "") })));

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.TRANSLATE_MODEL || "claude-sonnet-4-5",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!r.ok) return json({ ok: false, error: "anthropic " + r.status }, 502);
  const data = await r.json();
  const raw = (data.content || []).map((c) => c.text || "").join("");
  const m = raw.match(/\[[\s\S]*\]/);
  let out = [];
  try { out = JSON.parse(m ? m[0] : raw); } catch { return json({ ok: false, error: "parse" }, 502); }
  return json({ ok: true, items: out.map((o) => ({ id: String(o.id), text: String(o.text || "") })) });
};

export const config = { path: "/api/translate" };
