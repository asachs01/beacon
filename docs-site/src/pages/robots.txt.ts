import type { APIRoute } from "astro";
import { absoluteUrl } from "../../site.config.mjs";

export const prerender = true;

export const GET: APIRoute = () => {
  const body = `# https://www.robotstxt.org/robotstxt.html
User-agent: *
Allow: /

Sitemap: ${absoluteUrl("sitemap-index.xml")}
`;
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
