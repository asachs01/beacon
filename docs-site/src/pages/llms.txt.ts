import type { APIRoute } from "astro";
import { renderLlms } from "../lib/llms";

export const prerender = true;

export const GET: APIRoute = () =>
  new Response(renderLlms("llms.txt"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
