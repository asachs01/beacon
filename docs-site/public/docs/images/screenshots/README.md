# Docs screenshots

Stable captures of the Beacon demo build for the docs site. Regenerate them with:

```bash
npm run docs:screenshots
```

The script builds the app with `vite build --mode demo`, freezes the clock to **Wednesday 17 June 2026, 10:30 America/New_York**, and seeds a fictional Rivera household (no real personal data). Landscape frames are a wall tablet at **1280×800**. Portrait frames are **768×1024**, the width where Beacon stacks the dashboard and chores into one column and the week calendar shows three days.

A GitHub Actions workflow (`.github/workflows/docs-screenshots.yml`) reruns this on each published release and opens a pull request with the new files.

## Filenames

| File | Screen |
| --- | --- |
| `dashboard.png` | Family dashboard for the frozen day, including the Menu widget |
| `calendar-week.png` | Week calendar |
| `calendar-month.png` | Month calendar (June 2026) |
| `chores.png` | Chores |
| `meals.png` | Menu widget on the classic dashboard (there is no separate meals screen) |
| `grocery.png` | Grocery list |
| `settings-calendar.png` | Settings → Calendar, including Default Calendar View |
| `settings-display.png` | Settings → Display |
| `settings-fonts.png` | Settings → Appearance, fonts section |
| `kid-display.png` | Kid Display for Sam |
| `themes-light.png` | Skylight (light) on the dashboard |
| `themes-dark.png` | Midnight (dark) on the dashboard |
| `dashboard-portrait.png` | Dashboard at the 768px breakpoint (stacked columns) |
| `calendar-week-portrait.png` | Week calendar at the 768px breakpoint (three days) |
| `calendar-month-portrait.png` | Month calendar at the 768px breakpoint |
| `kid-display-portrait.png` | Kid Display, portrait |

## Not captured

| File | Why |
| --- | --- |
| `calendar-day.png` | Beacon has no single-day calendar grid. The day agenda is the dashboard (`dashboard.png`). The script writes this file if a Day control appears later. |
| `chores-portrait.png` | The docs page uses the landscape frame (`chores.png`). |

Photos are seeded as a placeholder image for the photo frame. There is no `photos.png` in this set.
