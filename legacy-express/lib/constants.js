// AB gıda etiketleme yönetmeliğindeki 14 zorunlu alerjen (Türk Gıda Kodeksi ile uyumlu)
const ALLERGENS = [
  { id: 'gluten',     label: 'Gluten',            hint: 'Buğday, çavdar, arpa, yulaf',  emoji: '🌾' },
  { id: 'milk',       label: 'Süt',               hint: 'Süt ve süt ürünleri (laktoz)', emoji: '🥛' },
  { id: 'eggs',       label: 'Yumurta',           hint: 'Yumurta ve ürünleri',          emoji: '🥚' },
  { id: 'soy',        label: 'Soya',              hint: 'Soya ve ürünleri',             emoji: '🫘' },
  { id: 'sesame',     label: 'Susam',             hint: 'Susam tohumu ve ürünleri',     emoji: '⚪' },
  { id: 'mustard',    label: 'Hardal',            hint: 'Hardal ve ürünleri',           emoji: '🟡' },
  { id: 'celery',     label: 'Kereviz',           hint: 'Kereviz ve ürünleri',          emoji: '🥬' },
  { id: 'peanuts',    label: 'Yer fıstığı',       hint: 'Yer fıstığı ve ürünleri',      emoji: '🥜' },
  { id: 'nuts',       label: 'Sert kabuklu yemiş', hint: 'Fındık, badem, ceviz, antep fıstığı…', emoji: '🌰' },
  { id: 'fish',       label: 'Balık',             hint: 'Balık ve ürünleri',            emoji: '🐟' },
  { id: 'crustaceans', label: 'Kabuklu deniz ürünü', hint: 'Karides, yengeç, ıstakoz', emoji: '🦐' },
  { id: 'molluscs',   label: 'Yumuşakça',         hint: 'Midye, kalamar, ahtapot',      emoji: '🐚' },
  { id: 'sulphites',  label: 'Sülfit',            hint: '10 mg/kg üzeri kükürt dioksit', emoji: '🍷' },
  { id: 'lupin',      label: 'Acı bakla',         hint: 'Lupin ve ürünleri',            emoji: '🌼' },
];

const GLUTEN_STATUSES = ['unset', 'contains', 'free', 'option'];

const DEFAULT_TAGS = [
  { id: 'chef',  label: 'Şefin Seçimi',  emoji: '👨‍🍳', color: '#7a3e9d' },
  { id: 'month', label: 'Ayın Ürünü',    emoji: '🏆', color: '#c98a00' },
  { id: 'week',  label: 'Haftanın Ürünü', emoji: '⭐', color: '#0f7b8a' },
  { id: 'new',   label: 'Yeni',          emoji: '🆕', color: '#2e8b3d' },
  { id: 'spicy', label: 'Acı',           emoji: '🌶️', color: '#c62828' },
];

module.exports = { ALLERGENS, GLUTEN_STATUSES, DEFAULT_TAGS };
