/*
  Serves the live content.json published from admin.html (stored in Netlify Blobs).
  GET /api/content  -> the JSON, or 404 when nothing has been published yet
  (index.html and admin.html then fall back to the content.json in the repo).
*/
import { getStore } from "@netlify/blobs";

export default async () => {
  try {
    const store = getStore("veranis-content");
    const text = await store.get("content.json");
    if (!text) return new Response("", { status: 404, headers: { "cache-control": "no-store" } });
    return new Response(text, {
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  } catch {
    return new Response("", { status: 404, headers: { "cache-control": "no-store" } });
  }
};

export const config = { path: "/api/content" };
