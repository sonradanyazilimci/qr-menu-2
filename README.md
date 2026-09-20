# QR Menü + Yönetim Paneli (Firebase)

ercanbrgr.com/menu yapısı ve markasıyla QR menü. Kalori, alerjen, etiket ve glutensiz bilgileri admin panelinden girilir.

- **Menü:** https://qr-code-2-dff9f.web.app/
- **Admin:** https://qr-code-2-dff9f.web.app/admin/ — yönetici hesabı `erhan@local.com`
- **Firebase projesi:** `qr-code-2` (`qr-code-2-dff9f`, hesap: erhankenar4@gmail.com)

## Mimari

| Parça | Nerede |
|---|---|
| Statik site (menü + admin) | Firebase Hosting (`public/`) |
| Veri (ürün, kategori, etiket, ayar) | Firestore: `products`, `categories`, `tags`, `settings/main` |
| Yönetici girişi | Firebase Auth (e-posta/şifre) |
| Yetki | `firestore.rules` — herkes okur, yalnızca `erhan@local.com` yazar |
| Görseller | Küçültülüp ürün belgesinin içinde saklanır (Storage/faturalandırma gerekmez) |

Kaynak kod `src/` altındadır; `npm run build` bunu `public/qrm-menu.js` ve `public/admin/qrm-admin.js` paketlerine çevirir. Bu iki dosya üretilmiş çıktıdır, git'e eklenmez; depoyu klonladıktan sonra `npm install && npm run build` gerekir.

## Geliştirme ve yayınlama

```
npm install
npm run build          # src/ -> public/*.js
npm run deploy         # build + hosting + firestore rules
```

`firebase login` ile **erhankenar4@gmail.com** hesabına giriş yapılmış olmalıdır.

## Yönetici hesabını değiştirmek

`erhan@local.com` iki yerde geçer, ikisi de aynı olmalıdır: `firestore.rules` (`isAdmin()`) ve `src/config.js` (`ADMIN_EMAIL`). Değiştirince `npm run deploy` çalıştırın. Şifreyi panelden **Ayarlar → Yönetici şifresi** ile değiştirebilirsiniz. `local.com` gerçek bir alan adı olmadığından "şifremi unuttum" e-postası çalışmaz; şifre kaybolursa Firebase Console → Authentication üzerinden sıfırlanır.

## Alerjen / glutensiz kuralları

- “Bilinen alerjen içermez” yalnızca yönetici **“Alerjen bilgisini kontrol ettim”** kutusunu işaretlediyse gösterilir; aksi halde “alerjen bilgisi eklenmemiş” uyarısı çıkar.
- Müşteri alerjen filtresi kullandığında, doğrulanmamış ürünler gizlenmez, uyarıyla gösterilir.
- Glutensiz durumu: Belirtilmedi / Glutensiz / Glutensiz seçenek var (+ek ücret) / Gluten içerir. Durum ile “Gluten” alerjeni otomatik tutarlı tutulur.
- Kalori, alerjen ve glutensiz alanları başlangıçta bilerek boştur; işletme girmelidir.

## Maliyet notu

Firestore ücretsiz kotası günde 50.000 okumadır. Menü sayfası her açılışta ~57 belge okur (≈ günde 850 menü açılışı). Yoğun kullanımda Blaze planına geçmek gerekebilir (100.000 okuma ≈ 0,06 $).

## Yedekleme

Admin → QR & Yedek → “Yedeği indir” (görseller dahil). “Yedekten geri yükle” ile başka bir projeye/veritabanına taşınabilir.

## Eski sürüm

`legacy-express/` klasöründe Express + JSON dosyası ile çalışan ilk sürüm durur; Firebase sürümü için gerekli değildir.
