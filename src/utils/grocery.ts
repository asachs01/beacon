/** Keywords that identify a to-do list as grocery/shopping (vs tasks) by its name. */
const GROCERY_KEYWORDS = [
  'grocer', 'shopping', 'costco', 'walmart', 'target', 'store',
  'pantry', 'fridge', 'freezer', 'inventory', 'meal',
];

/** Fallback classification used when no grocery lists are configured in Settings. */
export function isGroceryListName(name: string): boolean {
  // Match a keyword only at a word start, so "reStore" / "appStore" / "pieceMeal"
  // aren't read as "store" / "meal". Anchoring at \b (not full-word) still lets
  // plurals and suffixes match: "groceries", "meals", "shopping".
  return GROCERY_KEYWORDS.some((kw) => new RegExp(`\\b${kw}`, 'i').test(name));
}
