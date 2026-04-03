---
name: family-schedule
description: Show today's schedule for each family member
arguments:
  - name: days
    description: Number of days to show (default 1 = today only)
    required: false
---

# Family Schedule

Show a per-person breakdown of calendar events.

## Steps

1. Call `beacon_list_family_members` to get all members
2. Call `beacon_get_calendar` with the requested number of days
3. Group events by calendar, matching calendar entity IDs to family members
4. Present each member's schedule in a clear format

## Example Output

```
📅 Family Schedule — Wednesday, April 2

👨 Aaron:
  9:00 AM - Team standup
  2:00 PM - Dentist appointment

👩 Ashley:
  10:00 AM - PTA meeting
  4:00 PM - Soccer practice (Lennon)

🧒 Lennon:
  (nothing today)

🧒 Elliott:
  (nothing today)
```
