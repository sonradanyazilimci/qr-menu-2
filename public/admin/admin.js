(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s || '').toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');
  const val = (v) => (v == null ? '' : v);

  let D = null; // sunucudan gelen tüm veri
  let view = 'products';
  const F = { q: '', cat: '', flag: '' };
  let E = null; // düzenlenen ürün (çalışma kopyası)
  let toastTimer;

  const GLUTEN_LABELS = { unset: '— Belirtilmedi', free: 'Glutensiz', option: 'Glutensiz seçenek var', contains: 'Gluten içerir' };

  /* ------------------------------ Yardımcılar ------------------------------ */

  // Veri katmanı (Firebase): src/admin-entry.js -> qrm-admin.js -> window.QRA
  const A = window.QRA;

  // Firestore izin hatası = oturum düştü / yetkisiz
  function explain(e) {
    if (e?.code === 'permission-denied') return 'Yetkiniz yok veya oturum süresi doldu. Çıkış yapıp tekrar giriş yapın.';
    if (e?.code === 'unavailable') return 'Bağlantı hatası. İnternetinizi kontrol edin.';
    return e?.message || 'İşlem başarısız';
  }

  function toast(msg, isErr = false) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast' + (isErr ? ' err' : '');
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), isErr ? 5000 : 2200);
  }
  const fail = (e) => { console.error(e); toast(explain(e), true); };

  // Görsel küçültülüp Firestore belgesinin içinde data URL olarak saklanır (Storage gerekmez).
  // Belge sınırı 1 MB olduğu için boyut ~300 KB altına inene kadar küçültülür.
  async function fileToDataUrl(file, max) {
    const bmp = await createImageBitmap(file);
    for (let size = max; size >= 200; size = Math.round(size * 0.75)) {
      const scale = Math.min(1, size / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * scale);
      c.height = Math.round(bmp.height * scale);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      for (const q of [0.85, 0.7]) {
        const url = c.toDataURL('image/webp', q);
        if (url.startsWith('data:image/webp') && url.length <= 280000) return url;
      }
      const png = c.toDataURL('image/png');
      if (png.length <= 280000) return png;
    }
    throw new Error('Görsel çok büyük, daha küçük bir görsel deneyin');
  }

  async function uploadImage(file, max = 640) {
    if (!file) return null;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('Yalnızca PNG, JPEG veya WebP yükleyin');
    return fileToDataUrl(file, max);
  }

  const catName = (id) => D.categories.find((c) => c.id === id)?.name || '—';
  const tagOf = (id) => D.tags.find((t) => t.id === id);
  const algOf = (id) => D.allergens.find((a) => a.id === id);
  const hasKcal = (p) => p.calories != null || p.variants.some((v) => v.calories != null);
  const pillHtml = (t, extra = '') => `<span class="pill" style="background:${esc(t.color)}">${esc(t.emoji)} ${esc(t.label)}${extra}</span>`;

  /* -------------------------------- Oturum --------------------------------- */

  function showLogin() {
    $('#app').hidden = true;
    $('#login').hidden = false;
    $('#loginPw').value = '';
    $('#loginEmail').value ||= A.ADMIN_EMAIL;
    $('#loginPw').focus();
  }

  async function load() {
    D = await A.loadAll();
    $('#login').hidden = true;
    $('#app').hidden = false;
    $('#appName').textContent = `${D.settings.name} · Yönetim`;
    document.documentElement.style.setProperty('--brand', D.settings.brandColor);
    $('#pwWarn').hidden = !!D.settings.initialPasswordChanged;
    render();
  }

  // Giriş / çıkış Firebase Auth durumundan yönetilir (sayfa yenilense de oturum sürer)
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#loginErr');
    const btn = $('#loginBtn');
    err.hidden = true;
    btn.disabled = true;
    try {
      await A.login($('#loginEmail').value, $('#loginPw').value);
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });

  $('#logout').addEventListener('click', () => A.logout());
  $('#goPw').addEventListener('click', () => { view = 'settings'; render(); $('#pwCurrent')?.focus(); });

  $('#tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-view]');
    if (!b) return;
    view = b.dataset.view;
    render();
  });

  function render() {
    $$('#tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === view)));
    ({ products: renderProducts, categories: renderCategories, tags: renderTags, settings: renderSettings, tools: renderTools })[view]();
  }

  /* -------------------------------- Ürünler --------------------------------- */

  function filtered() {
    const q = norm(F.q.trim());
    return D.products.filter((p) => {
      if (F.cat && p.categoryId !== F.cat) return false;
      if (q && !norm(p.name + ' ' + p.description).includes(q)) return false;
      switch (F.flag) {
        case 'nokcal': return !hasKcal(p);
        case 'noalg': return !p.allergenVerified;
        case 'nogf': return p.glutenStatus === 'unset';
        case 'gf': return p.glutenStatus === 'free' || p.glutenStatus === 'option';
        case 'tagged': return p.tags.length > 0;
        case 'soldout': return !p.available;
        case 'noimg': return !p.image;
        default: return true;
      }
    });
  }

  function statsHtml() {
    const n = D.products.length || 1;
    const items = [
      ['Kalori girildi', D.products.filter(hasKcal).length],
      ['Alerjen doğrulandı', D.products.filter((p) => p.allergenVerified).length],
      ['Glutensiz durumu belirtildi', D.products.filter((p) => p.glutenStatus !== 'unset').length],
    ];
    return items.map(([l, c]) => `<div class="card stat"><b>${c}</b> <span>/ ${D.products.length} · ${l}</span><div class="meter"><i style="width:${Math.round((c / n) * 100)}%"></i></div></div>`).join('');
  }

  function rowHtml(p, canMove) {
    const algIcons = p.allergens.map((id) => algOf(id)).filter(Boolean).map((a) => `<span title="${esc(a.label)}">${a.emoji}</span>`).join(' ');
    const tags = p.tags.map(tagOf).filter(Boolean).map((t) => pillHtml(t)).join('');
    return `
      <div class="prow${p.available ? '' : ' off'}" data-id="${esc(p.id)}">
        <div class="pname">
          ${p.image ? `<img class="thumb" src="${esc(p.image)}" alt="" loading="lazy">` : '<span class="thumb">🍽</span>'}
          <div><b title="${esc(p.name)}">${esc(p.name)}</b><small>${esc(catName(p.categoryId))}${p.variants.length ? ` · ${p.variants.length} seçenek` : ''}</small></div>
        </div>
        <div><span class="lbl">Kalori</span><div class="kcal-in"><input class="inl-kcal" type="number" min="0" step="1" inputmode="numeric" value="${val(p.calories)}" placeholder="—" aria-label="${esc(p.name)} kalori"></div></div>
        <div><span class="lbl">Alerjen</span><div class="chipline">
          ${p.allergenVerified ? '<span class="tagx ok">✓ Doğrulandı</span>' : '<span class="tagx warn">Doğrulanmadı</span>'}
          ${algIcons ? `<span>${algIcons}</span>` : (p.allergenVerified ? '<span class="tagx">Alerjen yok</span>' : '')}
        </div></div>
        <div><span class="lbl">Glutensiz</span><select class="inl-gf" aria-label="${esc(p.name)} glutensiz durumu">
          ${Object.entries(GLUTEN_LABELS).map(([k, l]) => `<option value="${k}"${p.glutenStatus === k ? ' selected' : ''}>${l}</option>`).join('')}
        </select></div>
        <div><span class="lbl">Etiketler</span><div class="chipline">${tags || '<span class="empty">—</span>'}</div></div>
        <div class="act">
          <label class="switch" title="Satışta / tükendi"><input class="inl-av" type="checkbox" ${p.available ? 'checked' : ''} aria-label="${esc(p.name)} satışta"></label>
          ${canMove ? `<button class="btn icon" data-act="up" title="Yukarı taşı" aria-label="Yukarı taşı">↑</button><button class="btn icon" data-act="down" title="Aşağı taşı" aria-label="Aşağı taşı">↓</button>` : ''}
          <button class="btn sm" data-act="edit">Düzenle</button>
        </div>
      </div>`;
  }

  function listHtml() {
    const list = filtered();
    const canMove = !!F.cat && !F.q && !F.flag;
    if (!list.length) return '<div class="card empty" style="text-align:center;padding:30px">Bu filtreyle eşleşen ürün yok.</div>';
    return `
      <div class="prow head"><div>Ürün</div><div>Kalori</div><div>Alerjen</div><div>Glutensiz</div><div>Etiketler</div><div></div></div>
      ${list.map((p) => rowHtml(p, canMove)).join('')}`;
  }

  function renderProducts() {
    $('#view').innerHTML = `
      <h2 class="vt">Ürünler</h2>
      <p class="sub">Kalori ve glutensiz durumunu doğrudan listeden girebilirsiniz. Alerjen, besin değeri ve diğer bilgiler için <b>Düzenle</b>’ye tıklayın.</p>
      ${D.products.length || D.categories.length ? '' : `<div class="card" style="margin-bottom:16px"><b>Menünüz boş.</b><p class="sub" style="margin:6px 0 12px">ercanbrgr.com/menu içeriğini (kategoriler ve ürünler; kalori/alerjen boş) başlangıç olarak yükleyebilirsiniz.</p><button class="btn primary" id="seed" type="button">Başlangıç menüsünü yükle</button></div>`}
      <div class="stats" id="stats">${statsHtml()}</div>
      <div class="toolbar">
        <label class="grow">Ara<input id="fq" type="search" placeholder="Ürün adı veya içerik" value="${esc(F.q)}"></label>
        <label class="fixed">Kategori<select id="fcat"><option value="">Tüm kategoriler</option>${D.categories.map((c) => `<option value="${esc(c.id)}"${F.cat === c.id ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
        <label class="fixed">Göster<select id="fflag">
          ${[['', 'Tümü'], ['nokcal', 'Kalorisi eksik'], ['noalg', 'Alerjeni doğrulanmamış'], ['nogf', 'Glutensiz durumu belirtilmemiş'], ['gf', 'Glutensiz / seçenekli'], ['tagged', 'Etiketli ürünler'], ['soldout', 'Tükenenler'], ['noimg', 'Görseli olmayanlar']]
            .map(([v, l]) => `<option value="${v}"${F.flag === v ? ' selected' : ''}>${l}</option>`).join('')}
        </select></label>
        <button class="btn primary" id="newProduct" type="button">+ Yeni ürün</button>
      </div>
      <div class="plist" id="plist">${listHtml()}</div>`;
  }

  function refreshList() { $('#plist').innerHTML = listHtml(); $('#stats').innerHTML = statsHtml(); }

  function replaceProduct(p) {
    const i = D.products.findIndex((x) => x.id === p.id);
    if (i >= 0) D.products[i] = p; else D.products.push(p);
  }

  // Satır içi düzenleme. Kalori girişinde satır yeniden çizilmez (Tab ile hızlı veri girişi bozulmasın).
  // "Eksik olanlar" filtresi açıkken satır listeden hemen düşmez; bir sonraki filtre değişiminde düşer.
  async function patchProduct(id, patch, rowEl, kind) {
    try {
      const p = await A.updateProduct(id, patch);
      replaceProduct(p);
      if (rowEl && document.body.contains(rowEl)) {
        if (kind === 'kcal') {
          rowEl.querySelector('.inl-kcal').value = val(p.calories);
        } else if (kind === 'av') {
          rowEl.classList.toggle('off', !p.available);
        } else {
          rowEl.outerHTML = rowHtml(p, !!F.cat && !F.q && !F.flag);
          $(`.prow[data-id="${CSS.escape(id)}"] .inl-gf`)?.focus();
        }
        $(`.prow[data-id="${CSS.escape(id)}"]`)?.classList.add('saved-flash');
      }
      $('#stats').innerHTML = statsHtml();
    } catch (e) { fail(e); refreshList(); }
  }

  async function movePart(kind, id, dir) {
    try {
      await (kind === 'product' ? A.moveProduct : A.moveCategory)(id, dir);
      D.products.sort((a, b) => a.order - b.order);
      D.categories.sort((a, b) => a.order - b.order);
      render();
    } catch (e) { fail(e); }
  }

  $('#view').addEventListener('input', (e) => {
    if (e.target.id === 'fq') { F.q = e.target.value; refreshList(); }
  });

  $('#view').addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'fcat') { F.cat = t.value; refreshList(); return; }
    if (t.id === 'fflag') { F.flag = t.value; refreshList(); return; }
    const row = t.closest('.prow');
    if (!row) return;
    const id = row.dataset.id;
    if (t.classList.contains('inl-kcal')) patchProduct(id, { calories: t.value }, row, 'kcal');
    else if (t.classList.contains('inl-gf')) patchProduct(id, { glutenStatus: t.value }, row, 'gf');
    else if (t.classList.contains('inl-av')) patchProduct(id, { available: t.checked }, row, 'av');
  });

  $('#view').addEventListener('click', (e) => {
    if (e.target.closest('#newProduct')) return openEditor(null);
    const btn = e.target.closest('[data-act]');
    const row = e.target.closest('.prow');
    if (!btn || !row) return;
    const id = row.dataset.id;
    if (btn.dataset.act === 'edit') openEditor(id);
    if (btn.dataset.act === 'up') movePart('product', id, -1);
    if (btn.dataset.act === 'down') movePart('product', id, 1);
  });

  /* ---------------------------- Ürün düzenleme penceresi --------------------- */

  const blank = () => ({
    id: null, categoryId: F.cat || D.categories[0]?.id || '', name: '', description: '', price: null, image: '', calories: null, portion: '',
    protein: null, carbs: null, fat: null, allergens: [], allergenVerified: false, glutenStatus: 'unset', glutenNote: '', glutenPrice: null,
    tags: [], variants: [], notes: '', available: true,
  });

  function variantRow(v = { label: '', calories: '', price: '' }) {
    return `<div class="vrow"><input class="v-label" placeholder="Örn. 6'lı / 330ml" value="${esc(v.label)}" maxlength="40" aria-label="Seçenek adı"><input class="v-kcal" type="number" min="0" placeholder="kcal" value="${val(v.calories)}" aria-label="Seçenek kalorisi"><input class="v-price" type="number" min="0" step="0.01" placeholder="Fiyat" value="${val(v.price)}" aria-label="Seçenek fiyatı"><button class="btn icon danger" type="button" data-rm-var aria-label="Seçeneği sil">×</button></div>`;
  }

  function openEditor(id, prefill) {
    const src = id ? D.products.find((p) => p.id === id) : (prefill || blank());
    E = JSON.parse(JSON.stringify(src));
    const dlg = $('#editor');
    const isNew = !E.id;

    dlg.innerHTML = `
      <form id="pform" novalidate>
      <div class="m-head"><h3>${isNew ? 'Yeni ürün' : esc(E.name)}</h3><button class="btn icon" type="button" data-close aria-label="Kapat">×</button></div>
      <div class="m-body">
        <fieldset class="fs"><legend>Temel bilgiler</legend><div class="fg">
          <label class="wide">Ürün adı *<input id="f-name" value="${esc(E.name)}" maxlength="120" required></label>
          <label>Kategori<select id="f-cat">${D.categories.map((c) => `<option value="${esc(c.id)}"${c.id === E.categoryId ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
          <label>Fiyat (${esc(D.settings.currency)})<input id="f-price" type="number" min="0" step="0.01" value="${val(E.price)}" placeholder="Boş bırakılabilir"></label>
          <label class="wide">Açıklama / içindekiler<textarea id="f-desc" maxlength="600">${esc(E.description)}</textarea></label>
          <div class="wide"><label>Görsel</label>
            <div class="imgbox">
              <img class="thumb" id="f-thumb" alt="" ${E.image ? `src="${esc(E.image)}"` : 'hidden'}>
              <span class="thumb" id="f-thumb-ph" ${E.image ? 'hidden' : ''}>🍽</span>
              <input id="f-file" type="file" accept="image/png,image/jpeg,image/webp" style="width:auto">
              <button class="btn sm danger" type="button" id="f-rmimg" ${E.image ? '' : 'hidden'}>Görseli kaldır</button>
            </div>
            <small>PNG/JPEG/WebP. Otomatik olarak küçültülür. Şeffaf PNG önerilir.</small>
          </div>
          <label class="check wide"><input id="f-av" type="checkbox" ${E.available ? 'checked' : ''}> Satışta (kapalıysa menüde “Tükendi” görünür)</label>
        </div></fieldset>

        <fieldset class="fs"><legend>Besin değerleri</legend><div class="fg">
          <label>Kalori (kcal)<input id="f-kcal" type="number" min="0" step="1" value="${val(E.calories)}"></label>
          <label>Porsiyon<input id="f-portion" value="${esc(E.portion)}" placeholder="Örn. 320 gr" maxlength="40"></label>
          <label>Protein (g)<input id="f-protein" type="number" min="0" step="0.1" value="${val(E.protein)}"></label>
          <label>Karbonhidrat (g)<input id="f-carbs" type="number" min="0" step="0.1" value="${val(E.carbs)}"></label>
          <label>Yağ (g)<input id="f-fat" type="number" min="0" step="0.1" value="${val(E.fat)}"></label>
        </div></fieldset>

        <fieldset class="fs"><legend>Seçenekler (boyut / adet / çeşit)</legend>
          <div class="vrow head"><span>Ad</span><span>Kalori</span><span>Fiyat</span><span></span></div>
          <div id="vars">${E.variants.map(variantRow).join('')}</div>
          <button class="btn sm" type="button" id="addVar">+ Seçenek ekle</button>
        </fieldset>

        <fieldset class="fs"><legend>Alerjenler</legend>
          <div class="toggles" id="algs">${D.allergens.map((a) => `<button type="button" class="tg alg" data-alg="${a.id}" title="${esc(a.hint)}" aria-pressed="${E.allergens.includes(a.id)}">${a.emoji} ${esc(a.label)}</button>`).join('')}</div>
          <label class="check" style="margin-top:12px"><input id="f-verified" type="checkbox" ${E.allergenVerified ? 'checked' : ''}> Alerjen bilgisini kontrol ettim, doğru</label>
          <small>Müşteriye “Bilinen alerjen içermez” demek için hiçbirini seçmeden bu kutuyu işaretleyin. İşaretlenmezse menüde “alerjen bilgisi eklenmemiş” uyarısı görünür.</small>
        </fieldset>

        <fieldset class="fs"><legend>Glutensiz</legend>
          <div class="radios" id="gf">
            ${[['unset', 'Belirtilmedi', 'Bu ürün için glutensiz bilgisi verilmiyor.'],
               ['free', 'Glutensiz ürün', 'Ürün gluten içermez (ör. içecekler, patates).'],
               ['option', 'Glutensiz seçenek mevcut', 'Ürün gluten içerir ancak glutensiz alternatifi yapılabilir (ör. glutensiz ekmek).'],
               ['contains', 'Gluten içerir', 'Glutensiz seçeneği yoktur.']]
              .map(([v, t, d]) => `<label><input type="radio" name="gf" value="${v}" ${E.glutenStatus === v ? 'checked' : ''}><span>${t}<br><small>${d}</small></span></label>`).join('')}
          </div>
          <div class="fg" style="margin-top:12px">
            <label id="gf-price-wrap" ${E.glutenStatus === 'option' ? '' : 'hidden'}>Glutensiz seçenek ek ücreti (${esc(D.settings.currency)})<input id="f-gfprice" type="number" min="0" step="0.01" value="${val(E.glutenPrice)}"></label>
            <label class="wide" id="gf-note-wrap" ${E.glutenStatus === 'unset' ? 'hidden' : ''}>Glutensiz notu<input id="f-gfnote" value="${esc(E.glutenNote)}" maxlength="300" placeholder="Örn. Glutensiz ekmekle hazırlanır, ayrı ekipman kullanılır"></label>
          </div>
        </fieldset>

        <fieldset class="fs"><legend>Etiketler</legend>
          <div class="toggles" id="tagt">${D.tags.map((t) => `<button type="button" class="tg" data-tag="${esc(t.id)}" aria-pressed="${E.tags.includes(t.id)}">${esc(t.emoji)} ${esc(t.label)}</button>`).join('')}</div>
        </fieldset>

        <fieldset class="fs"><legend>Ek bilgi</legend>
          <label>Not (müşteriye gösterilir)<textarea id="f-notes" maxlength="300" placeholder="Örn. Acı içerir · Vegan seçeneği için sorunuz">${esc(E.notes)}</textarea></label>
        </fieldset>
      </div>
      <div class="m-foot">
        ${isNew ? '' : '<button class="btn danger left" type="button" id="f-del">Sil</button><button class="btn left" type="button" id="f-dup">Kopyala</button>'}
        <button class="btn" type="button" data-close>Vazgeç</button>
        ${isNew ? '' : '<button class="btn" type="button" id="f-savenext">Kaydet ve sonrakine geç →</button>'}
        <button class="btn primary" type="submit">Kaydet</button>
      </div>
      </form>`;
    syncGluten();
    if (!dlg.open) dlg.showModal(); // "sonrakine geç" / "kopyala" açık pencerenin içeriğini yeniler
    dlg.querySelector('.m-body').scrollTop = 0;
    $('#f-name').focus();
  }

  // Glutensiz durumu ↔ gluten alerjeni tutarlılığı (sunucudaki kuralın aynısı)
  function syncGluten() {
    const st = $('input[name="gf"]:checked')?.value || 'unset';
    const btn = $('[data-alg="gluten"]');
    if (!btn) return;
    if (st === 'free') E.allergens = E.allergens.filter((a) => a !== 'gluten');
    if (st === 'contains' || st === 'option') if (!E.allergens.includes('gluten')) E.allergens.push('gluten');
    btn.setAttribute('aria-pressed', String(E.allergens.includes('gluten')));
    btn.disabled = st !== 'unset';
    $('#gf-price-wrap').hidden = st !== 'option';
    $('#gf-note-wrap').hidden = st === 'unset';
  }

  function collect() {
    return {
      name: $('#f-name').value,
      categoryId: $('#f-cat').value,
      price: $('#f-price').value,
      description: $('#f-desc').value,
      image: E.image,
      available: $('#f-av').checked,
      calories: $('#f-kcal').value,
      portion: $('#f-portion').value,
      protein: $('#f-protein').value,
      carbs: $('#f-carbs').value,
      fat: $('#f-fat').value,
      variants: $$('#vars .vrow').map((r) => ({ label: $('.v-label', r).value, calories: $('.v-kcal', r).value, price: $('.v-price', r).value })),
      allergens: E.allergens,
      allergenVerified: $('#f-verified').checked,
      glutenStatus: $('input[name="gf"]:checked')?.value || 'unset',
      glutenNote: $('#f-gfnote').value,
      glutenPrice: $('#f-gfprice').value,
      tags: E.tags,
      notes: $('#f-notes').value,
    };
  }

  async function saveEditor(goNext) {
    const body = collect();
    if (!body.name.trim()) { $('#f-name').focus(); return toast('Ürün adı zorunlu', true); }
    const list = filtered().map((p) => p.id); // "sonraki" için mevcut listeyi kaydetmeden önce al
    try {
      const saved = E.id ? await A.updateProduct(E.id, body) : await A.createProduct(body);
      replaceProduct(saved);
      if (!E.id) D.products.sort((a, b) => a.order - b.order);
      toast('Kaydedildi');
      const nextId = goNext ? list[list.indexOf(saved.id) + 1] : null;
      if (view === 'products') refreshList();
      if (nextId) openEditor(nextId);
      else $('#editor').close();
    } catch (e) { fail(e); }
  }

  const editor = $('#editor');
  editor.addEventListener('submit', (e) => { e.preventDefault(); saveEditor(false); });
  editor.addEventListener('click', async (e) => {
    const t = e.target;
    if (t.closest('[data-close]')) return editor.close();
    if (t.id === 'addVar') { $('#vars').insertAdjacentHTML('beforeend', variantRow()); $$('#vars .v-label').at(-1).focus(); }
    if (t.closest('[data-rm-var]')) t.closest('.vrow').remove();
    if (t.id === 'f-savenext') saveEditor(true);
    const alg = t.closest('[data-alg]');
    if (alg && !alg.disabled) {
      const id = alg.dataset.alg;
      E.allergens = E.allergens.includes(id) ? E.allergens.filter((a) => a !== id) : [...E.allergens, id];
      alg.setAttribute('aria-pressed', String(E.allergens.includes(id)));
    }
    const tag = t.closest('[data-tag]');
    if (tag) {
      const id = tag.dataset.tag;
      E.tags = E.tags.includes(id) ? E.tags.filter((x) => x !== id) : [...E.tags, id];
      tag.setAttribute('aria-pressed', String(E.tags.includes(id)));
    }
    if (t.id === 'f-rmimg') { E.image = ''; $('#f-thumb').hidden = true; $('#f-thumb-ph').hidden = false; t.hidden = true; }
    if (t.id === 'f-del') {
      if (!confirm(`“${E.name}” silinsin mi? Bu işlem geri alınamaz.`)) return;
      try {
        await A.deleteProduct(E.id);
        D.products = D.products.filter((p) => p.id !== E.id);
        editor.close();
        refreshList();
        toast('Ürün silindi');
      } catch (ex) { fail(ex); }
    }
    if (t.id === 'f-dup') {
      const copy = { ...collect(), id: null };
      copy.name = copy.name + ' (kopya)';
      openEditor(null, { ...blank(), ...copy, variants: copy.variants.map((v) => ({ ...v })) });
    }
  });

  editor.addEventListener('change', async (e) => {
    if (e.target.name === 'gf') syncGluten();
    if (e.target.id === 'f-file') {
      const file = e.target.files[0];
      if (!file) return;
      try {
        toast('Görsel yükleniyor…');
        E.image = await uploadImage(file, 640);
        $('#f-thumb').src = E.image;
        $('#f-thumb').hidden = false;
        $('#f-thumb-ph').hidden = true;
        $('#f-rmimg').hidden = false;
        toast('Görsel yüklendi (Kaydet’e basmayı unutmayın)');
      } catch (ex) { fail(ex); }
    }
  });

  /* ------------------------------- Kategoriler ------------------------------ */

  function renderCategories() {
    const count = (id) => D.products.filter((p) => p.categoryId === id).length;
    $('#view').innerHTML = `
      <h2 class="vt">Kategoriler</h2>
      <p class="sub">Sıralamayı ok butonlarıyla değiştirin. Pasif kategoriler menüde görünmez.</p>
      <div class="rows" id="catrows">
        ${D.categories.map((c, i) => `
          <div class="rowx" data-id="${esc(c.id)}">
            <div class="fields">
              <input class="c-name" value="${esc(c.name)}" maxlength="80" aria-label="Kategori adı">
              <small style="flex:0 0 70px">${count(c.id)} ürün</small>
              <label class="check" style="flex:0 0 auto"><span class="switch"><input class="c-active" type="checkbox" ${c.active ? 'checked' : ''}></span> Aktif</label>
            </div>
            <div class="act">
              <button class="btn icon" data-c="up" ${i === 0 ? 'disabled' : ''} aria-label="Yukarı">↑</button>
              <button class="btn icon" data-c="down" ${i === D.categories.length - 1 ? 'disabled' : ''} aria-label="Aşağı">↓</button>
              <button class="btn sm danger" data-c="del">Sil</button>
            </div>
          </div>`).join('')}
      </div>
      <form class="add-row" id="newCat"><input id="newCatName" placeholder="Yeni kategori adı" maxlength="80" required><button class="btn primary" type="submit">+ Kategori ekle</button></form>`;
  }

  async function reload() { D = await A.loadAll(); render(); }

  /* ------------------------------- Etiketler -------------------------------- */

  function renderTags() {
    $('#view').innerHTML = `
      <h2 class="vt">Etiketler</h2>
      <p class="sub">Şefin seçimi, ayın ürünü, haftanın ürünü, yeni gibi etiketleri yönetin ve ürünlere atayın. Etiketler menüde ürün kartında rozet olarak ve üstteki hızlı filtrelerde görünür.</p>
      <div class="cards" id="tagcards">
        ${D.tags.map((t) => {
          const assigned = D.products.filter((p) => p.tags.includes(t.id));
          const free = D.products.filter((p) => !p.tags.includes(t.id));
          return `
          <div class="card tagcard" data-id="${esc(t.id)}">
            <header>
              <div class="fields">
                <input class="narrow t-emoji" value="${esc(t.emoji)}" maxlength="8" aria-label="Emoji">
                <input class="t-label" value="${esc(t.label)}" maxlength="30" aria-label="Etiket adı">
                <input class="color t-color" type="color" value="${esc(t.color)}" aria-label="Renk">
              </div>
              <button class="btn sm danger" data-t="del">Etiketi sil</button>
            </header>
            <div class="assigned">${assigned.length ? assigned.map((p) => `<span class="pill" style="background:${esc(t.color)}">${esc(p.name)} <button type="button" data-t="rm" data-p="${esc(p.id)}" aria-label="${esc(p.name)} ürününden kaldır">×</button></span>`).join('') : '<span class="empty">Bu etikete atanmış ürün yok</span>'}</div>
            <label>Ürün ata
              <select class="t-add"><option value="">Ürün seçin…</option>${free.map((p) => `<option value="${esc(p.id)}">${esc(p.name)} — ${esc(catName(p.categoryId))}</option>`).join('')}</select>
            </label>
          </div>`;
        }).join('')}
      </div>
      <form class="add-row" id="newTag" style="margin-top:16px">
        <input id="newTagEmoji" placeholder="😀" maxlength="8" style="flex:0 0 70px">
        <input id="newTagLabel" placeholder="Yeni etiket adı (örn. Vegan)" maxlength="30" required>
        <input id="newTagColor" type="color" value="#7a3e9d" style="flex:0 0 56px" aria-label="Renk">
        <button class="btn primary" type="submit">+ Etiket ekle</button>
      </form>`;
  }

  /* -------------------------------- Ayarlar --------------------------------- */

  function renderSettings() {
    const s = D.settings;
    $('#view').innerHTML = `
      <h2 class="vt">Ayarlar</h2>
      <p class="sub">İşletme bilgileri, görünüm ve bilgilendirme metinleri.</p>
      <form id="setForm" class="card">
        <div class="form-grid">
          <label>İşletme adı<input id="s-name" value="${esc(s.name)}" maxlength="60"></label>
          <label>Sayfa başlığı (üst bant)<input id="s-tagline" value="${esc(s.tagline)}" maxlength="40"></label>
          <label>Ana renk<input id="s-color" type="color" value="${esc(s.brandColor)}"></label>
          <label>Para birimi<input id="s-cur" value="${esc(s.currency)}" maxlength="4"></label>
          <label class="check full"><input id="s-prices" type="checkbox" ${s.showPrices ? 'checked' : ''}> Menüde fiyatları göster</label>
          <div class="full"><label>Logo</label>
            <div class="imgbox">
              <img class="thumb" id="s-logoimg" style="width:auto;min-width:84px" alt="" ${s.logo ? `src="${esc(s.logo)}"` : 'hidden'}>
              <input id="s-logofile" type="file" accept="image/png,image/jpeg,image/webp" style="width:auto">
              <button class="btn sm danger" type="button" id="s-logorm" ${s.logo ? '' : 'hidden'}>Logoyu kaldır</button>
            </div>
            <small>Logo yoksa işletme adı yazı olarak gösterilir.</small>
          </div>
          <label>Telefon<input id="s-phone" value="${esc(s.phone)}" maxlength="30"></label>
          <label>Instagram kullanıcı adı<input id="s-ig" value="${esc(s.instagram)}" maxlength="100" placeholder="ornek"></label>
          <label>Web sitesi<input id="s-web" value="${esc(s.website)}" maxlength="200" placeholder="https://"></label>
          <label class="full">Adres<input id="s-addr" value="${esc(s.address)}" maxlength="200"></label>
          <label class="full">Kalori bilgilendirmesi<textarea id="s-cal" maxlength="400">${esc(s.calorieNote)}</textarea></label>
          <label class="full">Alerjen / çapraz bulaşma bilgilendirmesi<textarea id="s-alg" maxlength="800">${esc(s.allergenNote)}</textarea><small>Bu metin her ürün detayında ve sayfa altında gösterilir. Mutfağınızın gerçek durumuna göre düzenleyin.</small></label>
        </div>
        <div class="btnrow"><button class="btn primary" type="submit">Ayarları kaydet</button></div>
      </form>

      <h3 class="section-title">Yönetici şifresi</h3>
      <form id="pwForm" class="card"><div class="form-grid">
        <label>Mevcut şifre<input id="pwCurrent" type="password" autocomplete="current-password" required></label>
        <label>Yeni şifre (en az 8 karakter)<input id="pwNext" type="password" autocomplete="new-password" minlength="8" required></label>
      </div><div class="btnrow"><button class="btn" type="submit">Şifreyi değiştir</button></div></form>`;
  }

  /* ---------------------------------- Araçlar -------------------------------- */

  let qrUrl = '';
  function renderTools() {
    qrUrl = qrUrl || location.origin + location.pathname.replace(/admin\/?$/, '');
    $('#view').innerHTML = `
      <h2 class="vt">QR kod &amp; yedekleme</h2>
      <p class="sub">Masalara koyacağınız QR kodu oluşturun ve verilerinizi yedekleyin.</p>
      <div class="card">
        <div class="qr-wrap">
          <div>
            <label>Menü adresi<input id="qr-url" value="${esc(qrUrl)}" placeholder="https://menu.siteniz.com/"></label>
            <p class="hint" id="qr-warn" style="margin:8px 0 0" ${/localhost|127\.0\.0\.1/.test(qrUrl) ? '' : 'hidden'}>⚠ Bu adres yalnızca bu bilgisayardan çalışır. Müşterilerin telefonundan açılabilmesi için menünün yayındaki adresini yazın.</p>
            <div class="btnrow">
              <button class="btn primary" id="qr-svg" type="button">SVG indir</button>
              <button class="btn" id="qr-png" type="button">PNG indir</button>
              <button class="btn" id="qr-print" type="button">Yazdır</button>
            </div>
          </div>
          <div class="qr-box"><img id="qr-img" alt="Menü QR kodu"></div>
        </div>
      </div>

      <h3 class="section-title">Yedekleme</h3>
      <div class="card">
        <p style="margin-top:0">Tüm ürünleri (görseller dahil), kategorileri, etiketleri ve ayarları JSON dosyası olarak indirin. Yönetici şifresi yedeğe dahil edilmez.</p>
        <div class="btnrow">
          <button class="btn" id="exp" type="button">Yedeği indir</button>
          <label class="btn" style="cursor:pointer">Yedekten geri yükle<input id="imp" type="file" accept="application/json,.json" hidden></label>
        </div>
      </div>`;
    drawQr();
  }

  function drawQr() {
    const img = $('#qr-img');
    if (!img) return;
    $('#qr-warn').hidden = !/localhost|127\.0\.0\.1/.test(qrUrl);
    qrSvgText().then((svg) => { img.src = svgDataUrl(svg); }).catch((e) => { img.removeAttribute('src'); toast(e.message, true); });
  }

  function download(name, blobOrUrl) {
    const a = document.createElement('a');
    a.href = typeof blobOrUrl === 'string' ? blobOrUrl : URL.createObjectURL(blobOrUrl);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  const qrSvgText = () => A.qrSvg(qrUrl);
  // CSP img-src blob: içermediği için görseller data URL ile kullanılır
  const svgDataUrl = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

  async function qrPngCanvas(size) {
    const img = new Image();
    const src = svgDataUrl(await qrSvgText());
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('QR çizilemedi')); img.src = src; });
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, size, size);
    return c;
  }
  const qrPngBlob = async (size = 1024) => new Promise((res) => qrPngCanvas(size).then((c) => c.toBlob(res, 'image/png')));

  /* --------------------------- Diğer sekmelerin olayları --------------------- */

  $('#view').addEventListener('click', async (e) => {
    const t = e.target;
    try {
      // Kategoriler
      const cbtn = t.closest('[data-c]');
      if (cbtn) {
        const id = cbtn.closest('.rowx').dataset.id;
        if (cbtn.dataset.c === 'up' || cbtn.dataset.c === 'down') return movePart('category', id, cbtn.dataset.c === 'up' ? -1 : 1);
        if (cbtn.dataset.c === 'del') {
          if (!confirm(`“${catName(id)}” kategorisi silinsin mi?`)) return;
          await A.deleteCategory(id);
          toast('Kategori silindi');
          return reload();
        }
      }
      // Etiketler
      const tbtn = t.closest('[data-t]');
      if (tbtn) {
        const id = tbtn.closest('.tagcard').dataset.id;
        if (tbtn.dataset.t === 'del') {
          if (!confirm(`“${tagOf(id).label}” etiketi tüm ürünlerden kaldırılıp silinsin mi?`)) return;
          await A.deleteTag(id);
          toast('Etiket silindi');
          return reload();
        }
        if (tbtn.dataset.t === 'rm') {
          const p = D.products.find((x) => x.id === tbtn.dataset.p);
          replaceProduct(await A.updateProduct(p.id, { tags: p.tags.filter((x) => x !== id) }));
          return renderTags();
        }
      }
      // QR
      if (t.id === 'exp') download(`menu-yedek-${new Date().toISOString().slice(0, 10)}.json`, new Blob([JSON.stringify(A.exportBackup(), null, 2)], { type: 'application/json' }));
      if (t.id === 'seed') {
        t.disabled = true;
        D = await A.seedDefaults();
        toast('Başlangıç menüsü yüklendi');
        return render();
      }
      if (t.id === 'qr-svg') download('menu-qr.svg', new Blob([await qrSvgText()], { type: 'image/svg+xml' }));
      if (t.id === 'qr-png') download('menu-qr.png', await qrPngBlob());
      if (t.id === 'qr-print') {
        const png = (await qrPngCanvas(840)).toDataURL('image/png');
        $('#printSheet').innerHTML = `<h1>${esc(D.settings.name)}</h1><p>Menü için QR kodu okutun</p><img src="${png}" alt="">`;
        const img = $('#printSheet img');
        await img.decode().catch(() => {});
        window.print();
      }
      if (t.id === 's-logorm') { D.settings.logo = ''; $('#s-logoimg').hidden = true; t.hidden = true; }
    } catch (ex) { fail(ex); }
  });

  $('#view').addEventListener('change', async (e) => {
    const t = e.target;
    try {
      if (view === 'categories') {
        const id = t.closest('.rowx')?.dataset.id;
        if (!id) return;
        if (t.classList.contains('c-name')) await A.updateCategory(id, { name: t.value });
        if (t.classList.contains('c-active')) await A.updateCategory(id, { active: t.checked });
        toast('Kaydedildi');
      }
      if (view === 'tags') {
        const card = t.closest('.tagcard');
        if (!card) return;
        const id = card.dataset.id;
        if (t.classList.contains('t-add') && t.value) {
          const p = D.products.find((x) => x.id === t.value);
          replaceProduct(await A.updateProduct(p.id, { tags: [...p.tags, id] }));
          toast('Etiket atandı');
          return renderTags();
        }
        if (t.matches('.t-emoji, .t-label, .t-color')) {
          await A.updateTag(id, { emoji: $('.t-emoji', card).value, label: $('.t-label', card).value, color: $('.t-color', card).value });
          toast('Kaydedildi');
        }
      }
      if (t.id === 'qr-url') { qrUrl = t.value.trim(); drawQr(); }
      if (t.id === 's-logofile' && t.files[0]) {
        toast('Logo yükleniyor…');
        D.settings.logo = await uploadImage(t.files[0], 600);
        $('#s-logoimg').src = D.settings.logo;
        $('#s-logoimg').hidden = false;
        $('#s-logorm').hidden = false;
        toast('Logo yüklendi (Kaydet’e basın)');
      }
      if (t.id === 'imp' && t.files[0]) {
        if (!confirm('Mevcut tüm menü verisi yedekteki verilerle DEĞİŞTİRİLECEK. Devam edilsin mi?')) { t.value = ''; return; }
        const json = JSON.parse(await t.files[0].text());
        const n = await A.importBackup(json);
        toast(`${n} ürün geri yüklendi`);
        await reload();
      }
    } catch (ex) {
      fail(ex);
      if (view === 'categories' || view === 'tags') reload().catch(() => {});
    }
  });

  $('#view').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = e.target.id;
    try {
      if (id === 'newCat') {
        await A.createCategory({ name: $('#newCatName').value });
        toast('Kategori eklendi');
        await reload();
      }
      if (id === 'newTag') {
        await A.createTag({ emoji: $('#newTagEmoji').value, label: $('#newTagLabel').value, color: $('#newTagColor').value });
        toast('Etiket eklendi');
        await reload();
      }
      if (id === 'setForm') {
        D.settings = await A.saveSettings({
          name: $('#s-name').value, tagline: $('#s-tagline').value, brandColor: $('#s-color').value, currency: $('#s-cur').value,
          showPrices: $('#s-prices').checked, logo: D.settings.logo, phone: $('#s-phone').value, instagram: $('#s-ig').value,
          website: $('#s-web').value, address: $('#s-addr').value, calorieNote: $('#s-cal').value, allergenNote: $('#s-alg').value,
        });
        $('#appName').textContent = `${D.settings.name} · Yönetim`;
        document.documentElement.style.setProperty('--brand', D.settings.brandColor);
        toast('Ayarlar kaydedildi');
      }
      if (id === 'pwForm') {
        await A.changePassword($('#pwCurrent').value, $('#pwNext').value);
        $('#pwWarn').hidden = true;
        e.target.reset();
        toast('Şifre değiştirildi');
      }
    } catch (ex) { fail(ex); }
  });

  /* --------------------------------- Başlangıç ------------------------------- */

  A.watchAuth(async (user) => {
    if (!A.isAdmin(user)) { D = null; showLogin(); return; }
    try { await load(); } catch (e) { fail(e); showLogin(); }
  });
})();
