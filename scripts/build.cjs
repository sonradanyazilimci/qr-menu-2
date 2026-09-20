// src/*-entry.js -> public/*.js (tarayıcı paketleri)
const esbuild = require('esbuild');
const path = require('path');

const watch = process.argv.includes('--watch');
const root = path.join(__dirname, '..');

const common = {
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2020'],
  legalComments: 'none',
  logLevel: 'info',
};

const builds = [
  { entryPoints: [path.join(root, 'src/menu-entry.js')], globalName: 'QRM', outfile: path.join(root, 'public/qrm-menu.js') },
  { entryPoints: [path.join(root, 'src/admin-entry.js')], globalName: 'QRA', outfile: path.join(root, 'public/admin/qrm-admin.js') },
];

(async () => {
  for (const b of builds) {
    const opts = { ...common, ...b };
    if (watch) await (await esbuild.context(opts)).watch();
    else await esbuild.build(opts);
  }
})().catch(() => process.exit(1));
