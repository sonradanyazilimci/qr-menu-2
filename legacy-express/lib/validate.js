const { ALLERGENS, GLUTEN_STATUSES } = require('./constants');

const ALLERGEN_IDS = new Set(ALLERGENS.map((a) => a.id));

const str = (v, max) => String(v ?? '').trim().slice(0, max);
const bool = (v, fallback = false) => (typeof v === 'boolean' ? v : fallback);

// Boş / geçersiz -> null, aksi halde [0, max] aralığında sayı
function num(v, { max = 100000, decimals = 1 } = {}) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || n > max) return null;
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

function image(v) {
  const s = str(v, 500);
  if (!s) return '';
  if (/^\/uploads\/[\w.-]+$/.test(s)) return s;
  if (/^https:\/\/[^\s"'<>]+$/i.test(s)) return s;
  return '';
}

function cleanProduct(input, db) {
  const name = str(input.name, 120);
  if (!name) throw new HttpError(400, 'Ürün adı zorunlu');
  if (!db.categories.some((c) => c.id === input.categoryId)) throw new HttpError(400, 'Geçerli bir kategori seçin');

  const tagIds = new Set(db.tags.map((t) => t.id));
  const glutenStatus = GLUTEN_STATUSES.includes(input.glutenStatus) ? input.glutenStatus : 'unset';

  let allergens = [...new Set((Array.isArray(input.allergens) ? input.allergens : []).filter((a) => ALLERGEN_IDS.has(a)))];
  // Glutensiz durumu ile gluten alerjeni tutarlı kalsın
  if (glutenStatus === 'free') allergens = allergens.filter((a) => a !== 'gluten');
  if (glutenStatus === 'contains' || glutenStatus === 'option') {
    if (!allergens.includes('gluten')) allergens.unshift('gluten');
  }

  const variants = (Array.isArray(input.variants) ? input.variants : [])
    .slice(0, 12)
    .map((v) => ({
      label: str(v?.label, 40),
      price: num(v?.price, { max: 100000, decimals: 2 }),
      calories: num(v?.calories, { max: 10000, decimals: 0 }),
    }))
    .filter((v) => v.label);

  return {
    id: input.id,
    categoryId: input.categoryId,
    name,
    description: str(input.description, 600),
    price: num(input.price, { max: 100000, decimals: 2 }),
    image: image(input.image),
    calories: num(input.calories, { max: 10000, decimals: 0 }),
    portion: str(input.portion, 40),
    protein: num(input.protein, { max: 1000 }),
    carbs: num(input.carbs, { max: 1000 }),
    fat: num(input.fat, { max: 1000 }),
    allergens,
    allergenVerified: bool(input.allergenVerified),
    glutenStatus,
    glutenNote: str(input.glutenNote, 300),
    glutenPrice: glutenStatus === 'option' ? num(input.glutenPrice, { max: 100000, decimals: 2 }) : null,
    tags: [...new Set((Array.isArray(input.tags) ? input.tags : []).filter((t) => tagIds.has(t)))],
    variants,
    notes: str(input.notes, 300),
    available: bool(input.available, true),
    order: Number.isFinite(input.order) ? input.order : 0,
  };
}

function cleanCategory(input) {
  const name = str(input.name, 80);
  if (!name) throw new HttpError(400, 'Kategori adı zorunlu');
  return { name, active: bool(input.active, true) };
}

function cleanTag(input) {
  const label = str(input.label, 30);
  if (!label) throw new HttpError(400, 'Etiket adı zorunlu');
  const color = /^#[0-9a-f]{6}$/i.test(input.color || '') ? input.color : '#555555';
  return { label, emoji: str(input.emoji, 8), color };
}

function cleanSettings(input, current) {
  const brandColor = /^#[0-9a-f]{6}$/i.test(input.brandColor || '') ? input.brandColor : current.brandColor;
  const site = str(input.website, 200);
  return {
    name: str(input.name, 60) || current.name,
    tagline: str(input.tagline, 40),
    logo: image(input.logo),
    brandColor,
    currency: str(input.currency, 4) || '₺',
    showPrices: bool(input.showPrices, true),
    phone: str(input.phone, 30),
    address: str(input.address, 200),
    instagram: str(input.instagram, 100),
    website: /^https?:\/\//i.test(site) ? site : '',
    calorieNote: str(input.calorieNote, 400),
    allergenNote: str(input.allergenNote, 800),
  };
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

module.exports = { cleanProduct, cleanCategory, cleanTag, cleanSettings, HttpError };
