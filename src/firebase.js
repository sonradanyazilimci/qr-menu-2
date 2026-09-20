import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { firebaseConfig } from './config.js';
import { ALLERGENS, DEFAULT_SETTINGS } from './constants.js';

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

const arr = (v) => (Array.isArray(v) ? v : []);

// Eski/eksik alanlı belgelerde de arayüz çökmesin
export function normalizeProduct(id, d) {
  return {
    id,
    categoryId: d.categoryId || '',
    name: d.name || '',
    description: d.description || '',
    price: d.price ?? null,
    image: d.image || '',
    calories: d.calories ?? null,
    portion: d.portion || '',
    protein: d.protein ?? null,
    carbs: d.carbs ?? null,
    fat: d.fat ?? null,
    allergens: arr(d.allergens),
    allergenVerified: d.allergenVerified === true,
    glutenStatus: d.glutenStatus || 'unset',
    glutenNote: d.glutenNote || '',
    glutenPrice: d.glutenPrice ?? null,
    tags: arr(d.tags),
    variants: arr(d.variants).map((v) => ({ label: v.label || '', price: v.price ?? null, calories: v.calories ?? null })),
    notes: d.notes || '',
    available: d.available !== false,
    order: Number.isFinite(d.order) ? d.order : 0,
  };
}

const byOrder = (a, b) => a.order - b.order;

// Menü ve admin aynı okuma yolunu kullanır
export async function readAll() {
  const [s, c, t, p] = await Promise.all([
    getDoc(doc(db, 'settings', 'main')),
    getDocs(collection(db, 'categories')),
    getDocs(collection(db, 'tags')),
    getDocs(collection(db, 'products')),
  ]);
  return {
    settings: { ...DEFAULT_SETTINGS, ...(s.exists() ? s.data() : {}) },
    categories: c.docs.map((x) => ({ id: x.id, name: x.data().name || '', order: x.data().order ?? 0, active: x.data().active !== false })).sort(byOrder),
    tags: t.docs.map((x) => ({ id: x.id, label: x.data().label || '', emoji: x.data().emoji || '', color: x.data().color || '#555555' })),
    allergens: ALLERGENS,
    products: p.docs.map((x) => normalizeProduct(x.id, x.data())).sort(byOrder),
  };
}
