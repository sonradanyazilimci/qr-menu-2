const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const QRCode = require('qrcode');

const store = require('./lib/store');
const { ALLERGENS } = require('./lib/constants');
const { hashPassword, uid } = require('./lib/seed');
const { cleanProduct, cleanCategory, cleanTag, cleanSettings, HttpError } = require('./lib/validate');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const UPLOADS = path.join(PUBLIC, 'uploads');
const SESSION_MS = 1000 * 60 * 60 * 12;

fs.mkdirSync(UPLOADS, { recursive: true });
const db = store.get();

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '6mb' }));

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy':
      "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'",
  });
  next();
});

/* ------------------------------ Yardımcılar ------------------------------ */

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const sortByOrder = (a, b) => a.order - b.order;
const currentDb = () => store.get();

function publicSettings(s) {
  const { name, tagline, logo, brandColor, currency, showPrices, phone, address, instagram, website, calorieNote, allergenNote } = s;
  return { name, tagline, logo, brandColor, currency, showPrices, phone, address, instagram, website, calorieNote, allergenNote };
}

function removeUpload(url, exceptProductId) {
  if (!url || !url.startsWith('/uploads/')) return;
  const d = currentDb();
  const stillUsed =
    d.settings.logo === url || d.products.some((p) => p.image === url && p.id !== exceptProductId);
  if (stillUsed) return;
  fs.rm(path.join(UPLOADS, path.basename(url)), { force: true }, () => {});
}

/* --------------------------------- Auth ---------------------------------- */

const sign = (payload) => crypto.createHmac('sha256', currentDb().auth.secret).update(payload).digest('base64url');

function makeToken() {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + SESSION_MS })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function validToken(token) {
  if (!token || !token.includes('.')) return false;
  const [payload, sig] = token.split('.');
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString()).exp > Date.now();
  } catch {
    return false;
  }
}

function getCookie(req, name) {
  const m = (req.headers.cookie || '').split(';').map((c) => c.trim()).find((c) => c.startsWith(name + '='));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : '';
}

const requireAuth = (req, res, next) => {
  if (!validToken(getCookie(req, 'qrm_sid'))) return res.status(401).json({ error: 'Oturum gerekli' });
  next();
};

const attempts = new Map(); // ip -> { count, until }
function passwordOk(password) {
  const { salt, hash } = currentDb().auth;
  const a = Buffer.from(hashPassword(String(password || ''), salt), 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ------------------------------ Herkese açık ------------------------------ */

app.get('/api/menu', (req, res) => {
  const d = currentDb();
  const categories = d.categories.filter((c) => c.active).sort(sortByOrder);
  const active = new Set(categories.map((c) => c.id));
  res.set('Cache-Control', 'no-cache');
  res.json({
    settings: publicSettings(d.settings),
    categories,
    tags: d.tags,
    allergens: ALLERGENS,
    products: d.products.filter((p) => active.has(p.categoryId)).sort(sortByOrder),
  });
});

/* --------------------------------- Admin --------------------------------- */

app.post('/api/admin/login', (req, res) => {
  const ip = req.ip;
  const rec = attempts.get(ip) || { count: 0, until: 0 };
  if (rec.until > Date.now()) return res.status(429).json({ error: 'Çok fazla deneme. Birkaç dakika sonra tekrar deneyin.' });

  if (!passwordOk(req.body?.password)) {
    rec.count += 1;
    if (rec.count >= 5) Object.assign(rec, { count: 0, until: Date.now() + 5 * 60 * 1000 });
    attempts.set(ip, rec);
    return res.status(401).json({ error: 'Şifre hatalı' });
  }
  attempts.delete(ip);
  res.cookie('qrm_sid', makeToken(), { httpOnly: true, sameSite: 'strict', maxAge: SESSION_MS, path: '/' });
  res.json({ ok: true, isDefaultPassword: currentDb().auth.isDefault });
});

app.post('/api/admin/logout', (req, res) => {
  res.clearCookie('qrm_sid', { path: '/' });
  res.json({ ok: true });
});

app.get('/api/admin/session', (req, res) => {
  const ok = validToken(getCookie(req, 'qrm_sid'));
  res.json({ authenticated: ok, isDefaultPassword: ok ? currentDb().auth.isDefault : false });
});

app.use('/api/admin', requireAuth);

app.get('/api/admin/data', (req, res) => {
  const d = currentDb();
  res.json({
    settings: d.settings,
    categories: [...d.categories].sort(sortByOrder),
    tags: d.tags,
    allergens: ALLERGENS,
    products: [...d.products].sort(sortByOrder),
  });
});

/* Ürünler */
app.post('/api/admin/products', wrap((req, res) => {
  const d = currentDb();
  const order = d.products.reduce((m, p) => Math.max(m, p.order), -1) + 1;
  const product = cleanProduct({ ...req.body, id: uid(), order }, d);
  d.products.push(product);
  store.save();
  res.status(201).json(product);
}));

app.put('/api/admin/products/:id', wrap((req, res) => {
  const d = currentDb();
  const i = d.products.findIndex((p) => p.id === req.params.id);
  if (i < 0) throw new HttpError(404, 'Ürün bulunamadı');
  const prev = d.products[i];
  const next = cleanProduct({ ...prev, ...req.body, id: prev.id, order: prev.order }, d);
  d.products[i] = next;
  store.save();
  if (prev.image !== next.image) removeUpload(prev.image, prev.id);
  res.json(next);
}));

app.delete('/api/admin/products/:id', wrap((req, res) => {
  const d = currentDb();
  const i = d.products.findIndex((p) => p.id === req.params.id);
  if (i < 0) throw new HttpError(404, 'Ürün bulunamadı');
  const [removed] = d.products.splice(i, 1);
  store.save();
  removeUpload(removed.image, removed.id);
  res.json({ ok: true });
}));

app.post('/api/admin/products/:id/move', wrap((req, res) => {
  const d = currentDb();
  const p = d.products.find((x) => x.id === req.params.id);
  if (!p) throw new HttpError(404, 'Ürün bulunamadı');
  const siblings = d.products.filter((x) => x.categoryId === p.categoryId).sort(sortByOrder);
  const idx = siblings.indexOf(p);
  const other = siblings[idx + (req.body?.dir < 0 ? -1 : 1)];
  if (other) [p.order, other.order] = [other.order, p.order];
  store.save();
  res.json({ ok: true });
}));

/* Kategoriler */
app.post('/api/admin/categories', wrap((req, res) => {
  const d = currentDb();
  const order = d.categories.reduce((m, c) => Math.max(m, c.order), -1) + 1;
  const cat = { id: uid(), order, ...cleanCategory(req.body) };
  d.categories.push(cat);
  store.save();
  res.status(201).json(cat);
}));

app.put('/api/admin/categories/:id', wrap((req, res) => {
  const d = currentDb();
  const cat = d.categories.find((c) => c.id === req.params.id);
  if (!cat) throw new HttpError(404, 'Kategori bulunamadı');
  Object.assign(cat, cleanCategory({ ...cat, ...req.body }));
  store.save();
  res.json(cat);
}));

app.post('/api/admin/categories/:id/move', wrap((req, res) => {
  const d = currentDb();
  const sorted = [...d.categories].sort(sortByOrder);
  const cat = sorted.find((c) => c.id === req.params.id);
  if (!cat) throw new HttpError(404, 'Kategori bulunamadı');
  const other = sorted[sorted.indexOf(cat) + (req.body?.dir < 0 ? -1 : 1)];
  if (other) [cat.order, other.order] = [other.order, cat.order];
  store.save();
  res.json({ ok: true });
}));

app.delete('/api/admin/categories/:id', wrap((req, res) => {
  const d = currentDb();
  if (d.products.some((p) => p.categoryId === req.params.id)) {
    throw new HttpError(409, 'Bu kategoride ürün var. Önce ürünleri silin veya başka kategoriye taşıyın.');
  }
  d.categories = d.categories.filter((c) => c.id !== req.params.id);
  store.save();
  res.json({ ok: true });
}));

/* Etiketler */
app.post('/api/admin/tags', wrap((req, res) => {
  const d = currentDb();
  const tag = { id: uid(), ...cleanTag(req.body) };
  d.tags.push(tag);
  store.save();
  res.status(201).json(tag);
}));

app.put('/api/admin/tags/:id', wrap((req, res) => {
  const d = currentDb();
  const tag = d.tags.find((t) => t.id === req.params.id);
  if (!tag) throw new HttpError(404, 'Etiket bulunamadı');
  Object.assign(tag, cleanTag({ ...tag, ...req.body }));
  store.save();
  res.json(tag);
}));

app.delete('/api/admin/tags/:id', wrap((req, res) => {
  const d = currentDb();
  d.tags = d.tags.filter((t) => t.id !== req.params.id);
  d.products.forEach((p) => { p.tags = p.tags.filter((t) => t !== req.params.id); });
  store.save();
  res.json({ ok: true });
}));

/* Ayarlar & şifre */
app.put('/api/admin/settings', wrap((req, res) => {
  const d = currentDb();
  const prevLogo = d.settings.logo;
  d.settings = cleanSettings(req.body, d.settings);
  store.save();
  if (prevLogo !== d.settings.logo) removeUpload(prevLogo);
  res.json(d.settings);
}));

app.post('/api/admin/password', wrap((req, res) => {
  const d = currentDb();
  const { current, next } = req.body || {};
  if (!passwordOk(current)) throw new HttpError(400, 'Mevcut şifre hatalı');
  if (typeof next !== 'string' || next.length < 8) throw new HttpError(400, 'Yeni şifre en az 8 karakter olmalı');
  const salt = crypto.randomBytes(16).toString('hex');
  d.auth = { salt, hash: hashPassword(next, salt), secret: crypto.randomBytes(32).toString('hex'), isDefault: false };
  store.save();
  // Secret değiştiği için eski oturumlar geçersiz; mevcut kullanıcıya yeni oturum ver
  res.cookie('qrm_sid', makeToken(), { httpOnly: true, sameSite: 'strict', maxAge: SESSION_MS, path: '/' });
  res.json({ ok: true });
}));

/* Görsel yükleme (istemci küçültüp base64 gönderir) */
const MAGIC = [
  { ext: 'png', test: (b) => b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) },
  { ext: 'jpg', test: (b) => b.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) },
  { ext: 'webp', test: (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' },
];

app.post('/api/admin/upload', wrap((req, res) => {
  const m = /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(req.body?.dataUrl || '');
  if (!m) throw new HttpError(400, 'Geçersiz görsel (PNG, JPEG veya WebP olmalı)');
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length > 4 * 1024 * 1024) throw new HttpError(413, 'Görsel 4 MB’tan küçük olmalı');
  const kind = MAGIC.find((k) => k.test(buf));
  if (!kind) throw new HttpError(400, 'Görsel içeriği tanınmadı');
  const file = `${uid()}.${kind.ext}`;
  fs.writeFileSync(path.join(UPLOADS, file), buf);
  res.status(201).json({ url: `/uploads/${file}` });
}));

/* Yedek al / geri yükle */
app.get('/api/admin/export', (req, res) => {
  const { settings, categories, tags, products } = currentDb();
  res.set('Content-Disposition', `attachment; filename="menu-yedek-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json({ settings, categories, tags, products });
});

app.post('/api/admin/import', wrap((req, res) => {
  const { settings, categories, tags, products } = req.body || {};
  if (![categories, tags, products].every(Array.isArray)) throw new HttpError(400, 'Geçersiz yedek dosyası');
  const d = currentDb();

  // Önce geçici bir kopyada doğrula; hata olursa mevcut veri bozulmaz
  const draft = { ...d, categories: [], tags: [], products: [] };
  draft.categories = categories.map((c, i) => ({ id: String(c.id || uid()), order: i, ...cleanCategory(c) }));
  draft.tags = tags.map((t) => ({ id: String(t.id || uid()), ...cleanTag(t) }));
  draft.products = products.map((p, i) => cleanProduct({ ...p, id: String(p.id || uid()), order: i }, draft));
  if (settings) draft.settings = cleanSettings(settings, d.settings);

  store.replace(draft);
  res.json({ ok: true, products: draft.products.length });
}));

/* QR kod */
app.get('/api/admin/qr', wrap(async (req, res) => {
  const text = String(req.query.text || '');
  if (!/^https?:\/\/\S{3,500}$/i.test(text)) throw new HttpError(400, 'Geçerli bir http(s) adresi girin');
  const svg = await QRCode.toString(text, { type: 'svg', margin: 2, errorCorrectionLevel: 'M' });
  res.type('image/svg+xml').send(svg);
}));

/* ------------------------------ Statik dosyalar --------------------------- */

// /admin -> /admin/ yönlendirmesini express.static kendisi yapar (elle yazılırsa döngü olur)
app.get('/menu', (req, res) => res.redirect('/'));
app.use(express.static(PUBLIC, { extensions: ['html'] }));

app.use('/api', (req, res) => res.status(404).json({ error: 'Bulunamadı' }));

app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'İstek çok büyük' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Geçersiz JSON' });
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Sunucu hatası' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n  QR Menü:      http://localhost:${PORT}/`);
    console.log(`  Admin paneli: http://localhost:${PORT}/admin/`);
    if (db.auth.isDefault) console.log('  Varsayılan şifre: admin123  (girişten sonra değiştirin!)\n');
  });
}

module.exports = app;
