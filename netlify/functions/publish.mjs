/*
  Δρ. Βεράνης — one-click publishing for admin.html (Netlify Function, no tokens in the browser).

  POST /api/publish   { pass, action:"login" }                 -> { ok }
  POST /api/publish   { pass, action:"publish", content }      -> { ok, where:"blobs"|"github", when }
  GET  /api/publish                                            -> { ok:true, blobs, github, translate }  (status)

  Live content is stored in Netlify Blobs (instant, no rebuild). content.json in the repo stays the
  fallback / first version. If GITHUB_TOKEN is set in the site's environment variables the same
  content is also committed to the repo so the two never drift.

  Passcode: compared against ADMIN_PASS_SHA256 (sha-256 of the passcode). Change the passcode by
  changing that constant (or set the ADMIN_PASS env var in Netlify, which wins).
*/
import { getStore } from "@netlify/blobs";

const ADMIN_PASS_SHA256 = "14b06e18cdf359514722c2ea199d52f052dd88207d49d5a7c0bcde0e7accecfe";
const STORE = "veranis-content";
const KEY = "content.json";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function checkPass(pass) {
  if (typeof pass !== "string" || !pass) return false;
  const env = process.env.ADMIN_PASS;
  if (env) return pass === env;
  return (await sha256(pass)) === ADMIN_PASS_SHA256;
}

async function commitToGitHub(text) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return null;
  const repo = process.env.GITHUB_REPO || "agelmet/VERANIS";
  const branch = process.env.GITHUB_BRANCH || "main";
  const api = `https://api.github.com/repos/${repo}/contents/content.json`;
  const head = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "veranis-admin",
  };
  let sha = null;
  const cur = await fetch(`${api}?ref=${encodeURIComponent(branch)}`, { headers: head });
  if (cur.ok) sha = (await cur.json()).sha;
  else if (cur.status !== 404) throw new Error("GitHub " + cur.status);
  const body = {
    message: "Ενημέρωση περιεχομένου από τον πίνακα διαχείρισης",
    content: Buffer.from(text, "utf8").toString("base64"),
    branch,
  };
  if (sha) body.sha = sha;
  const put = await fetch(api, { method: "PUT", headers: head, body: JSON.stringify(body) });
  if (!put.ok) throw new Error("GitHub " + put.status);
  return true;
}

export default async (req) => {
  if (req.method === "GET") {
    return json({
      ok: true,
      blobs: true,
      github: !!process.env.GITHUB_TOKEN,
      translate: !!process.env.ANTHROPIC_API_KEY,
    });
  }
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ ok: false, error: "bad json" }, 400); }

  if (!(await checkPass(body.pass))) return json({ ok: false, error: "pass" }, 401);

  if (body.action === "login") return json({ ok: true });

  if (body.action === "publish") {
    const content = body.content;
    if (!content || typeof content !== "object" || !Array.isArray(content.reviews)) {
      return json({ ok: false, error: "content" }, 400);
    }
    content.updated = new Date().toISOString().slice(0, 10);
    const text = JSON.stringify(content, null, 1);
    let where = "blobs";
    try {
      const store = getStore(STORE);
      await store.set(KEY, text);
    } catch (e) {
      // Blobs unavailable — fall back to a direct GitHub commit if a token is configured.
      const ok = await commitToGitHub(text).catch((err) => { throw err; });
      if (!ok) return json({ ok: false, error: "blobs: " + (e && e.message) }, 500);
      where = "github";
      return json({ ok: true, where, when: content.updated, note: "rebuild" });
    }
    // Best effort: keep the repo copy in sync too.
    try { await commitToGitHub(text); } catch { /* ignore — blob is already live */ }
    return json({ ok: true, where, when: content.updated });
  }

  return json({ ok: false, error: "action" }, 400);
};

export const config = { path: "/api/publish" };
