# Contributing to Beacon

First off, thank you for considering contributing to Beacon! This is a family-oriented project, and every contribution helps families stay organized without spending a fortune.

## How to Contribute

### Reporting Bugs

Found something broken? Please [open an issue](https://github.com/asachs01/beacon/issues/new?template=bug_report.md) using the bug report template. Include as much detail as you can -- your Home Assistant version, browser, and device type all help narrow things down.

### Suggesting Features

Have an idea that would make Beacon better for your family? [Open a feature request](https://github.com/asachs01/beacon/issues/new?template=feature_request.md). We'd love to hear how you use Beacon and what would make it more useful.

### Submitting Changes

1. **Fork** the repository
2. **Create a branch** from `main` for your change (`git checkout -b feature/my-feature`)
3. **Make your changes** (see the style guide below)
4. **Test** your changes locally
5. **Commit** with a clear message (see commit conventions below)
6. **Push** to your fork and open a **Pull Request**

## Development Setup

```bash
git clone https://github.com/YOUR_USERNAME/beacon.git
cd beacon
npm install
npm run dev
```

This starts a development server at [http://localhost:3000](http://localhost:3000). The app will hot-reload as you make changes.

### Building for Production

```bash
npm run build
```

The built files land in the `dist/` directory.

## Docs site URL

The public docs site is built from `docs-site/` and is served at `https://beaconfamily.app`. Its origin is `SITE_URL`, read by `docs-site/site.config.mjs`. When the variable is unset, the build uses `https://beaconfamily.app`. Astro's `site`, canonical links, Open Graph and Twitter URLs, JSON-LD, the sitemap, `robots.txt`, and `llms.txt` / `llms-full.txt` all use that value.

To switch domains:

1. Set `SITE_URL` to the new origin with no trailing slash, for example `https://beaconfamily.app`.
2. In Netlify, add `SITE_URL` under Site configuration → Environment variables. This repo builds the site in GitHub Actions and then uploads `docs-site/dist` (`.github/workflows/deploy-docs.yml`), so also set the same value as a GitHub repository variable named `SITE_URL` (Settings → Secrets and variables → Actions → Variables). The workflow passes that variable into the build. Leave it empty to keep the default.
3. When the new domain is permanent, change `DEFAULT_SITE_URL` in `docs-site/site.config.mjs`. That is the only line in the docs site that should contain the host.
4. Keep the wording in `docs-site/llms/*.txt` and write docs links with the `__SITE_URL__` token. The build substitutes `SITE_URL`. Do not paste the host into those files.

From `docs-site/`, run `npm run build` and then `npm run check:urls` with the same `SITE_URL` the build used. The check fails if canonical links, `og:url`, `og:image`, sitemap entries, `robots.txt`, JSON-LD site URLs, or the llms files disagree with it.

## Code Style

### TypeScript

- **Strict mode** is enabled -- no `any` types unless truly unavoidable
- Use **functional components** with hooks (no class components)
- Prefer **named exports** over default exports
- Keep components focused -- if it's getting long, break it up

### CSS

- Use **CSS custom properties** (variables) for colors and theming
- Follow the existing theme structure in `src/styles/themes/`
- Support both light and dark modes

### File Organization

```
src/
  api/           # External API integrations (HA, Grocy, AnyList)
  components/    # React components
  hooks/         # Custom React hooks
  styles/        # CSS and theme definitions
  types/         # TypeScript type definitions
```

### General Guidelines

- Keep it simple. Readable code is better than clever code.
- Add types. If you're writing a new component or hook, define its props/return types.
- Don't over-engineer. This is a family calendar, not a spacecraft.

## Commit Conventions

Write clear, descriptive commit messages:

```
feat: add meal plan editing from calendar view
fix: correct timezone offset in weekly calendar
docs: update README with new configuration options
chore: upgrade Vite to v6.1
```

Prefixes:
- `feat:` -- A new feature
- `fix:` -- A bug fix
- `docs:` -- Documentation changes
- `chore:` -- Maintenance (dependencies, build config, etc.)
- `refactor:` -- Code changes that don't add features or fix bugs
- `style:` -- Formatting, missing semicolons, etc.
- `test:` -- Adding or updating tests

## Issue and PR Templates

Please use the provided templates when opening issues or pull requests. They help keep things organized and make it easier for maintainers to understand and review your contribution.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold a welcoming, respectful environment for everyone.

## Questions?

Not sure about something? Feel free to [open a discussion](https://github.com/asachs01/beacon/discussions) or comment on an existing issue. There are no dumb questions here.

Thanks again for helping make Beacon better for families everywhere!
