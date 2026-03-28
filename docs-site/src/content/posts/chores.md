---
title: "Chores"
date: 2026-03-26
description: "Complete guide to Beacon's chore system — creating chores, assigning members, values, frequency, streaks, and the leaderboard."
categories: ["docs"]
tags: ["chores", "tasks", "family", "leaderboard", "streaks"]
slug: "chores"
draft: false
---

# Chores

Beacon's chore system lets you create tasks, assign them to family members, set dollar values, and track completion with streaks and a leaderboard. It is designed to motivate kids (and adults) to pitch in around the house.

---

## Opening the Chores panel

1. Click the **checklist icon** in the sidebar (the third icon from the top)
2. A slide-out panel opens from the right side of the screen
3. Click the **X** button or click the backdrop to close the panel

On mobile, tap **Chores** in the bottom tab bar.

---

## Creating a chore

1. Open the Chores panel
2. Click **+ Add Chore** at the bottom of the panel
3. The "New Chore" form appears with these fields:

### Icon
Choose from 12 emoji icons:
- Broom, Plate, Dog, Bed, Book, Trash, Shirt, Laundry basket, Toothbrush, Shower, Soap, Flexed bicep

### Name
Enter the chore name (required). Examples: "Vacuum living room", "Feed the dog", "Make bed".

### Value
Set a dollar value for the chore. The default is $1.00. Use the step control (increments of $0.25) to adjust. Set to $0.00 if you do not want a monetary value.

### Frequency
| Option | Description |
|--------|-------------|
| **Daily** | Must be completed every day |
| **Weekly** | Must be completed once per week |
| **One-time** | Only needs to be done once, then disappears |

### Assign To
Select one or more family members. Tap a member's name to toggle them on/off. Selected members show a colored border. At least one member must be assigned (the Add Chore button is disabled otherwise).

4. Click **Add Chore** to save

---

## Chore display

Chores are grouped by family member in the Chores panel. Each member group shows:

1. **Member header**: Avatar, name, and streak badge
2. **Progress bar**: Shows completed/total chores for today, colored with the member's color
3. **Chore cards**: One card per assigned chore

Each chore card displays:
- The member's avatar (left side)
- The chore icon and name
- The dollar value (if > $0)
- A checkbox (right side) — checked if completed today

---

## Completing chores

1. Tap the **checkbox** on a chore card
2. The checkbox animates with a bounce effect
3. The chore card dims to indicate completion
4. The progress bar updates

### Undoing a completion

Tap the checkbox again to undo. The completion is removed and the chore returns to its incomplete state.

### Swipe gesture

On touch devices, you can swipe left on a chore card to see a "Skipped" indicator. This is visual feedback only — it does not change the chore's completion status and resets after 2 seconds.

---

## Streak tracking

Streaks reward consistency. Here is how they work:

### How streaks are calculated

1. When a family member completes any chore, the system checks their last completion date
2. If the last completion was **yesterday**, the streak increments by 1
3. If the last completion was **today** (already counted), the streak stays the same
4. If the last completion was **more than 1 day ago**, the streak resets to 1
5. The **longest streak** is updated whenever the current streak exceeds it

### Streak badge

The streak badge appears next to each member's name in the Chores panel and Leaderboard. It shows:

- A fire emoji and the current streak count (e.g., "7")
- **Hot streak**: When the current streak reaches 7+ days, the badge gets a "hot" visual style
- **Tap to toggle**: Tapping the badge toggles between showing the current streak and the longest streak ("Best: 14")

### Streak reset

Streaks reset to 1 when a member misses a day. There is no grace period — if no chore is completed on a given day, the streak resets the next time a chore is completed.

---

## Leaderboard

The leaderboard ranks family members by earnings over a time period.

### Opening the leaderboard

1. Click the **trophy icon** in the sidebar
2. A slide-out panel opens from the right

### Period toggle

Toggle between:
- **This Week**: Sunday through Saturday of the current week
- **This Month**: First day through last day of the current month

### Ranking

Members are ranked by total earnings (dollar value of completed chores) in descending order:

- Position 1: Gold medal emoji
- Position 2: Silver medal emoji
- Position 3: Bronze medal emoji
- Position 4+: Numeric rank (#4, #5, etc.)

Each row shows:
- Rank medal/number
- Member avatar
- Member name
- Number of chores completed in the period
- Streak badge
- Total earnings (e.g., "$12.50")

Members with zero earnings still appear on the leaderboard (at the bottom).

---

## Tips for motivating kids

1. **Start small**: Begin with 2-3 daily chores per child. Add more as they build the habit.
2. **Set meaningful values**: Tie chore values to things kids want. If a toy costs $20, they can see the progress toward earning it.
3. **Celebrate streaks**: Call out streak milestones at dinner. "Alex hit a 7-day streak!"
4. **Weekly payout**: Use the leaderboard's weekly view to do a Sunday "payday" where kids receive their earnings.
5. **Mix frequencies**: Use daily chores for routine tasks (make bed, feed pet) and weekly chores for bigger tasks (vacuum, clean bathroom).
6. **Keep it visible**: Mount the display where kids pass it regularly — near the kitchen or in a hallway.
7. **Let them choose**: Give kids a say in which chores they take on. Ownership increases follow-through.
8. **Bonus chores**: Add occasional one-time chores with higher values for extra motivation.

---

## Data storage

Chore data is stored in the browser's localStorage:

| Key | Contents |
|-----|----------|
| `beacon_chores` | List of chore definitions |
| `beacon_completions` | Log of all chore completions with timestamps |
| `beacon_streaks` | Streak records per member |

This data persists across page reloads but is tied to the specific browser/device.

---

## Troubleshooting

### Chores panel shows "Add family members first"

You need to add at least one family member before you can create or view chores. See [Family Members](/docs/family/).

### Streak reset unexpectedly

Streaks are based on consecutive calendar days. If a member completes chores on Monday and then not again until Wednesday, the streak resets to 1 on Wednesday. The check is based on the date portion of the completion timestamp.

### Leaderboard shows $0.00 for everyone

Verify that:
1. Chores have a value greater than $0.00
2. Chores have been completed within the selected period (This Week or This Month)
3. The completions are recorded for the correct member IDs
