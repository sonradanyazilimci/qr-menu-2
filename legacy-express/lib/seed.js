const crypto = require('crypto');
const { DEFAULT_TAGS } = require('./constants');

const uid = () => crypto.randomBytes(5).toString('hex');

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

// ercanbrgr.com/menu/ sayfasındaki kategori ve ürünler.
// Kalori / alerjen / glutensiz bilgileri BİLEREK boş bırakıldı: bu veriler
// gıda güvenliğini ilgilendirir, admin panelinden işletme tarafından girilmelidir.
const MENU = [
  ['Doyanlara Doymayanlara', [
    ['Classic BRGR', 'Özel BRGR Sosu, %100 Dana Eti, Karamelize Soğan, Yeşillik, Turşu'],
    ['Cheese BRGR', 'Özel BRGR Sosu, %100 Dana Eti, Cheddar Peyniri, Karamelize Soğan, Yeşillik, Turşu'],
    ['Alev Alev BRGR', 'Acı Sos, %100 Dana Eti, Yeşillik, Turşu, Jalapeno Biber, Cheddar Peyniri', { tags: ['spicy'] }],
    ['Double BRGR', 'Özel BRGR Sosu, %100 Dana Eti, Cheddar Peyniri, Turşu, Yeşillik, Karamelize Soğan'],
  ]],
  ['Vazgeçilmezler', [
    ['Smoky BRGR', '%100 Dana Eti, BBQ Sos, 3 Dana Füme, 2 Cheddar Peyniri, Turşu, Kıtır Soğan', { tags: ['chef'] }],
    ['Mushroom BRGR', '%100 Dana Eti, Yeşillik, Trüflü Mayonez, Karamelize Mantar, Cheddar Peyniri, Turşu', { tags: ['new'] }],
    ['Big Special BRGR', 'Özel BRGR Sosu, Atom Köfte, Cheddar Peyniri, Karamelize Soğan, Turşu', { tags: ['month'] }],
  ]],
  ['Tavuk Aşkı', [
    ['Chicken BRGR', 'Yeşillik, Ranch Sos, Tavuk Burger, Turşu'],
    ['Red Zone BRGR', 'Kırmızı Lahana Sosu, Tavuk Burger, Acılı Mayonez', { tags: ['week', 'spicy'] }],
    ['Chicken Tenders BRGR', 'Yeşillik, Ranch Sos, Tavuk Fileto'],
  ]],
  ['Menüler', [
    ['İkili Classic Menü', '2x85gr Burger, 2x Patates, 2x İçecek'],
    ['İkili Cheese Menü', '2x85gr Burger, 2x Patates, 2x İçecek'],
    ['İkili Chicken Menü', '2x120gr Burger, 2x Patates, 2x İçecek'],
    ['Gurme İkili Menü', '2x85gr Smoky Burger, 2x Patates, 2x İçecek'],
    ['Üçlü Classic Menü', '3x85gr Burger, 3x Patates, 3x İçecek'],
    ['Üçlü Cheese Menü', '3x85gr Burger, 3x Patates, 3x İçecek'],
    ['Üçlü Chicken Menü', '3x120gr Burger, 3x Patates, 3x İçecek'],
  ]],
  ['Çocuk Menüleri', [
    ['Jr. Et Burger Menü', '50gr Dana Eti, Patates, İçecek, Oyuncak Hediye'],
    ['Jr. Tavuk Burger Menü', '50gr Tavuk Eti, Patates, İçecek, Oyuncak Hediye'],
  ]],
  ['Çıtır Çıtır Lezzetler', [
    ['Nugget', 'Çıtır tavuk nugget', { variants: ["4'lü", "6'lı", "8'li"] }],
    ['Soğan Halkası', 'Çıtır soğan halkası', { variants: ["4'lü", "6'lı", "8'li", "12'li"] }],
    ['Cheese Stick', 'Çıtır peynir çubukları', { variants: ["3'lü", "4'lü", "6'lı"] }],
    ['Çıtır Tavuk', '160gr çıtır tavuk'],
    ['Patates Kızartması', 'Çıtır patates kızartması', { variants: ['Extra', 'Double'] }],
    ['Mix Atıştırmalık', 'Patates, 2 Soğan Halkası, 2 Çıtır Tavuk, 2 Cheese Stick'],
  ]],
  ['İçecekler', [
    ['Coca-Cola', '', { variants: ['Şişe 300ml', 'Kutu 330ml', '1 Lt'] }],
    ['Cappy', '330ml', { variants: ['Portakal', 'Kayısı', 'Şeftali', 'Vişne'] }],
    ['Fusetea', '330ml', { variants: ['Mango-Ananas', 'Limon'] }],
    ['Ayran', '', { variants: ['280ml', '1 Lt'] }],
    ['Limonata', '200ml'],
    ['Uludağ Efsane Gazoz', '330ml'],
    ['Uludağ Efsane Portakal', '330ml'],
    ['Soda', '200ml'],
    ['Meyveli Soda', '200ml'],
    ['Su', '500ml'],
  ]],
  ['Dondurmalar', [
    ["Carte d'Or Çikolata Rüyası", ''],
    ['Algida Maraş Usulü', ''],
    ["Carte d'Or Meyve Rüyası", ''],
    ['Magnum Mini Badem', ''],
    ['Magnum Mini Cookie', ''],
  ]],
  ['Tatlılar', [
    ['Mozaik Pasta', ''],
    ['Tiramisu', ''],
  ]],
];

function build() {
  const categories = [];
  const products = [];
  let order = 0;

  MENU.forEach(([catName, items], ci) => {
    const cat = { id: uid(), name: catName, order: ci, active: true };
    categories.push(cat);
    items.forEach(([name, description, extra = {}]) => {
      products.push({
        id: uid(),
        categoryId: cat.id,
        name,
        description,
        price: null,
        image: '',
        calories: null,
        portion: '',
        protein: null,
        carbs: null,
        fat: null,
        allergens: [],
        allergenVerified: false,
        glutenStatus: 'unset',
        glutenNote: '',
        glutenPrice: null,
        tags: extra.tags || [],
        variants: (extra.variants || []).map((label) => ({ label, price: null, calories: null })),
        notes: '',
        available: true,
        order: order++,
      });
    });
  });

  const initialPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const salt = crypto.randomBytes(16).toString('hex');

  return {
    settings: {
      name: 'ERCAN BRGR',
      tagline: 'MENÜ',
      logo: '',
      brandColor: '#e8401c',
      currency: '₺',
      showPrices: true,
      phone: '444 61 30',
      address: 'IOSB Ziya Gökalp Mah. Atatürk Bulvarı No:112 Başakşehir/İstanbul',
      instagram: '',
      website: 'https://www.ercanbrgr.com',
      calorieNote: 'Kalori değerleri yaklaşık olup porsiyona ve hazırlanışa göre değişebilir.',
      allergenNote:
        'Alerjen bilgileri reçete verilerine dayanır. Mutfağımızda gluten, süt, yumurta ve susam içeren ürünler birlikte işlenmektedir; çapraz bulaşma riski bulunabilir. Ciddi alerjiniz varsa lütfen siparişten önce personelimize danışın.',
    },
    auth: {
      salt,
      hash: hashPassword(initialPassword, salt),
      secret: crypto.randomBytes(32).toString('hex'),
      isDefault: !process.env.ADMIN_PASSWORD,
    },
    categories,
    tags: DEFAULT_TAGS.map((t) => ({ ...t })),
    products,
  };
}

module.exports = { build, hashPassword, uid };
