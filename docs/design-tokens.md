# Beacon Design Tokens

Governance doc for the color/type token system. Add new UI colors here first —
don't reach for an arbitrary Tailwind hex in a component.

## Color roles (10)

| Token | Hex | Role |
|---|---|---|
| `--color-ink` | `#0f172a` | Dark neutral — text/bg base |
| `--color-paper` | `#f8fafc` | Light neutral — bg/surface base |
| `--color-brand` | `#f7a832` | Beacon Gold — brand identity |
| `--color-accent` | `#3b82f6` | Primary functional accent — links, focus, primary actions, info |
| `--color-cat-sage` | `#10b981` | Category color 1 (calendar/family member) |
| `--color-cat-lavender` | `#8b5cf6` | Category color 2 |
| `--color-cat-coral` | `#f97316` | Category color 3 |
| `--color-cat-teal` | `#14b8a6` | Category color 4 |
| `--color-success` | `#22c55e` | Semantic success state |
| `--color-warning` | `#d97706` | Semantic warning state — deliberately distinct from `--color-brand` |
| `--color-error` | `#ef4444` | Semantic error state |

Cut from the original 14: `Ocean #3b82f6` (literal duplicate of Soft Blue/accent),
`Rose #ec4899` (least distinguishable from Coral, least-used category slot),
`Info #06b6d4` (folded into `--color-accent` — info and primary accent serve the
same "neutral informative" register on a dashboard this size).

`Warning` was `#f59e0b`, which at the time was a literal duplicate of Brand Gold.
It changed to `#d97706` so a warning banner is never visually identical to the
brand mark. Brand Gold is now `#f7a832` (`--color-brand`); Warning does not share that value.

## Theme-scoped brand text

Gold fills stay `--color-brand` / the theme `accent` (`#f7a832` on Beacon Dark and Beacon Light). Text and icons that would otherwise be that gold use `--color-brand-text`, set by the theme the same way `--color-on-accent` is:

| Token | Beacon Light | Beacon Dark | Role |
|---|---|---|---|
| `--color-brand-text` | `#9a5b00` | `#f7a832` (same as `--color-brand`) | Gold used as text or an icon |

`#f7a832` on the Beacon Light page (`#f8fafc`) is about 1.89:1 and on the surface (`#f1f5f9`) about 1.81:1, under the 3:1 UI bar. `#9a5b00` is about 5.19:1 on the page and 4.95:1 on the surface. On Beacon Dark, `#f7a832` already clears 3:1 (about 9.01:1 on `#0f172a`, 7.39:1 on `#1e293b`), so dark mode keeps brand gold for text. Other themes leave `--color-brand-text` unset and fall back to their own `--accent`.

## Typography

| Token | Value | Role |
|---|---|---|
| `--font-display` | `'Fraunces', serif` | Clock, section titles, event-card titles — the "family kitchen noticeboard" personality face |
| `--font-body` | `'Inter', sans-serif` | Body copy — proven at-a-distance legibility for a wall display |
| `--font-mono` | `'JetBrains Mono', monospace` | Numeric timers/countdowns only |

Themes may override `--accent` and font tokens for deliberate reasons (e.g.
Dracula/Monokai keeping a mono-forward personality), but every theme must set
an explicit `--accent` — no theme should silently fall back to blue by omission.
Beacon Dark and Beacon Light also set `--color-brand-text` (see above) so gold
text and icons are not the raw fill color on Beacon Light.
