// Firebase web yapılandırması. Bu değerler istemci tarafında herkese açıktır (gizli değildir);
// veriyi koruyan şey firestore.rules dosyasıdır.
export const firebaseConfig = {
  projectId: 'qr-code-2-dff9f',
  appId: '1:328294663552:web:509490d47310b114ab6d65',
  storageBucket: 'qr-code-2-dff9f.firebasestorage.app',
  apiKey: 'AIzaSyCLudfYqbUUgjpD-LCy5VNAj2HvpJ5JX1c',
  authDomain: 'qr-code-2-dff9f.firebaseapp.com',
  messagingSenderId: '328294663552',
};

// Yönetici hesabı. firestore.rules içindeki e-posta ile aynı olmalıdır.
export const ADMIN_EMAIL = 'erhan@local.com';
