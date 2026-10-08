// PrepNow landing page. The numbers come from data.js (scripts/site/landing-data.mjs), the week the app ships with.
(() => {
  const D = window.PREPNOW;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const kr = (n, dec = 2) => n.toLocaleString('da-DK', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  const int = (n) => Math.round(n).toLocaleString('da-DK');
  const STORE = { netto: 'Netto', rema: 'REMA 1000', lidl: 'Lidl', coop365: '365discount', foetex: 'Føtex', bilka: 'Bilka', superbrugsen: 'SuperBrugsen', kvickly: 'Kvickly' };

  /** Runs once when the element is well into view. */
  function onView(el, fn, margin = '0px 0px -15% 0px') {
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { io.disconnect(); fn(); }
    }, { rootMargin: margin });
    io.observe(el);
  }

  function countUp(el, to, ms = 1400) {
    if (reduce) { el.textContent = int(to); return; }
    const t0 = performance.now();
    const step = (t) => {
      const k = clamp((t - t0) / ms);
      el.textContent = int(to * ease(k));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ---------- Phone frames get an iPhone status bar ---------- */
  const STATUS = '<span>9:41</span><span><svg viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="1" fill="currentColor"/><rect x="5" y="5.5" width="3" height="6.5" rx="1" fill="currentColor"/><rect x="10" y="3" width="3" height="9" rx="1" fill="currentColor"/><rect x="15" y="0" width="3" height="12" rx="1" fill="currentColor"/></svg><svg viewBox="0 0 27 13"><rect x="0.5" y="0.5" width="23" height="12" rx="3.5" fill="none" stroke="currentColor" opacity=".45"/><rect x="2.5" y="2.5" width="17" height="8" rx="2" fill="currentColor"/><path d="M25 4.5v4a2 2 0 0 0 0-4z" fill="currentColor" opacity=".45"/></svg></span>';
  $$('.phone').forEach((p) => {
    const s = document.createElement('div');
    s.className = 'phone__status';
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = STATUS;
    p.append(s);
  });

  /* ---------- Nav: glass after the hero, light over light sections ---------- */
  const nav = $('[data-nav]');
  const nights = $$('.night');
  function navState() {
    const y = 36;
    const overNight = nights.some((s) => { const r = s.getBoundingClientRect(); return r.top <= y && r.bottom >= y; });
    nav.classList.toggle('is-scrolled', scrollY > 24);
    nav.classList.toggle('is-top', scrollY <= 24);
    nav.classList.toggle('is-day', !overNight);
  }
  addEventListener('scroll', navState, { passive: true });
  navState();

  /* ---------- Hero: the week's numbers count up; the floating pieces follow the pointer a little ---------- */
  if (D) {
    const facts = $$('[data-week-facts] [data-count]');
    // rounded down to 500 ("2.000+"): different products this week, true for the week (D.offers) and for the app's own count of what can be bought today
    const values = [Math.floor(D.offers / 500) * 500, D.dishCount, D.cheapest];
    facts.forEach((el, i) => { el.textContent = '0'; setTimeout(() => countUp(el, values[i], 1400), reduce ? 0 : 800); });
    $$('[data-store-count]').forEach((el) => { el.textContent = '0'; });
    onView($('[data-chains]'), () => $$('[data-store-count]').forEach((el) => countUp(el, D.perStore[el.dataset.storeCount] ?? 0, 1200)));
  }
  const stage = $('[data-parallax]');
  if (stage && !reduce && matchMedia('(pointer: fine)').matches) {
    const floats = $$('[data-depth]', stage);
    floats.forEach((f) => f.style.setProperty('--d', f.dataset.depth));
    let raf = 0;
    addEventListener('pointermove', (e) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const mx = (e.clientX / innerWidth - 0.5) * 18;
        const my = (e.clientY / innerHeight - 0.5) * 14;
        floats.forEach((f) => { f.style.setProperty('--mx', mx.toFixed(2)); f.style.setProperty('--my', my.toFixed(2)); });
      });
    }, { passive: true });
  }

  /* ---------- Prep-aften: each evening sends its boxes to their days, one after another, in an arc ---------- */
  const shelf = $('[data-shelf]');
  if (shelf) {
    const DAYS = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];
    // one person, week 41, as the app plans it: Sunday evening cooks Monday to Thursday, Thursday evening the weekend
    const EVE = [{ c: 'var(--lime)', at: 0 }, { c: '#a493ff', at: 4 }];
    const dinner = ['amber', 'amber', 'terracotta', 'terracotta', 'green', 'green', 'terracotta'];
    const boxes = [];
    for (let d = 0; d < 7; d++) boxes.push({ day: d, row: 0, hue: dinner[d], e: d < 4 ? 0 : 1 });
    for (let d = 1; d < 7; d++) boxes.push({ day: d, row: 1, hue: dinner[d - 1], e: d < 5 ? 0 : 1, ice: d === 4 });
    $('[data-shelf-days]', shelf).innerHTML = DAYS.map((d) => `<span>${d}</span>`).join('');
    const grid = $('[data-shelf-grid]', shelf);
    for (const b of boxes) {
      const el = document.createElement('div');
      el.className = 'slot';
      el.style.gridColumn = String(b.day + 1);
      el.style.gridRow = String(b.row + 1);
      el.style.setProperty('--c', EVE[b.e].c);
      el.innerHTML = `<img src="img/3d/box-${b.hue}.webp" alt="" width="86" height="66">${b.ice ? '<span class="slot__ice" title="Fryseren">❄</span>' : ''}<i></i>`;
      if (b.row === 1) el.querySelector('img').style.width = '78%';
      grid.append(el);
      b.el = el;
    }
    const land = () => {
      if (reduce || !Element.prototype.animate) { boxes.forEach((b) => b.el.classList.add('is-landed')); return; }
      const marks = $$('[data-mark] i', shelf).map((m) => m.getBoundingClientRect());
      let delay = 0;
      for (const [e] of EVE.entries()) {
        for (const b of boxes.filter((x) => x.e === e).sort((x, y) => x.day - y.day || x.row - y.row)) {
          const img = b.el.querySelector('img');
          const r = img.getBoundingClientRect();
          const m = marks[e];
          const dx = m.left + m.width / 2 - (r.left + r.width / 2);
          const dy = m.top + m.height / 2 - (r.top + r.height / 2);
          img.animate([
            { transform: `translate(${dx}px, ${dy}px) scale(.35)`, opacity: 0 },
            { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 90}px) scale(.95)`, opacity: 1, offset: 0.5 },
            { transform: 'none', opacity: 1 },
          ], { duration: 640, delay, easing: 'cubic-bezier(.3,0,.2,1)', fill: 'backwards' });
          setTimeout(() => b.el.classList.add('is-landed'), delay + 600);
          delay += 115;
        }
        delay += 320;
      }
    };
    onView(shelf, land, '0px 0px -25% 0px');
  }

  /* ---------- How it works: the phone follows the step you're reading ---------- */
  const layers = $$('.how__phone [data-layer]');
  const steps = $$('.step');
  function showStep(i) {
    steps.forEach((s) => s.classList.toggle('is-active', Number(s.dataset.step) === i));
    layers.forEach((l) => {
      const on = Number(l.dataset.layer) === i;
      l.classList.toggle('is-on', on);
      if (on) l.closest('.phone').dataset.tone = l.dataset.tone;
      if (l.tagName === 'VIDEO') {
        if (on && !reduce) { l.currentTime = 0; l.play().catch(() => {}); } else l.pause();
      }
    });
  }
  const stepIO = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) showStep(Number(e.target.dataset.step));
  }, { rootMargin: '-48% 0px -48% 0px' });
  steps.forEach((s) => stepIO.observe(s));
  showStep(0);

  /* ---------- One dish built from the flyers, as you scroll ---------- */
  const build = $('[data-build]');
  const dish = D?.dishes.find((d) => d.id === 'lib-8e6cffeba8df');
  if (build && dish) {
    const sticky = $('.build__sticky', build);
    const box = $('.build__box', build);
    const holder = $('[data-build-tags]', build);
    const lines = $('[data-receipt-lines]', build);
    const totalEl = $('[data-receipt-total]', build);
    const perEl = $('[data-receipt-per]', build);
    // the brand off, and written like the shopping list: a capital first letter only ("Fine ærter 300 g")
    const short = (n) => { const s = n.replace(/^(Rema 1000|Madværket|Freshona|Urtekram|Salling ØKO|Salling|Polpa|Coop|Änglamark)\s+/i, ''); return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(); };
    const tags = dish.ing.map((ing, i) => {
      const el = document.createElement('div');
      el.className = 'tag';
      el.dataset.store = ing.store;
      el.innerHTML = `<span class="tag__store">${STORE[ing.store] ?? ing.store}</span><span class="tag__name">${short(ing.name)}</span><span class="tag__price">${kr(ing.price).replace(',00', '')}<small>kr</small></span>`;
      holder.append(el);
      return { el, ing, i, from: [0, 0], rot: [-8, 6, -4, 9, -6][i % 5], landed: false };
    });
    // where each tag waits on the table, as a share of the scene, around the box
    const SPOTS_WIDE = [[0.6, 0.15], [0.88, 0.2], [0.92, 0.56], [0.82, 0.88], [0.62, 0.9]];
    const SPOTS_NARROW = [[0.34, 0.3], [0.66, 0.4], [0.34, 0.5], [0.66, 0.6], [0.42, 0.7]];
    let W = 0, H = 0, target = [0, 0];
    function measure() {
      const r = sticky.getBoundingClientRect();
      W = r.width; H = r.height;
      const b = box.getBoundingClientRect();
      target = [b.left - r.left + b.width / 2, b.top - r.top + b.height / 2];
      const spots = W < 860 ? SPOTS_NARROW : SPOTS_WIDE;
      tags.forEach((t) => {
        const s = spots[t.i % spots.length];
        t.w = t.el.offsetWidth; t.h = t.el.offsetHeight;
        // never past the screen's edge
        t.from = [clamp(s[0] * W, t.w / 2 + 16, W - t.w / 2 - 16), s[1] * H];
      });
    }
    let shown = -1;
    function receiptTo(n) {
      if (n === shown) return;
      shown = n;
      lines.innerHTML = '';
      let sum = 0;
      for (const t of tags.slice(0, n)) {
        sum += t.ing.price;
        const li = document.createElement('li');
        li.innerHTML = `<span>${short(t.ing.name)}</span><b>${kr(t.ing.price)}</b>`;
        lines.append(li);
      }
      totalEl.textContent = n ? `${kr(sum)} kr` : '–';
      // the price per portion only once every item is in, so it never shows a part-sum
      perEl.textContent = n === tags.length ? `ca. ${Math.round(sum / dish.portions)} kr` : '–';
    }
    function frame() {
      const r = build.getBoundingClientRect();
      const p = reduce ? 1 : clamp(-r.top / (r.height - innerHeight));
      build.style.setProperty('--p', p.toFixed(4));
      build.style.setProperty('--receipt', clamp(p / 0.06).toFixed(3));
      build.style.setProperty('--fill', ease(clamp((p - 0.1) / 0.62)).toFixed(4));
      build.style.setProperty('--macros', clamp((p - 0.74) / 0.12).toFixed(3));
      let landed = 0;
      for (const t of tags) {
        const start = 0.06 + t.i * 0.12;
        const k = clamp((p - start) / 0.17);
        const e = ease(k);
        // an arc: out towards the viewer, then down into the box
        const x = t.from[0] + (target[0] - t.from[0]) * e;
        const y = t.from[1] + (target[1] - t.from[1]) * e - Math.sin(Math.PI * k) * H * 0.08;
        const s = 1 + Math.sin(Math.PI * k) * 0.12 - e * 0.55;
        const rot = t.rot * (1 - e);
        t.el.style.transform = `translate(${x - t.w / 2}px, ${y - t.h / 2}px) rotate(${rot}deg) scale(${s})`;
        t.el.style.opacity = String(k >= 1 ? 0 : 1 - clamp((k - 0.78) / 0.22));
        if (k >= 0.92) landed++;
      }
      receiptTo(landed);
    }
    let ticking = false;
    const request = () => { if (!ticking) { ticking = true; requestAnimationFrame(() => { ticking = false; frame(); }); } };
    addEventListener('scroll', request, { passive: true });
    addEventListener('resize', () => { measure(); frame(); });
    // fonts change the tags' size, so measure again once they are in
    document.fonts?.ready.then(() => { measure(); frame(); });
    measure();
    frame();
  }

  /* ---------- Nutrition card: pick a dish, the rings fill ---------- */
  const tabs = $('[data-macro-tabs]');
  const MACRO_DISHES = ['lib-d2c8f902cdb6', 'lib-031b2cd3e362', 'lib-885592a1050f'];
  const GOAL = { p: 45, f: 10, kcal: 800 };
  if (tabs && D) {
    const list = MACRO_DISHES.map((id) => D.dishes.find((d) => d.id === id)).filter(Boolean);
    const img = $('[data-macro-img]');
    const meta = $('[data-macro-meta]');
    let current = -1;
    let seen = false;
    function select(i, focus) {
      if (i === current) return;
      current = i;
      const d = list[i];
      $$('button', tabs).forEach((b, j) => { b.setAttribute('aria-selected', String(j === i)); b.tabIndex = j === i ? 0 : -1; if (j === i && focus) b.focus(); });
      img.classList.add('is-swapping');
      setTimeout(() => { img.src = `img/dish/${d.id}.webp`; img.alt = d.name; img.classList.remove('is-swapping'); }, reduce ? 0 : 200);
      const vals = { p: d.p, f: d.f, kcal: d.kcal };
      for (const k of Object.keys(vals)) {
        const ring = $(`[data-ring="${k}"]`);
        const num = $(`[data-ring-val="${k}"]`);
        const apply = () => { ring.style.setProperty('--v', clamp(vals[k] / GOAL[k]).toFixed(3)); countUp(num, vals[k], 900); };
        if (seen) apply(); else ring._apply = apply;
      }
      meta.textContent = `${d.cost} kr pr. portion, ${d.active ?? d.minutes} min arbejde, ${d.minutes} min i alt`;
    }
    list.forEach((d, i) => {
      const b = document.createElement('button');
      b.role = 'tab';
      b.innerHTML = `<img src="img/dish/${d.id}.webp" alt="">${d.name.replace(/ (med|på) .*/, '')}<small>${d.cost} kr pr. portion, ${d.p} g protein</small>`;
      b.title = d.name;
      b.addEventListener('click', () => select(i));
      b.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') select((current + (e.key === 'ArrowRight' ? 1 : list.length - 1)) % list.length, true);
      });
      tabs.append(b);
    });
    select(0);
    onView($('[data-macro-panel]'), () => { seen = true; $$('[data-ring]').forEach((r) => r._apply?.()); });
  }

  /* ---------- Shopping list ticks itself off while it's on screen ---------- */
  const listEl = $('[data-list]');
  if (listEl) {
    const items = $$('.list__item', listEl);
    if (reduce) items.forEach((i) => i.classList.add('is-done'));
    else {
      let n = 0, timer = null;
      const tick = () => {
        if (n < items.length) items[n++].classList.add('is-done');
        else { items.forEach((i) => i.classList.remove('is-done')); n = 0; }
      };
      new IntersectionObserver(([e]) => {
        clearInterval(timer);
        if (e.isIntersecting) timer = setInterval(tick, 900);
      }, { threshold: 0.4 }).observe(listEl);
    }
  }

  /* ---------- Reminder card, and the family's plates fill ---------- */
  onView($('.people'), () => $('.people').classList.add('is-in'), '0px 0px -20% 0px');
  onView($('[data-notes]'), () => $('[data-notes]').classList.add('is-in'), '0px 0px -25% 0px');

  /* ---------- This week's dishes ---------- */
  if (D) {
    const count = $('[data-dish-count]');
    if (count) count.textContent = String(D.dishCount);
    const rows = [[], []];
    D.dishes.forEach((d, i) => rows[i % 2].push(d));
    $$('[data-marquee]').forEach((m) => {
      const row = rows[Number(m.dataset.marquee)];
      const card = (d) => `<article class="dish"><img src="img/dish/${d.id}.webp" alt="" loading="lazy" width="300" height="224"><div><b>${d.name}</b><span><em class="kr">${d.cost} kr pr. portion</em><em>${d.p} g protein</em></span></div></article>`;
      const html = row.map(card).join('');
      const track = $('.marquee__track', m);
      track.innerHTML = html + html;
      m.style.setProperty('--speed', `${row.length * 4.5}s`);
    });
  }

  /* ---------- Recorded app clips play only while they're on screen ---------- */
  const autoplay = $$('video[data-autoplay]');
  if (!reduce) {
    const vio = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { e.target.preload = 'auto'; e.target.play().catch(() => {}); } else e.target.pause();
      }
    }, { threshold: 0.35 });
    autoplay.forEach((v) => vio.observe(v));
  }

  /* ---------- Swipe rows on a phone: a dot per card, the one in view lit ---------- */
  $$('[data-swipe]').forEach((row) => {
    // in the order they are shown (Pro comes first on a phone)
    const cards = [...row.children].filter((c) => c.nodeType === 1 && getComputedStyle(c).display !== 'none').sort((a, b) => +getComputedStyle(a).order - +getComputedStyle(b).order);
    if (cards.length < 2) return;
    const dots = document.createElement('div');
    dots.className = 'dots';
    dots.setAttribute('aria-hidden', 'true');
    dots.innerHTML = cards.map(() => '<i></i>').join('');
    row.after(dots);
    const marks = [...dots.children];
    marks[0].classList.add('is-on');
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) marks.forEach((m, i) => m.classList.toggle('is-on', cards[i] === e.target));
    }, { root: row, threshold: 0.6 });
    cards.forEach((c) => io.observe(c));
  });

  /* ---------- On a computer: a code to scan with the phone (the link sends each phone to its store) ---------- */
  const qrEl = $('[data-qr]');
  if (qrEl && window.qrcode) {
    const q = window.qrcode(0, 'H');
    q.addData(qrEl.dataset.qr);
    q.make();
    const n = q.getModuleCount();
    const finder = (r, c) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
    const mid = n / 2, hole = n * 0.14;
    let dots = '';
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++) {
        if (!q.isDark(r, c) || finder(r, c) || (Math.abs(r + 0.5 - mid) < hole && Math.abs(c + 0.5 - mid) < hole)) continue;
        dots += `<rect x="${c + 0.08}" y="${r + 0.08}" width=".84" height=".84" rx=".3"/>`;
      }
    const eye = (x, y) => `<rect x="${x + 0.5}" y="${y + 0.5}" width="6" height="6" rx="1.8" fill="none" stroke="#2c1f8f" stroke-width="1"/><rect x="${x + 2}" y="${y + 2}" width="3" height="3" rx=".9" fill="#5d48db"/>`;
    qrEl.insertAdjacentHTML('afterbegin', `<svg viewBox="0 0 ${n} ${n}" aria-label="QR-kode til PrepNow" role="img"><g fill="#2c1f8f">${dots}</g>${eye(0, 0)}${eye(n - 7, 0)}${eye(0, n - 7)}</svg>`);
  }

  /* ---------- Pricing: monthly or yearly ---------- */
  const toggle = $('.toggle');
  if (toggle) {
    const pill = $('.toggle__pill', toggle);
    const buttons = $$('button', toggle);
    function set(period, animate) {
      buttons.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.period === period)));
      const on = buttons.find((b) => b.dataset.period === period);
      pill.style.width = `${on.offsetWidth}px`;
      pill.style.transform = `translateX(${on.offsetLeft}px)`;
      $$('[data-price-month]').forEach((el) => {
        const v = el.dataset[period === 'month' ? 'priceMonth' : 'priceYear'];
        if (el.textContent === v) return;
        if (animate && !reduce) {
          el.classList.remove('is-rolling');
          void el.offsetWidth;
          el.classList.add('is-rolling');
          setTimeout(() => { el.textContent = v; }, 200);
        } else el.textContent = v;
      });
      $$('[data-unit]').forEach((el) => { el.textContent = period === 'month' ? '/md' : '/år'; });
      $$('[data-sub-month]').forEach((el) => { el.textContent = el.dataset[period === 'month' ? 'subMonth' : 'subYear']; });
    }
    buttons.forEach((b) => b.addEventListener('click', () => set(b.dataset.period, true)));
    toggle.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const next = buttons.find((b) => b.getAttribute('aria-checked') !== 'true');
      set(next.dataset.period, true);
      next.focus();
    });
    document.fonts?.ready.then(() => set('year', false));
    set('year', false);
  }
})();
