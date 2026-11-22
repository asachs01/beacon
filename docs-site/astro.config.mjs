import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";

/** "Edit this page" links. DocsLayout reads this via Vite define. */
const githubEditBase = "https://github.com/asachs01/beacon/edit/main/";

export default defineConfig({
  site: "https://beacon-family-docs.netlify.app",
  integrations: [mdx(), sitemap()],
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
    },
  },
  markdown: {
    shikiConfig: {
      theme: "github-dark",
      wrap: true,
    },
  },
});
