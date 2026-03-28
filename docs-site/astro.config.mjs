import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tinker from '@asachs01/astro-tinker';

export default defineConfig({
  site: 'https://sachsha.us/beacon',
  base: '/beacon',
  integrations: [
    sitemap(),
    tinker({
      site: {
        title: 'Beacon',
        tagline: "Your family's daily signal",
        description:
          'A beautiful, open-source family command center for wall-mounted displays. Replace your Skylight with something better.',
        author: 'Beacon Contributors',
      },
      nav: {
        links: [
          { label: 'Home', href: '/' },
          { label: 'Docs', href: '/blog/' },
        ],
        social: [
          {
            label: 'GitHub',
            href: 'https://github.com/asachs01/beacon',
            icon: 'github-logo',
          },
        ],
      },
      footer: {
        copy: 'Beacon — Free and open source, forever.',
        links: [
          { label: 'GitHub', href: 'https://github.com/asachs01/beacon' },
        ],
      },
      // Beacon brand gradient: Gold -> Coral -> Blue -> Teal
      gradient: {
        stops: ['#f59e0b', '#f97316', '#3b82f6', '#06b6d4'],
        darkStops: ['#fbbf24', '#fb923c', '#60a5fa', '#22d3ee'],
      },
      // Map the Beacon brand palette onto astro-tinker's color system
      colors: {
        // Light mode: warm white backgrounds, deep navy text
        light: {
          gray0: '#0f172a',       // Deep Navy — primary text
          gray50: '#1e293b',
          gray100: '#334155',
          gray200: '#475569',
          gray300: '#64748b',
          gray400: '#94a3b8',
          gray500: '#94a3b8',
          gray600: '#cbd5e1',
          gray700: '#e2e8f0',
          gray800: '#f1f5f9',
          gray900: '#f8fafc',     // Warm White — background
          gray999: '#ffffff',
          accentLight: '#94a3b8',
          accentRegular: '#3b82f6', // Soft Blue for links
          accentDark: '#1e293b',
        },
        // Dark mode (default): deep navy backgrounds, warm white text
        dark: {
          gray0: '#f8fafc',       // Warm White — primary text
          gray50: '#f1f5f9',
          gray100: '#e2e8f0',
          gray200: '#cbd5e1',
          gray300: '#94a3b8',
          gray400: '#64748b',
          gray500: '#475569',
          gray600: '#334155',
          gray700: '#1e293b',
          gray800: '#0f172a',     // Deep Navy — card backgrounds
          gray900: '#0c1322',     // Deeper Navy — page background
          gray999: '#080e1b',
          accentLight: '#1e293b',
          accentRegular: '#60a5fa', // Soft Blue (lighter for dark bg)
          accentDark: '#f8fafc',
        },
      },
      fonts: {
        brand: 'Plus Jakarta Sans',
        body: 'Inter',
        mono: 'JetBrains Mono',
        googleFontsUrl:
          'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Plus+Jakarta+Sans:wght@500;600;700&display=swap',
      },
      collections: {
        posts: 'posts',
        archives: 'archives',
        projects: 'projects',
      },
      routes: {
        archives: false,
        rss: true,
        projects: false,
        llmsTxt: true,
      },
      postPrefix: '/docs',
      seo: {
        jsonLd: true,
        personSchema: {},
      },
      llm: {
        enabled: true,
        allowCrawlers: ['GPTBot', 'ClaudeBot', 'PerplexityBot'],
      },
    }),
  ],
});
