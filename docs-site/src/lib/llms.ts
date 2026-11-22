import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { applySiteUrl } from "../../site.config.mjs";

function readTemplate(name: string): string {
  const candidates = [
    path.resolve(process.cwd(), "llms", name),
    path.resolve(process.cwd(), "docs-site", "llms", name),
  ];
  const file = candidates.find((candidate) => existsSync(candidate));
  if (!file) {
    throw new Error(`Missing ${name}. Looked in: ${candidates.join(", ")}`);
  }
  return readFileSync(file, "utf8");
}

/** llms.txt body with __SITE_URL__ replaced. Prose stays in docs-site/llms/. */
export function renderLlms(name: "llms.txt" | "llms-full.txt"): string {
  return applySiteUrl(readTemplate(name));
}
