---
name: create-chore
description: Create a new family chore in Beacon with assignments and payout
arguments:
  - name: name
    description: Chore name (e.g., "Make bed", "Feed the dog")
    required: true
  - name: assigned_to
    description: Comma-separated family member names
    required: false
  - name: frequency
    description: How often — daily, weekly, or once (default daily)
    required: false
  - name: value
    description: Payout in dollars (e.g., "0.50" for 50 cents)
    required: false
  - name: icon
    description: Emoji icon (default 🧹)
    required: false
---

# Create Chore

Create a family chore and assign it to one or more family members.

## Steps

1. Call `beacon_list_family_members` to get available member names
2. Parse the `assigned_to` argument into an array of names
3. Convert `value` from dollars to cents (multiply by 100)
4. Call `beacon_create_chore` with the parameters
5. Report the created chore back to the user

## Examples

```
/create-chore "Walk the dog" --assigned_to "Lennon, Elliott" --frequency daily --value 1.00 --icon 🐕
/create-chore "Take out trash" --assigned_to "Aaron" --frequency weekly --value 0 --icon 🗑️
/create-chore "Clean room" --frequency weekly --value 2.00
```
