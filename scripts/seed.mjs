// Boş Firestore'a ercanbrgr.com/menu başlangıç verisini yazar.
// Yönetici olarak giriş yapar, yani yazma işlemleri firestore.rules'tan geçer.
//   ADMIN_PASSWORD=... node scripts/seed.mjs
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, doc, getDocs, writeBatch } from 'firebase/firestore';
import { firebaseConfig, ADMIN_EMAIL } from '../src/config.js';
import { buildSeed } from '../src/seed.js';

const password = process.env.ADMIN_PASSWORD;
if (!password) { console.error('ADMIN_PASSWORD ortam değişkeni gerekli'); process.exit(1); }

const app = initializeApp(firebaseConfig);
await signInWithEmailAndPassword(getAuth(app), ADMIN_EMAIL, password);
const db = getFirestore(app);

for (const c of ['categories', 'products', 'tags']) {
  if (!(await getDocs(collection(db, c))).empty) {
    console.error(`"${c}" boş değil; mevcut veri ezilmesin diye işlem iptal edildi.`);
    process.exit(2);
  }
}

const newId = () => doc(collection(db, 'products')).id;
const seed = buildSeed(newId);
const strip = ({ id, ...rest }) => rest;

const ops = [
  ...seed.categories.map((x) => (b) => b.set(doc(db, 'categories', x.id), strip(x))),
  ...seed.tags.map((x) => (b) => b.set(doc(db, 'tags', x.id), strip(x))),
  ...seed.products.map((x) => (b) => b.set(doc(db, 'products', x.id), strip(x))),
  (b) => b.set(doc(db, 'settings', 'main'), seed.settings),
];
for (let i = 0; i < ops.length; i += 400) {
  const batch = writeBatch(db);
  ops.slice(i, i + 400).forEach((op) => op(batch));
  await batch.commit();
}
console.log(`Yüklendi: ${seed.categories.length} kategori, ${seed.tags.length} etiket, ${seed.products.length} ürün`);
process.exit(0);
