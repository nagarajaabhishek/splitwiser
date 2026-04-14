import { normalizeLabel } from "@/lib/engine/agent";
import type { NormalizedBillDraft, NormalizedBillItem } from "@/lib/schemas/bill";

/** High-level expense bucket for the whole receipt (bill). */
export const EXPENSE_CATEGORIES = [
  "Groceries",
  "Dining & Drinks",
  "Coffee & Snacks",
  "Transport & Gas",
  "Shopping & Retail",
  "Household & Supplies",
  "Health & Pharmacy",
  "Entertainment",
  "Subscriptions & Bills",
  "Travel & Lodging",
  "Personal Care",
  "Other",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/** Per-line product type for analytics within a split. */
export const PRODUCT_CATEGORIES = [
  "Produce",
  "Dairy & Eggs",
  "Meat & Seafood",
  "Bakery",
  "Pantry & Dry Goods",
  "Frozen",
  "Beverages",
  "Snacks & Candy",
  "Alcohol",
  "Prepared Foods",
  "Deli",
  "Household & Cleaning",
  "Health & Beauty",
  "Pharmacy",
  "Pets",
  "Baby",
  "Fuel & Auto",
  "Electronics",
  "Clothing",
  "General Merchandise",
  "Fees & Tax",
  "Other",
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

type KeywordRule = { match: RegExp; category: ProductCategory };

const PRODUCT_RULES: KeywordRule[] = [
  { match: /\b(tax|sales tax|vat|gst|fee|service fee)\b/i, category: "Fees & Tax" },
  { match: /\b(milk|cheese|yogurt|butter|cream|egg|dairy)\b/i, category: "Dairy & Eggs" },
  { match: /\b(chicken|beef|pork|turkey|salmon|fish|shrimp|meat|seafood|steak|ground)\b/i, category: "Meat & Seafood" },
  { match: /\b(apple|apples|banana|bananas|orange|oranges|lettuce|tomato|tomatoes|onion|onions|potato|potatoes|produce|vegetable|fruit|berries)\b/i, category: "Produce" },
  { match: /\b(bread|bagel|muffin|croissant|bakery|tortilla)\b/i, category: "Bakery" },
  { match: /\b(rice|pasta|cereal|flour|sugar|oil|spice|sauce|can soup|beans)\b/i, category: "Pantry & Dry Goods" },
  { match: /\b(frozen|ice cream)\b/i, category: "Frozen" },
  { match: /\b(beer|wine|liquor|vodka|whiskey|rum|gin)\b/i, category: "Alcohol" },
  { match: /\b(water|soda|juice|coffee|tea|energy drink)\b/i, category: "Beverages" },
  { match: /\b(chip|candy|chocolate|snack|cracker|nuts)\b/i, category: "Snacks & Candy" },
  { match: /\b(sandwich|salad|hot bar|prepared|deli|rotisserie)\b/i, category: "Prepared Foods" },
  { match: /\b(deli|sliced)\b/i, category: "Deli" },
  { match: /\b(paper towel|toilet|detergent|soap dish|cleaning|trash bag|laundry)\b/i, category: "Household & Cleaning" },
  { match: /\b(shampoo|vitamin|toothpaste|razor|lotion)\b/i, category: "Health & Beauty" },
  { match: /\b(prescription|pharmacy|otc|medication)\b/i, category: "Pharmacy" },
  { match: /\b(pet|dog food|cat food)\b/i, category: "Pets" },
  { match: /\b(baby|diaper|formula)\b/i, category: "Baby" },
  { match: /\b(gas|diesel|fuel|unleaded|gasoline)\b/i, category: "Fuel & Auto" },
  { match: /\b(phone|cable|usb|battery|headphone|charger)\b/i, category: "Electronics" },
  { match: /\b(shirt|pants|socks|shoe|apparel|clothing)\b/i, category: "Clothing" },
];

const DEPARTMENT_RULES: Array<{ match: RegExp; category: ProductCategory }> = [
  { match: /\b(produce|fruit|vegetable)\b/i, category: "Produce" },
  { match: /\b(dairy|milk|egg)\b/i, category: "Dairy & Eggs" },
  { match: /\b(meat|seafood|deli)\b/i, category: "Meat & Seafood" },
  { match: /\b(bakery|bread)\b/i, category: "Bakery" },
  { match: /\b(frozen)\b/i, category: "Frozen" },
  { match: /\b(grocery|grocery)\b/i, category: "Pantry & Dry Goods" },
  { match: /\b(beverage|drink|liquor|beer|wine)\b/i, category: "Beverages" },
  { match: /\b(pharmacy|rx|health)\b/i, category: "Pharmacy" },
  { match: /\b(pet)\b/i, category: "Pets" },
  { match: /\b(baby|infant)\b/i, category: "Baby" },
  { match: /\b(gm|general|apparel|electronics)\b/i, category: "General Merchandise" },
];

const MERCHANT_EXPENSE_RULES: Array<{ match: RegExp; category: ExpenseCategory }> = [
  { match: /\b(starbucks|dunkin|coffee|peet)\b/i, category: "Coffee & Snacks" },
  { match: /\b(mcdonald|burger|taco|subway|chipotle|kfc|panda|wendy|pizza|restaurant|grill|kitchen|cafe|diner|bistro|taqueria|sushi|bar)\b/i, category: "Dining & Drinks" },
  { match: /\b(kroger|safeway|walmart|target grocery|whole foods|publix|aldi|trader|costco|sam s club|grocery|market|supermarket)\b/i, category: "Groceries" },
  { match: /\b(shell|exxon|chevron|bp gas|mobil| Speedway|gas station|fuel)\b/i, category: "Transport & Gas" },
  { match: /\b(uber|lyft|taxi|transit|metro)\b/i, category: "Transport & Gas" },
  { match: /\b(amazon|target|best buy|walmart\.com|ebay)\b/i, category: "Shopping & Retail" },
  { match: /\b(cvs|walgreens|rite aid|pharmacy)\b/i, category: "Health & Pharmacy" },
  { match: /\b(marriott|hilton|airbnb|hotel|motel|inn|airline|delta|united)\b/i, category: "Travel & Lodging" },
  { match: /\b(netflix|spotify|hulu|subscription|utility|electric|water bill)\b/i, category: "Subscriptions & Bills" },
  { match: /\b(cinema|theater|movie|amc|regal|concert|entertainment)\b/i, category: "Entertainment" },
  { match: /\b(salon|spa|barber|hair)\b/i, category: "Personal Care" },
];

function clampExpense(value: string): ExpenseCategory {
  return (EXPENSE_CATEGORIES as readonly string[]).includes(value) ? (value as ExpenseCategory) : "Other";
}

function clampProduct(value: string): ProductCategory {
  return (PRODUCT_CATEGORIES as readonly string[]).includes(value) ? (value as ProductCategory) : "Other";
}

export function inferProductCategory(item: NormalizedBillItem): {
  category: ProductCategory;
  confidence: number;
  source: "department" | "heuristic" | "catalog";
} {
  const text = `${item.normalizedLabel} ${item.label} ${item.originalLabel ?? ""} ${item.department ?? ""}`.toLowerCase();

  if (item.department) {
    const dept = item.department.trim();
    for (const rule of DEPARTMENT_RULES) {
      if (rule.match.test(dept)) {
        return { category: rule.category, confidence: 0.82, source: "department" };
      }
    }
  }

  if (item.enrichment?.source === "catalog" && item.enrichment.catalogProductName) {
    const synthetic = { ...item, normalizedLabel: normalizeLabel(item.enrichment.catalogProductName) };
    return inferProductCategoryFromKeywords(synthetic, 0.78);
  }

  return inferProductCategoryFromKeywords(item, 0.72);
}

function inferProductCategoryFromKeywords(
  item: NormalizedBillItem,
  baseConfidence: number,
): { category: ProductCategory; confidence: number; source: "heuristic" | "catalog" } {
  const text = `${item.normalizedLabel} ${item.label} ${item.originalLabel ?? ""}`.toLowerCase();

  for (const rule of PRODUCT_RULES) {
    if (rule.match.test(text)) {
      return { category: rule.category, confidence: Math.min(0.95, baseConfidence + 0.08), source: "heuristic" };
    }
  }

  return { category: "Other", confidence: 0.45, source: "heuristic" };
}

export function inferExpenseCategory(
  draft: NormalizedBillDraft,
  productCategories: ProductCategory[],
): { category: ExpenseCategory; source: "merchant" | "aggregate" | "heuristic" } {
  const merchant = draft.merchantName.toLowerCase();
  for (const rule of MERCHANT_EXPENSE_RULES) {
    if (rule.match.test(merchant)) {
      return { category: rule.category, source: "merchant" };
    }
  }

  const groceryHeavy = ["Produce", "Dairy & Eggs", "Meat & Seafood", "Pantry & Dry Goods", "Frozen", "Bakery", "Beverages", "Snacks & Candy"];
  const diningHeavy = ["Prepared Foods", "Deli", "Alcohol"];
  const counts = new Map<string, number>();
  for (const p of productCategories) {
    counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  let groceryScore = 0;
  let diningScore = 0;
  for (const g of groceryHeavy) groceryScore += counts.get(g) ?? 0;
  for (const d of diningHeavy) diningScore += counts.get(d) ?? 0;

  if (groceryScore >= 2 && groceryScore >= diningScore * 2) return { category: "Groceries", source: "aggregate" };
  if (diningScore >= 2 && diningScore > groceryScore) return { category: "Dining & Drinks", source: "aggregate" };

  const fuel = counts.get("Fuel & Auto") ?? 0;
  if (fuel >= 1 && productCategories.length <= 4) return { category: "Transport & Gas", source: "aggregate" };

  if (productCategories.length > 0) {
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const [topCat, topCount] = ranked[0] ?? ["Other", 0];
    if (topCount >= Math.ceil(productCategories.length * 0.4)) {
      if (groceryHeavy.includes(topCat)) return { category: "Groceries", source: "aggregate" };
      if (diningHeavy.includes(topCat)) return { category: "Dining & Drinks", source: "aggregate" };
    }
  }

  return { category: "Other", source: "heuristic" };
}

/**
 * Fills `expenseCategory` on the draft and per-line product category in enrichment + `productCategory` on each item.
 */
export function applyCategorizationToDraft(draft: NormalizedBillDraft): NormalizedBillDraft {
  const items: NormalizedBillItem[] = draft.items.map((item) => {
    const inferred = inferProductCategory(item);
    const category = clampProduct(inferred.category);
    const enrichment = {
      ...item.enrichment,
      source: item.enrichment?.source ?? "none",
      productCategory: category,
      productCategoryConfidence: inferred.confidence,
      productCategorySource: inferred.source,
    };
    return {
      ...item,
      productCategory: category,
      enrichment,
    };
  });

  const productCats = items.map((i) => i.productCategory ?? "Other").map(clampProduct);
  const expenseResult = inferExpenseCategory({ ...draft, items }, productCats);
  const expense = clampExpense(expenseResult.category);
  const confidence =
    expenseResult.source === "merchant" ? 0.88 : expenseResult.source === "aggregate" ? 0.76 : 0.55;

  return {
    ...draft,
    expenseCategory: expense,
    expenseCategoryConfidence: confidence,
    expenseCategorySource: expenseResult.source,
    items,
  };
}
