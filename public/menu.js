(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s || '').toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');
  const fmt = (n) => Number(n).toLocaleString('tr-TR', { maximumFractionDigits: 2 });

  const state = { data: null, q: '', tag: 'all', gluten: false, avoid: new Set(), maxKcal: null };
  const KCAL_STEPS = [300, 500, 700];
  let byId = new Map();
  let algMap = new Map();
  let tagMap = new Map();

  /* ------------------------------ Yardımcılar ------------------------------ */

  const money = (n) => `${fmt(n)} ${esc(state.data.settings.currency)}`;

  function kcalText(p) {
    if (p.calories != null) return `${fmt(p.calories)} kcal`;
    const v = p.variants.map((x) => x.calories).filter((x) => x != null);
    if (!v.length) return '';
    const lo = Math.min(...v), hi = Math.max(...v);
    return lo === hi ? `${fmt(lo)} kcal` : `${fmt(lo)}–${fmt(hi)} kcal`;
  }

  function kcalMin(p) {
    const v = [p.calories, ...p.variants.map((x) => x.calories)].filter((x) => x != null);
    return v.length ? Math.min(...v) : null;
  }

  function priceHtml(p) {
    if (!state.data.settings.showPrices) return '';
    const vp = p.variants.map((v) => v.price).filter((x) => x != null);
    if (p.price != null) return `<span class="price">${money(p.price)}</span>`;
    if (vp.length) return `<span class="price"><small>başlangıç</small> ${money(Math.min(...vp))}</span>`;
    return '';
  }

  const tagHtml = (p) =>
    p.tags.map((id) => tagMap.get(id)).filter(Boolean)
      .map((t) => `<span class="tag" style="background:${esc(t.color)}">${esc(t.emoji)} ${esc(t.label)}</span>`).join('');

  const glutenBadge = (p) =>
    p.glutenStatus === 'free' ? '<span class="badge gf">🌾 Glutensiz</span>'
      : p.glutenStatus === 'option' ? '<span class="badge gf-opt">🌾 Glutensiz seçenek</span>' : '';

  const hasFilters = () => state.avoid.size > 0 || state.maxKcal != null;

  /* -------------------------------- Filtreleme ------------------------------ */

  function matches(p, ignore = {}) {
    if (state.q) {
      const hay = norm([p.name, p.description, ...p.variants.map((v) => v.label)].join(' '));
      if (!state.q.split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    if (!ignore.tag && state.tag !== 'all' && !p.tags.includes(state.tag)) return false;
    if (state.gluten && !(p.glutenStatus === 'free' || p.glutenStatus === 'option')) return false;
    for (const a of state.avoid) {
      if (a === 'gluten' && p.glutenStatus === 'option') continue; // glutensiz seçeneği var
      if (p.allergens.includes(a)) return false;
    }
    if (state.maxKcal != null) {
      const k = kcalMin(p);
      if (k == null || k > state.maxKcal) return false;
    }
    return true;
  }

  /* --------------------------------- Çizim ---------------------------------- */

  function cardHtml(p) {
    const kcal = kcalText(p);
    const icons = p.allergens.map((id) => algMap.get(id)).filter(Boolean)
      .map((a) => `<span title="${esc(a.label)}" aria-label="${esc(a.label)}">${a.emoji}</span>`).join('');
    const warn = state.avoid.size > 0 && !p.allergenVerified
      ? '<span class="badge warn">⚠ Alerjen bilgisi doğrulanmadı</span>' : '';
    const img = p.image ? `<div class="pic"><img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" decoding="async"></div>` : '';
    const tags = tagHtml(p);
    return `
      <article class="card${p.image ? '' : ' noimg'}${p.available ? '' : ' soldout'}" data-id="${esc(p.id)}" role="button" tabindex="0" aria-label="${esc(p.name)} detayı">
        ${img}
        <div class="body">
          ${tags ? `<div class="tags">${tags}</div>` : ''}
          <h3>${esc(p.name)}</h3>
          ${p.description ? `<p class="desc">${esc(p.description)}</p>` : ''}
          <div class="meta">
            ${p.available ? '' : '<span class="badge warn">Tükendi</span>'}
            ${kcal ? `<span class="badge">🔥 ${kcal}</span>` : ''}
            ${glutenBadge(p)}
            ${warn}
            ${icons ? `<span class="allergen-row" aria-label="Alerjenler">${icons}</span>` : ''}
            ${priceHtml(p)}
          </div>
        </div>
      </article>`;
  }

  function render() {
    const { categories, products } = state.data;
    const list = products.filter((p) => matches(p));
    const sections = categories
      .map((c) => ({ c, items: list.filter((p) => p.categoryId === c.id) }))
      .filter((s) => s.items.length);

    const root = $('#menu');
    if (!sections.length) {
      root.innerHTML = `<div class="state"><p><strong>Sonuç bulunamadı.</strong><br>Arama veya filtreleri değiştirmeyi deneyin.</p><button class="btn" id="clearAll" type="button" style="max-width:220px">Filtreleri temizle</button></div>`;
    } else {
      root.innerHTML = sections.map(({ c, items }) => `
        <section class="section" id="cat-${esc(c.id)}" data-cat="${esc(c.id)}">
          <h2>${esc(c.name)}</h2>
          <div class="grid">${items.map(cardHtml).join('')}</div>
        </section>`).join('');
    }

    $('#catNavIn').innerHTML = sections
      .map(({ c }) => `<a class="pill" href="#cat-${esc(c.id)}" data-cat="${esc(c.id)}">${esc(c.name)}</a>`).join('');
    $('#catNav').hidden = !sections.length;
    observeSections();
    renderChips();
    renderActiveBar();
  }

  function renderChips() {
    const { products, tags } = state.data;
    const base = (fn) => products.filter((p) => matches(p, { tag: true }) && fn(p)).length;
    const usedTags = tags.filter((t) => products.some((p) => p.tags.includes(t.id)));
    const anyGluten = products.some((p) => p.glutenStatus === 'free' || p.glutenStatus === 'option');
    const allActive = state.tag === 'all' && !state.gluten;

    $('#quickChips').innerHTML =
      `<button class="chip" type="button" data-tag="all" aria-pressed="${allActive}">Tümü</button>` +
      usedTags.map((t) =>
        `<button class="chip" type="button" data-tag="${esc(t.id)}" aria-pressed="${state.tag === t.id}">${esc(t.emoji)} ${esc(t.label)} <span class="n">${base((p) => p.tags.includes(t.id))}</span></button>`).join('') +
      (anyGluten
        ? `<button class="chip gf" type="button" data-gluten aria-pressed="${state.gluten}">🌾 Glutensiz</button>` : '');

    const badge = $('#filterBadge');
    const n = state.avoid.size + (state.maxKcal != null ? 1 : 0);
    badge.hidden = !n;
    badge.textContent = n;
  }

  function renderActiveBar() {
    const bar = $('#activeBar');
    if (!hasFilters()) { bar.hidden = true; return; }
    const parts = [];
    if (state.avoid.size) parts.push(`Hariç: ${[...state.avoid].map((id) => algMap.get(id)?.label).filter(Boolean).join(', ')}`);
    if (state.maxKcal != null) parts.push(`En fazla ${state.maxKcal} kcal`);
    bar.hidden = false;
    bar.innerHTML = `<span>${esc(parts.join(' · '))}</span><button type="button" data-clear-adv>Temizle</button>`;
  }

  /* ---------------------------- Scroll takibi (nav) -------------------------- */

  let observer;
  function observeSections() {
    observer?.disconnect();
    observer = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        document.querySelectorAll('.pill').forEach((p) => p.classList.toggle('on', p.dataset.cat === e.target.dataset.cat));
        const on = $('.pill.on');
        on?.scrollIntoView({ block: 'nearest', inline: 'center' });
      });
    }, { rootMargin: '-70px 0px -65% 0px' });
    document.querySelectorAll('.section').forEach((s) => observer.observe(s));
  }

  /* ---------------------------------- Detay ---------------------------------- */

  function openDetail(id, { push = true } = {}) {
    const p = byId.get(id);
    if (!p) return;
    const s = state.data.settings;
    const dlg = $('#detail');

    const nutri = [
      p.calories != null && ['kcal', fmt(p.calories), 'kcal (kalori)'],
      p.portion && ['', esc(p.portion), 'porsiyon'],
      p.protein != null && ['', fmt(p.protein) + ' g', 'protein'],
      p.carbs != null && ['', fmt(p.carbs) + ' g', 'karbonhidrat'],
      p.fat != null && ['', fmt(p.fat) + ' g', 'yağ'],
    ].filter(Boolean);

    const hasVarData = p.variants.some((v) => v.price != null || v.calories != null);
    const variants = p.variants.length ? `
      <div class="block"><h4>Seçenekler</h4>
        <table class="vtable">${p.variants.map((v) => `
          <tr><td>${esc(v.label)}</td>
          <td>${v.calories != null ? `${fmt(v.calories)} kcal` : (hasVarData ? '–' : '')}</td>
          ${s.showPrices ? `<td><strong>${v.price != null ? money(v.price) : '–'}</strong></td>` : ''}</tr>`).join('')}
        </table></div>` : '';

    const algs = p.allergens.map((id) => algMap.get(id)).filter(Boolean);
    let algBlock;
    if (algs.length) {
      algBlock = `<div class="alg-list">${algs.map((a) => `<span class="alg" title="${esc(a.hint)}">${a.emoji} ${esc(a.label)}</span>`).join('')}</div>
        ${p.allergenVerified ? '' : '<p class="fine">Bu ürünün alerjen bilgisi henüz doğrulanmamıştır; lütfen personelimize danışın.</p>'}`;
    } else if (p.allergenVerified) {
      algBlock = '<div class="notice ok"><strong>Bilinen alerjen içermez</strong>Yine de çapraz bulaşma riski için aşağıdaki bilgilendirmeye bakın.</div>';
    } else {
      algBlock = '<div class="notice warn"><strong>Alerjen bilgisi eklenmemiş</strong>Alerjeniniz varsa lütfen sipariş vermeden önce personelimize danışın.</div>';
    }

    let gluten = '';
    if (p.glutenStatus === 'free') {
      gluten = `<div class="block"><h4>Glutensiz</h4><div class="notice ok"><strong>🌾 Glutensiz ürün</strong>${esc(p.glutenNote)}</div></div>`;
    } else if (p.glutenStatus === 'option') {
      const extra = p.glutenPrice != null && s.showPrices ? ` (+${money(p.glutenPrice)})` : '';
      gluten = `<div class="block"><h4>Glutensiz</h4><div class="notice ok"><strong>🌾 Glutensiz seçenek mevcut${extra}</strong>${esc(p.glutenNote || 'Sipariş verirken glutensiz seçeneği isteyiniz.')}</div></div>`;
    } else if (p.glutenStatus === 'contains') {
      gluten = `<div class="block"><h4>Glutensiz</h4><div class="notice warn"><strong>Gluten içerir</strong>${esc(p.glutenNote)}</div></div>`;
    }

    dlg.innerHTML = `
      <div class="sheet-head"><h2>Ürün detayı</h2><button class="x" type="button" data-close aria-label="Kapat">×</button></div>
      <div class="sheet-body">
        ${p.image ? `<div class="d-pic"><img src="${esc(p.image)}" alt="${esc(p.name)}"></div>` : ''}
        ${p.tags.length ? `<div class="tags">${tagHtml(p)}</div>` : ''}
        <h3 class="d-name">${esc(p.name)}</h3>
        ${p.available ? '' : '<span class="badge warn">Tükendi</span>'}
        ${p.description ? `<p class="d-desc">${esc(p.description)}</p>` : ''}
        ${s.showPrices && p.price != null ? `<div class="d-price">${money(p.price)}</div>` : ''}
        ${variants}
        ${nutri.length ? `<div class="block"><h4>Besin değerleri</h4><div class="nutri">${nutri.map(([c, v, l]) => `<div class="${c}"><b>${v}</b><span>${l}</span></div>`).join('')}</div>${s.calorieNote ? `<p class="fine">${esc(s.calorieNote)}</p>` : ''}</div>` : ''}
        <div class="block"><h4>Alerjenler</h4>${algBlock}</div>
        ${gluten}
        ${p.notes ? `<div class="block"><h4>Ek bilgi</h4><div class="notice">${esc(p.notes)}</div></div>` : ''}
        ${s.allergenNote ? `<p class="fine" style="margin-top:18px">${esc(s.allergenNote)}</p>` : ''}
      </div>`;
    if (!dlg.open) dlg.showModal();
    if (push) history.replaceState(null, '', `#p=${encodeURIComponent(id)}`);
  }

  /* ---------------------------------- Filtre paneli --------------------------- */

  function openFilters() {
    const dlg = $('#filters');
    const draw = () => {
      const count = state.data.products.filter((p) => matches(p)).length;
      dlg.innerHTML = `
        <div class="sheet-head"><h2>Filtreler</h2><button class="x" type="button" data-close aria-label="Kapat">×</button></div>
        <div class="sheet-body">
          <div class="f-group">
            <h3>Glutensiz</h3>
            <p>Yalnızca glutensiz olduğu veya glutensiz seçeneği bulunduğu belirtilen ürünler gösterilir.</p>
            <div class="opts"><button class="opt gf" type="button" data-f="gluten" aria-pressed="${state.gluten}">🌾 Sadece glutensiz seçenekler</button></div>
          </div>
          <div class="f-group">
            <h3>Alerjenim var</h3>
            <p>Seçtiğiniz alerjenleri içeren ürünler gizlenir. Alerjen bilgisi girilmemiş ürünler uyarıyla gösterilir.</p>
            <div class="opts">${state.data.allergens.map((a) => `<button class="opt avoid" type="button" data-avoid="${a.id}" aria-pressed="${state.avoid.has(a.id)}" title="${esc(a.hint)}">${a.emoji} ${esc(a.label)}</button>`).join('')}</div>
          </div>
          <div class="f-group">
            <h3>Kalori</h3>
            <p>Kalori bilgisi girilmemiş ürünler bu filtrede gizlenir.</p>
            <div class="opts">
              <button class="opt" type="button" data-kcal="" aria-pressed="${state.maxKcal == null}">Hepsi</button>
              ${KCAL_STEPS.map((k) => `<button class="opt" type="button" data-kcal="${k}" aria-pressed="${state.maxKcal === k}">≤ ${k} kcal</button>`).join('')}
            </div>
          </div>
        </div>
        <div class="sheet-foot">
          <button class="btn" type="button" data-f="reset">Temizle</button>
          <button class="btn primary" type="button" data-close>${count} ürünü göster</button>
        </div>`;
    };
    dlg.onclick = (e) => {
      const t = e.target;
      if (t === dlg || t.closest('[data-close]')) return dlg.close();
      const avoid = t.closest('[data-avoid]')?.dataset.avoid;
      if (avoid) state.avoid.has(avoid) ? state.avoid.delete(avoid) : state.avoid.add(avoid);
      const kcal = t.closest('[data-kcal]');
      if (kcal) state.maxKcal = kcal.dataset.kcal ? Number(kcal.dataset.kcal) : null;
      const f = t.closest('[data-f]')?.dataset.f;
      if (f === 'gluten') state.gluten = !state.gluten;
      if (f === 'reset') Object.assign(state, { gluten: false, maxKcal: null, avoid: new Set() });
      if (avoid || kcal || f) { draw(); render(); }
    };
    draw();
    dlg.showModal();
  }

  /* --------------------------------- Başlatma -------------------------------- */

  function applyBrand(s) {
    document.documentElement.style.setProperty('--brand', s.brandColor);
    document.title = `${s.tagline || 'Menü'} – ${s.name}`;
    $('meta[name="theme-color"]').content = s.brandColor;
    $('#brand').innerHTML = s.logo ? `<img src="${esc(s.logo)}" alt="${esc(s.name)}">` : esc(s.name);
    $('#heroTitle').textContent = s.tagline || 'MENÜ';

    const tel = s.phone ? `<a href="tel:${esc(s.phone.replace(/[^\d+]/g, ''))}">${esc(s.phone)}</a>` : '';
    const ig = s.instagram ? `<a href="https://instagram.com/${esc(s.instagram.replace(/^@/, ''))}" rel="noopener">@${esc(s.instagram.replace(/^@/, ''))}</a>` : '';
    const web = s.website ? `<a href="${esc(s.website)}" rel="noopener">${esc(s.website.replace(/^https?:\/\/(www\.)?/, ''))}</a>` : '';
    $('#footer').innerHTML = `<div class="footer-in">
      <div><strong>${esc(s.name)}</strong><br>${esc(s.address)}<br>${[tel, ig, web].filter(Boolean).join(' · ')}</div>
      <div class="legal">${s.calorieNote ? `<span>🔥 ${esc(s.calorieNote)}</span>` : ''}${s.allergenNote ? `<span>⚠ ${esc(s.allergenNote)}</span>` : ''}</div>
    </div>`;
  }

  function bind() {
    let t;
    $('#q').addEventListener('input', (e) => {
      clearTimeout(t);
      t = setTimeout(() => { state.q = norm(e.target.value.trim()); render(); }, 120);
    });
    $('#openFilters').addEventListener('click', openFilters);

    $('#quickChips').addEventListener('click', (e) => {
      const b = e.target.closest('.chip');
      if (!b) return;
      if (b.hasAttribute('data-gluten')) state.gluten = !state.gluten;
      else if (b.dataset.tag === 'all') { state.tag = 'all'; state.gluten = false; }
      else state.tag = state.tag === b.dataset.tag ? 'all' : b.dataset.tag;
      render();
    });

    $('#activeBar').addEventListener('click', (e) => {
      if (e.target.closest('[data-clear-adv]')) { state.avoid = new Set(); state.maxKcal = null; render(); }
    });

    $('#menu').addEventListener('click', (e) => {
      if (e.target.closest('#clearAll')) {
        Object.assign(state, { q: '', tag: 'all', gluten: false, maxKcal: null, avoid: new Set() });
        $('#q').value = '';
        return render();
      }
      const card = e.target.closest('.card');
      if (card) openDetail(card.dataset.id);
    });
    $('#menu').addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('card')) {
        e.preventDefault();
        openDetail(e.target.dataset.id);
      }
    });

    $('#catNavIn').addEventListener('click', (e) => {
      const a = e.target.closest('a.pill');
      if (!a) return;
      e.preventDefault();
      $(`#cat-${CSS.escape(a.dataset.cat)}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    const detail = $('#detail');
    detail.addEventListener('click', (e) => { if (e.target === detail || e.target.closest('[data-close]')) detail.close(); });
    detail.addEventListener('close', () => history.replaceState(null, '', location.pathname + location.search));

    const top = $('#toTop');
    addEventListener('scroll', () => { top.hidden = scrollY < 500; }, { passive: true });
    top.addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' }));
  }

  async function init() {
    let data;
    try {
      data = await QRM.loadMenu();
    } catch (e) {
      console.error(e);
      $('#menu').innerHTML = '<p class="state">Menü yüklenemedi. Lütfen sayfayı yenileyin.</p>';
      return;
    }
    state.data = data;
    byId = new Map(data.products.map((p) => [p.id, p]));
    algMap = new Map(data.allergens.map((a) => [a.id, a]));
    tagMap = new Map(data.tags.map((t) => [t.id, t]));
    applyBrand(data.settings);
    bind();
    if (!data.products.length) {
      $('#menu').innerHTML = '<p class="state">Menü henüz hazırlanmadı. Lütfen daha sonra tekrar deneyin.</p>';
      return;
    }
    render();

    const m = /^#p=(.+)$/.exec(location.hash);
    if (m) openDetail(decodeURIComponent(m[1]), { push: false });
  }

  init();
})();
