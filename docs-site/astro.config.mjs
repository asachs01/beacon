import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { SITE_URL } from "./site.config.mjs";

/** "Edit this page" links. DocsLayout reads this via Vite define. */
const githubEditBase = "https://github.com/asachs01/beacon/edit/main/";

export default defineConfig({
  site: SITE_URL,
  integrations: [
    mdx(),
    sitemap({
      filter: (page) =>
        !page.endsWith("/robots.txt") &&
        !page.endsWith("/llms.txt") &&
        !page.endsWith("/llms-full.txt"),
    }),
  ],
  redirects: {
    "/docs/appearance/fonts": "/docs/customization/fonts/",
  },
  vite: {
    plugins: [tailwindcss()],
    server: {
      fs: {
        // The What's New parser lives in the app tree so root tests do not
        // load this site's Astro tsconfig.
        allow: [".."],
      },
    },
    define: {
      "import.meta.env.GITHUB_EDIT_BASE": JSON.stringify(githubEditBase),
      "import.meta.env.SITE_URL": JSON.stringify(SITE_URL),
    },
  },
  markdown: {
    shikiConfig: {
      theme: "github-dark",
      wrap: true,
    },
  },
});
