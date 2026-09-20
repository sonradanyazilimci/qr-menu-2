// Herkese açık menü sayfası paketi (yalnızca Firestore okuma; Auth/QR kodu içermez)
import { readAll } from './firebase.js';

export async function loadMenu() {
  const d = await readAll();
  const categories = d.categories.filter((c) => c.active);
  const active = new Set(categories.map((c) => c.id));
  return {
    settings: d.settings,
    categories,
    tags: d.tags,
    allergens: d.allergens,
    products: d.products.filter((p) => active.has(p.categoryId)),
  };
}
