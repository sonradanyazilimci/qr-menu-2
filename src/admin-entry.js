// Admin paneli paketi: Auth + Firestore yazma + QR kod
import {
  initializeAuth, indexedDBLocalPersistence, browserLocalPersistence,
  signInWithEmailAndPassword, signOut, onAuthStateChanged,
  EmailAuthProvider, reauthenticateWithCredential, updatePassword,
} from 'firebase/auth';
import { collection, doc, setDoc, getDocs, writeBatch, arrayRemove } from 'firebase/firestore';
import QRCode from 'qrcode';

import { app, db, readAll } from './firebase.js';
import { ADMIN_EMAIL } from './config.js';
import { buildSeed } from './seed.js';
import { cleanProduct, cleanCategory, cleanTag, cleanSettings, ValidationError } from './validate.js';

// popupRedirectResolver verilmediği için Google'ın harici betikleri yüklenmez
const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });

export { ADMIN_EMAIL, ValidationError };

/* --------------------------------- Oturum --------------------------------- */

export const isAdmin = (user) => !!user && String(user.email || '').toLowerCase() === ADMIN_EMAIL;
export const watchAuth = (cb) => onAuthStateChanged(auth, cb);

function authMessage(e) {
  switch (e?.code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email': return 'E-posta veya şifre hatalı';
    case 'auth/too-many-requests': return 'Çok fazla deneme. Birkaç dakika sonra tekrar deneyin.';
    case 'auth/network-request-failed': return 'Bağlantı hatası. İnternetinizi kontrol edin.';
    case 'auth/weak-password': return 'Yeni şifre en az 8 karakter olmalı';
    case 'auth/requires-recent-login': return 'Güvenlik için çıkış yapıp tekrar giriş yapın';
    default: return e?.message || 'İşlem başarısız';
  }
}

export async function login(email, password) {
  try {
    const { user } = await signInWithEmailAndPassword(auth, String(email).trim(), password);
    if (!isAdmin(user)) {
      await signOut(auth);
      throw new ValidationError('Bu hesap yönetici değil');
    }
  } catch (e) {
    throw e instanceof ValidationError ? e : new Error(authMessage(e));
  }
}

export const logout = () => signOut(auth);

/* ---------------------------------- Veri ---------------------------------- */

let state = null; // { settings, categories, tags, allergens, products } — admin.js ile aynı nesneyi paylaşır
const newId = () => doc(collection(db, 'products')).id;
const strip = ({ id, ...rest }) => rest;
const byOrder = (a, b) => a.order - b.order;
const ref = (col, id) => doc(db, col, id);

async function commit(ops) {
  for (let i = 0; i < ops.length; i += 400) {
    const batch = writeBatch(db);
    ops.slice(i, i + 400).forEach((op) => op(batch));
    await batch.commit();
  }
}

export async function loadAll() {
  state = await readAll();
  return state;
}

/* Ürünler */
export async function createProduct(input) {
  const order = state.products.reduce((m, p) => Math.max(m, p.order), -1) + 1;
  const p = cleanProduct({ ...input, id: newId(), order }, state);
  await setDoc(ref('products', p.id), strip(p));
  state.products.push(p);
  return p;
}

export async function updateProduct(id, patch) {
  const i = state.products.findIndex((p) => p.id === id);
  if (i < 0) throw new ValidationError('Ürün bulunamadı');
  const prev = state.products[i];
  const next = cleanProduct({ ...prev, ...patch, id, order: prev.order }, state);
  await setDoc(ref('products', id), strip(next));
  state.products[i] = next;
  return next;
}

export async function deleteProduct(id) {
  await commit([(b) => b.delete(ref('products', id))]);
  state.products = state.products.filter((p) => p.id !== id);
}

async function swapOrder(col, list, id, dir) {
  const sorted = [...list].sort(byOrder);
  const item = sorted.find((x) => x.id === id);
  const other = sorted[sorted.indexOf(item) + (dir < 0 ? -1 : 1)];
  if (!item || !other) return;
  [item.order, other.order] = [other.order, item.order];
  await commit([(b) => b.update(ref(col, item.id), { order: item.order }), (b) => b.update(ref(col, other.id), { order: other.order })]);
}

export const moveProduct = (id, dir) => {
  const p = state.products.find((x) => x.id === id);
  return swapOrder('products', state.products.filter((x) => x.categoryId === p.categoryId), id, dir);
};

/* Kategoriler */
export async function createCategory(input) {
  const order = state.categories.reduce((m, c) => Math.max(m, c.order), -1) + 1;
  const cat = { id: newId(), order, ...cleanCategory(input) };
  await setDoc(ref('categories', cat.id), strip(cat));
  state.categories.push(cat);
  return cat;
}

export async function updateCategory(id, patch) {
  const cat = state.categories.find((c) => c.id === id);
  if (!cat) throw new ValidationError('Kategori bulunamadı');
  Object.assign(cat, cleanCategory({ ...cat, ...patch }));
  await setDoc(ref('categories', id), strip(cat));
  return cat;
}

export const moveCategory = (id, dir) => swapOrder('categories', state.categories, id, dir);

export async function deleteCategory(id) {
  if (state.products.some((p) => p.categoryId === id)) {
    throw new ValidationError('Bu kategoride ürün var. Önce ürünleri silin veya başka kategoriye taşıyın.');
  }
  await commit([(b) => b.delete(ref('categories', id))]);
  state.categories = state.categories.filter((c) => c.id !== id);
}

/* Etiketler */
export async function createTag(input) {
  const tag = { id: newId(), ...cleanTag(input) };
  await setDoc(ref('tags', tag.id), strip(tag));
  state.tags.push(tag);
  return tag;
}

export async function updateTag(id, patch) {
  const tag = state.tags.find((t) => t.id === id);
  if (!tag) throw new ValidationError('Etiket bulunamadı');
  Object.assign(tag, cleanTag({ ...tag, ...patch }));
  await setDoc(ref('tags', id), strip(tag));
  return tag;
}

export async function deleteTag(id) {
  const affected = state.products.filter((p) => p.tags.includes(id));
  await commit([
    (b) => b.delete(ref('tags', id)),
    ...affected.map((p) => (b) => b.update(ref('products', p.id), { tags: arrayRemove(id) })),
  ]);
  state.tags = state.tags.filter((t) => t.id !== id);
  affected.forEach((p) => { p.tags = p.tags.filter((t) => t !== id); });
}

/* Ayarlar & şifre */
export async function saveSettings(input) {
  const next = cleanSettings(input, state.settings);
  await setDoc(ref('settings', 'main'), next);
  state.settings = next;
  return next;
}

export async function changePassword(current, next) {
  if (typeof next !== 'string' || next.length < 8) throw new ValidationError('Yeni şifre en az 8 karakter olmalı');
  const user = auth.currentUser;
  try {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, current));
  } catch (e) {
    throw new ValidationError(e?.code === 'auth/too-many-requests' ? authMessage(e) : 'Mevcut şifre hatalı');
  }
  try {
    await updatePassword(user, next);
  } catch (e) {
    throw new ValidationError(authMessage(e));
  }
  await saveSettings({ ...state.settings, initialPasswordChanged: true });
}

/* Yedek / geri yükleme / başlangıç verisi */
export function exportBackup() {
  const { settings, categories, tags, products } = state;
  return { settings, categories, tags, products };
}

async function replaceAll(draft) {
  const existing = await Promise.all(['categories', 'tags', 'products'].map(async (c) => [c, await getDocs(collection(db, c))]));
  const ops = [];
  existing.forEach(([c, snap]) => snap.docs.forEach((d) => ops.push((b) => b.delete(ref(c, d.id)))));
  draft.categories.forEach((x) => ops.push((b) => b.set(ref('categories', x.id), strip(x))));
  draft.tags.forEach((x) => ops.push((b) => b.set(ref('tags', x.id), strip(x))));
  draft.products.forEach((x) => ops.push((b) => b.set(ref('products', x.id), strip(x))));
  ops.push((b) => b.set(ref('settings', 'main'), draft.settings));
  await commit(ops);
}

export async function importBackup(json) {
  const { settings, categories, tags, products } = json || {};
  if (![categories, tags, products].every(Array.isArray)) throw new ValidationError('Geçersiz yedek dosyası');

  // Önce bellekte doğrula; hata olursa Firestore'daki veriye dokunulmaz
  const draft = { settings: state.settings, categories: [], tags: [], products: [] };
  draft.categories = categories.map((c, i) => ({ id: String(c.id || newId()), order: i, ...cleanCategory(c) }));
  draft.tags = tags.map((t) => ({ id: String(t.id || newId()), ...cleanTag(t) }));
  draft.products = products.map((p, i) => cleanProduct({ ...p, id: String(p.id || newId()), order: i }, draft));
  if (settings) draft.settings = cleanSettings(settings, state.settings);

  await replaceAll(draft);
  return draft.products.length;
}

// Menü boşsa ercanbrgr.com/menu içeriğini (kalori/alerjen boş) yükler
export async function seedDefaults() {
  if (state.categories.length || state.products.length) throw new ValidationError('Menü boş değil; başlangıç verisi yüklenmedi');
  const seed = buildSeed(newId);
  await replaceAll({ ...seed, settings: cleanSettings(seed.settings, seed.settings) });
  return loadAll();
}

/* QR kod */
export function qrSvg(text) {
  if (!/^https?:\/\/\S{3,500}$/i.test(text)) throw new ValidationError('Geçerli bir http(s) adresi girin');
  return QRCode.toString(text, { type: 'svg', margin: 2, errorCorrectionLevel: 'M' });
}
