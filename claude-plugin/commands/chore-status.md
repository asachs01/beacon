---
name: chore-status
description: Show today's chore completion status for the family
arguments: []
---

# Chore Status

Show which chores are done and which are still pending for today.

## Steps

1. Call `beacon_list_chores` to get all chores with today's completion status
2. Group by completed vs pending
3. Show who completed what and what's still outstanding

## Example Output

```
✅ Completed:
  Make bed — Lennon, Elliott
  Feed the dog — Lennon

⬜ Pending:
  Walk the dog — assigned to Lennon, Elliott
  Clean room — assigned to Lennon (weekly, due today)

💰 Today's earnings: Lennon $2.50, Elliott $0.50
```
