// AB gıda etiketleme yönetmeliğindeki 14 zorunlu alerjen (Türk Gıda Kodeksi ile uyumlu)
export const ALLERGENS = [
  { id: 'gluten',      label: 'Gluten',             hint: 'Buğday, çavdar, arpa, yulaf',  emoji: '🌾' },
  { id: 'milk',        label: 'Süt',                hint: 'Süt ve süt ürünleri (laktoz)', emoji: '🥛' },
  { id: 'eggs',        label: 'Yumurta',            hint: 'Yumurta ve ürünleri',          emoji: '🥚' },
  { id: 'soy',         label: 'Soya',               hint: 'Soya ve ürünleri',             emoji: '🫘' },
  { id: 'sesame',      label: 'Susam',              hint: 'Susam tohumu ve ürünleri',     emoji: '⚪' },
  { id: 'mustard',     label: 'Hardal',             hint: 'Hardal ve ürünleri',           emoji: '🟡' },
  { id: 'celery',      label: 'Kereviz',            hint: 'Kereviz ve ürünleri',          emoji: '🥬' },
  { id: 'peanuts',     label: 'Yer fıstığı',        hint: 'Yer fıstığı ve ürünleri',      emoji: '🥜' },
  { id: 'nuts',        label: 'Sert kabuklu yemiş', hint: 'Fındık, badem, ceviz, antep fıstığı…', emoji: '🌰' },
  { id: 'fish',        label: 'Balık',              hint: 'Balık ve ürünleri',            emoji: '🐟' },
  { id: 'crustaceans', label: 'Kabuklu deniz ürünü', hint: 'Karides, yengeç, ıstakoz',    emoji: '🦐' },
  { id: 'molluscs',    label: 'Yumuşakça',          hint: 'Midye, kalamar, ahtapot',      emoji: '🐚' },
  { id: 'sulphites',   label: 'Sülfit',             hint: '10 mg/kg üzeri kükürt dioksit', emoji: '🍷' },
  { id: 'lupin',       label: 'Acı bakla',          hint: 'Lupin ve ürünleri',            emoji: '🌼' },
];

export const GLUTEN_STATUSES = ['unset', 'contains', 'free', 'option'];

export const DEFAULT_TAGS = [
  { id: 'chef',  label: 'Şefin Seçimi',   emoji: '👨‍🍳', color: '#7a3e9d' },
  { id: 'month', label: 'Ayın Ürünü',     emoji: '🏆', color: '#c98a00' },
  { id: 'week',  label: 'Haftanın Ürünü', emoji: '⭐', color: '#0f7b8a' },
  { id: 'new',   label: 'Yeni',           emoji: '🆕', color: '#2e8b3d' },
  { id: 'spicy', label: 'Acı',            emoji: '🌶️', color: '#c62828' },
];

export const DEFAULT_SETTINGS = {
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
  initialPasswordChanged: false,
};
