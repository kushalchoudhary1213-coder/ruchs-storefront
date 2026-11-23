/* Ruchs effects layer, on top of site-motion.js.
   GSAP plugins that ship in the gsap package (Flip). */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Flip } from 'gsap/Flip';

gsap.registerPlugin(ScrollTrigger, Flip);

const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const ZOOM_KEY = 'ruchs-zoom';
const session = {
  get: key => { try { return sessionStorage.getItem(key); } catch { return null; } },
  set: (key, value) => { try { sessionStorage.setItem(key, value); } catch { /* ignore */ } },
  drop: key => { try { sessionStorage.removeItem(key); } catch { /* ignore */ } },
};

/* ---------- Home header: clear over the film, solid once past it ---------- */
export function solidHeader() {
  const hero = document.querySelector('.sc-studio');
  if (!hero || document.documentElement.dataset.type !== 'home') return;
  ScrollTrigger.create({
    start: () => Math.max(1, hero.offsetHeight - 96), end: 'max',
    toggleClass: { targets: document.documentElement, className: 'f-solid' },
  });
}

/* ---------- Home colour demo: the try-on's recolour, on one piece ---------- */
export function colourDemo() {
  const demo = document.querySelector('[data-colour-demo]');
  if (!demo || !window.RuchsRecolour) return;
  const photo = demo.querySelector('[data-colour-photo]');
  const next = demo.querySelector('[data-colour-next]');
  const name = demo.querySelector('[data-demo-colour-name]');
  const swatches = [...demo.querySelectorAll('[data-demo-colours] .swatch')];
  const hue = Number(demo.dataset.hue);
  const original = photo.currentSrc || photo.src;
  let url = null;
  let ticket = 0;
  const show = source => {
    next.onload = () => {
      next.classList.add('is-on');
      setTimeout(() => { photo.src = source; next.classList.remove('is-on'); }, 820);
    };
    next.src = source;
  };
  swatches.forEach(button => button.addEventListener('click', async () => {
    swatches.forEach(item => { const on = item === button; item.classList.toggle('is-active', on); item.setAttribute('aria-pressed', String(on)); });
    name.textContent = button.dataset.label || 'As made';
    const mine = ++ticket;
    if (!button.dataset.colour || Number.isNaN(hue)) { show(original); return; }
    try {
      const blob = await window.RuchsRecolour.recolour(original, hue, button.dataset.hex, 1100);
      if (mine !== ticket) return;
      if (url) setTimeout(URL.revokeObjectURL.bind(URL, url), 2000);
      url = URL.createObjectURL(blob);
      show(url);
    } catch { /* keep the photo as it is */ }
  }));
}

/* ---------- Fabric close-ups follow the pointer ---------- */
export function macroPan() {
  $$('[data-macro]').forEach(macro => {
    macro.addEventListener('pointermove', event => {
      const box = macro.getBoundingClientRect();
      const x = 20 + ((event.clientX - box.left) / box.width) * 60;
      const y = 28 + ((event.clientY - box.top) / box.height) * 60;
      macro.style.backgroundPosition = `${x}% ${y}%`;
    });
    macro.addEventListener('pointerleave', () => { macro.style.backgroundPosition = ''; });
  });
}

/* ---------- Flip: cards glide to their new places when sorted ---------- */
export function flipSort() {
  document.addEventListener('change', event => {
    if (!event.target.matches?.('#sort-products')) return;
    const state = Flip.getState($$('.product-grid .product-card'));
    requestAnimationFrame(() => Flip.from(state, { duration: .8, ease: 'expo.inOut', stagger: .012, onComplete: () => ScrollTrigger.refresh() }));
  }, true);
}

/* ---------- Zoom through: the photo opens into the product page ---------- */
export function zoomThrough() {
  document.addEventListener('click', event => {
    const link = event.target.closest?.('a.product-card__image, a.lx-edit__photo, a.lx-flow__item.is-active');
    if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith('/products/')) return;
    const media = link.querySelector('img');
    if (!media) return;
    if ('CSSViewTransitionRule' in window) {
      document.querySelectorAll('[data-vt-photo]').forEach(node => { node.style.viewTransitionName = ''; node.removeAttribute('data-vt-photo'); });
      media.style.viewTransitionName = 'piece-photo';
      media.setAttribute('data-vt-photo', '');
      return;
    }
    event.preventDefault();
    const box = media.getBoundingClientRect();
    const back = document.createElement('div');
    back.className = 'a-zoom-back';
    const clone = document.createElement('img');
    clone.className = 'a-zoom-clone';
    clone.src = media.currentSrc || media.src;
    clone.alt = '';
    Object.assign(clone.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
    document.body.append(back, clone);
    session.set(ZOOM_KEY, clone.src);
    gsap.timeline({ onComplete: () => { location.href = url.href; } })
      .to(back, { opacity: 1, duration: .5, ease: 'power2.out' }, 0)
      .to(clone, { left: 0, top: 0, width: innerWidth, height: innerHeight, duration: .8, ease: 'expo.inOut' }, 0);
  }, true);
  addEventListener('pageshow', event => {
    if (!event.persisted) return;
    $$('.a-zoom-back, .a-zoom-clone').forEach(node => node.remove());
    $$('[data-vt-photo]').forEach(node => { node.style.viewTransitionName = ''; node.removeAttribute('data-vt-photo'); });
  });
}

/* Arriving from a zoom: the full-screen photo settles into the product photo. */
export function arrival() {
  const source = session.get(ZOOM_KEY);
  session.drop(ZOOM_KEY);
  const main = document.getElementById('main-product-image');
  if (!source || !main) return false;
  const clone = document.createElement('img');
  clone.className = 'a-zoom-clone';
  clone.src = source;
  clone.alt = '';
  Object.assign(clone.style, { left: '0px', top: '0px', width: `${innerWidth}px`, height: `${innerHeight}px` });
  document.body.append(clone);
  gsap.set(main, { opacity: 0 });
  requestAnimationFrame(() => {
    const box = main.getBoundingClientRect();
    gsap.timeline({ delay: .1, onComplete: () => clone.remove() })
      .to(clone, { left: box.left, top: box.top, width: box.width, height: box.height, duration: 1, ease: 'expo.inOut' })
      .to(main, { opacity: 1, duration: .3 }, '-=.2')
      .to(clone, { opacity: 0, duration: .3 }, '<');
  });
  return true;
}

/* ---------- Menu, search and bag panels animate open ---------- */
export function panels() {
  const watch = (selector, open) => {
    const panel = document.querySelector(selector);
    if (!panel) return;
    new MutationObserver(() => { if (!panel.hidden) open(panel); }).observe(panel, { attributes: true, attributeFilter: ['hidden'] });
  };
  watch('#mobile-menu', menu => {
    gsap.fromTo(menu, { clipPath: 'circle(0% at 24px 24px)' }, { clipPath: 'circle(160% at 24px 24px)', duration: .8, ease: 'expo.inOut' });
    gsap.fromTo(menu.querySelectorAll('nav a'), { x: -40, opacity: 0 }, { x: 0, opacity: 1, duration: .7, stagger: .04, delay: .25, ease: 'expo.out' });
  });
  watch('#search-panel', search => {
    gsap.fromTo(search, { yPercent: -100 }, { yPercent: 0, duration: .7, ease: 'expo.out' });
    gsap.fromTo(search.querySelectorAll('label, form > div'), { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: .6, stagger: .06, delay: .15, ease: 'expo.out' });
  });
  watch('#cart-layer', layer => {
    gsap.fromTo(layer.querySelector('.cart-drawer'), { xPercent: 100 }, { xPercent: 0, duration: .7, ease: 'expo.out' });
    gsap.fromTo(layer.querySelectorAll('.cart-drawer__body > *, .cart-drawer footer > *'), { x: 30, opacity: 0 }, { x: 0, opacity: 1, duration: .6, stagger: .05, delay: .2, ease: 'expo.out' });
  });
}

/* ---------- Films: licensed stock (Mixkit free licence) and on-page films ---------- */
const STOCK = '/showcase/stock/';
function stockVideo(name, className) {
  const video = document.createElement('video');
  video.className = className;
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = 'none';
  video.poster = `${STOCK}${name}.webp`;
  video.setAttribute('aria-hidden', 'true');
  video.innerHTML = `<source src="${STOCK}${name}.webm" type="video/webm"><source src="${STOCK}${name}.mp4" type="video/mp4">`;
  return video;
}

export function stockFilms() {
  // Page and collection headers: blush fabric held still behind the title.
  $$('.listing-intro, .page-intro').forEach(intro => {
    intro.prepend(stockVideo('blush-fabric', 'a-intro-film'));
    intro.classList.add('a-has-film');
    intro.querySelector('.a-intro-film').setAttribute('data-window-film', '');
    intro.setAttribute('data-window', '');
  });
}

/* =====================================================================
   Reference motion: films held still in their windows, content that rises
   in, a frosted card on the hero, a coverflow and a category strip.
   ===================================================================== */

/* ---------- Hero: the title rises, then the frosted card ---------- */
export function heroIntro(introDelay) {
  const title = document.querySelector('[data-sc-title]');
  if (!title || scrollY > innerHeight / 3) return;
  title.classList.add('sc-title-entering');
  gsap.from(title.querySelectorAll('.sc-word > span'), {
    yPercent: 110, rotate: 4, duration: 1.2, stagger: .12, delay: introDelay, ease: 'expo.out', clearProps: 'transform',
    onComplete: () => title.classList.remove('sc-title-entering'),
  });
  gsap.from('.sc-hero-kicker, .sc-hero-fact, .sc-hero-actions', { y: 24, opacity: 0, duration: 1, stagger: .08, delay: introDelay + .3, ease: 'expo.out', clearProps: 'transform,opacity' });
  gsap.from('[data-lx-glass]', { y: 48, opacity: 0, duration: 1.3, delay: introDelay + .6, ease: 'expo.out', clearProps: 'transform,opacity' });
}

/* ---------- Windows: a film held still while its section scrolls past ----------
   CSS fixes each window's film to the screen and clips it to its section, so the
   section before uncovers it and the next panel slides over it. Here the films
   play only while their window is on screen, and the window's words rise in. */
export function windows() {
  const sections = $$('[data-window]');
  if (!sections.length) return;
  // The visitor's own pause on a window film holds until they press play.
  $$('[data-window] [data-film-toggle]').forEach(toggle => {
    const film = toggle.closest('[data-window]').querySelector('[data-film]');
    if (!film) return;
    toggle.addEventListener('click', () => {
      if (film.paused) film.dataset.userPaused = '1';
      else delete film.dataset.userPaused;
    });
  });
  const watch = new IntersectionObserver(entries => entries.forEach(entry => {
    entry.target.querySelectorAll('[data-window-film]').forEach(video => {
      if (!entry.isIntersecting) video.pause();
      else if (!video.dataset.userPaused) video.play().catch(() => {});
    });
  }), { rootMargin: '10% 0px' });
  sections.forEach(section => {
    watch.observe(section);
    const copy = section.querySelector('[data-window-copy]');
    if (copy) gsap.from(copy.children, { y: 40, opacity: 0, duration: 1.2, stagger: .09, ease: 'expo.out', scrollTrigger: { trigger: section, start: 'top 55%' } });
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) $$('[data-window-film]').forEach(video => video.pause());
  });
}

/* ---------- Selected pieces: columns arrive at different speeds ---------- */
export function curatedGrid() {
  const grid = document.querySelector('[data-lx-grid]');
  if (!grid) return;
  const cards = [...grid.children];
  const drift = matchMedia('(max-width: 700px)').matches ? [0, 80] : [90, 20, 150, 50];
  cards.forEach((card, i) => {
    gsap.fromTo(card, { y: drift[i % drift.length] }, { y: 0, ease: 'none', scrollTrigger: { trigger: grid, start: 'top bottom', end: 'top 20%', scrub: .6 } });
    const photo = card.querySelector('.product-card__image');
    const image = photo?.querySelector('img');
    if (!photo) return;
    gsap.timeline({ scrollTrigger: { trigger: grid, start: 'top 88%' } })
      .fromTo(photo, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.3, ease: 'expo.inOut' }, i * .09)
      .fromTo(image, { scale: 1.2 }, { scale: 1, duration: 1.6, ease: 'expo.out', clearProps: 'transform' }, i * .09)
      .from(card.querySelector('.product-card__meta'), { y: 16, opacity: 0, duration: .8, ease: 'expo.out', clearProps: 'transform,opacity' }, .5 + i * .09);
  });
}

/* ---------- Rows that rise in: the red edit pieces and the category strip ---------- */
export function rise() {
  $$('[data-lx-rise]').forEach(row => {
    const tl = gsap.timeline({ scrollTrigger: { trigger: row, start: 'top 86%' } });
    [...row.children].forEach((item, i) => {
      const photo = item.querySelector('.lx-edit__photo') || item;
      const image = photo.querySelector('img');
      const words = item.querySelectorAll(':scope > h3, :scope > p, :scope > span');
      tl.fromTo(photo, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.3, ease: 'expo.inOut' }, i * .1)
        .fromTo(image, { scale: 1.22 }, { scale: 1, duration: 1.7, ease: 'expo.out', clearProps: 'transform' }, i * .1);
      if (words.length) tl.from(words, { y: 18, opacity: 0, duration: .8, stagger: .05, ease: 'expo.out', clearProps: 'transform,opacity' }, .55 + i * .1);
    });
  });
}

/* ---------- Coverflow: scrolling turns Our favourites ----------
   The centre piece is large and named; its neighbours shrink and fade with
   their distance from the centre. The section holds while it turns. */
export function coverflow() {
  const section = document.querySelector('[data-coverflow]');
  const items = section ? $$('[data-flow-item]', section) : [];
  if (items.length < 2) return;
  section.classList.add('is-live');
  const pin = section.querySelector('.lx-fav__pin');
  const flow = section.querySelector('[data-flow]');
  const name = section.querySelector('[data-flow-name]');
  const priceText = section.querySelector('[data-flow-price]');
  const link = section.querySelector('[data-flow-link]');
  const count = section.querySelector('[data-flow-count]');
  const caption = section.querySelector('.lx-flow__caption');
  const steps = items.length - 1;
  const total = String(items.length).padStart(2, '0');
  // Distance from the centre -> offset (in item widths), scale, opacity.
  const STOPS = [[0, 1, 1], [1.06, .52, 1], [1.74, .34, .92], [2.25, .24, 0]];
  const mix = (a, b, t) => a + (b - a) * t;
  const place = distance => {
    const away = Math.min(Math.abs(distance), 3);
    const stop = Math.min(Math.floor(away), 2);
    const t = away - stop;
    const [x0, s0, o0] = STOPS[stop];
    const [x1, s1, o1] = STOPS[stop + 1];
    return { x: Math.sign(distance) * mix(x0, x1, t), scale: mix(s0, s1, t), opacity: mix(o0, o1, t) };
  };
  gsap.set(items, { xPercent: -50, yPercent: -50 });
  let current = -1;
  // The item width is read once per refresh, never during the scrub.
  let width = items[0].offsetWidth;
  const layout = position => {
    items.forEach((item, i) => {
      const distance = i - position;
      const { x, scale, opacity } = place(distance);
      gsap.set(item, { x: x * width, scale, opacity, zIndex: 100 - Math.round(Math.abs(distance) * 10) });
      item.style.setProperty('--label', String(Math.max(0, 1 - Math.abs(Math.abs(distance) - 1) * 2.2)));
    });
    const active = Math.round(position);
    if (active === current) return;
    current = active;
    items.forEach((item, i) => {
      item.classList.toggle('is-active', i === active);
      item.tabIndex = i === active ? 0 : -1;
    });
    count.textContent = `${String(active + 1).padStart(2, '0')} / ${total}`;
    link.href = items[active].getAttribute('href');
    gsap.timeline()
      .to(caption, { y: -10, opacity: 0, duration: .16, ease: 'power2.in', overwrite: true })
      .add(() => { name.textContent = items[active].dataset.title; priceText.textContent = items[active].dataset.price; })
      .fromTo(caption, { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: .5, ease: 'expo.out' });
  };
  layout(0);
  const trigger = ScrollTrigger.create({
    trigger: pin, start: 'top top', end: () => `+=${steps * innerHeight * .45}`, scrub: .7, pin: true,
    invalidateOnRefresh: true, refreshPriority: -1,
    onUpdate: self => layout(self.progress * steps),
    onRefresh: self => { width = items[0].offsetWidth; layout(self.progress * steps); },
  });
  // The pieces grow into place as the coverflow arrives.
  gsap.from(flow, { scale: .82, y: 70, opacity: 0, duration: 1.4, ease: 'expo.out', scrollTrigger: { trigger: flow, start: 'top 88%' } });
  // A side piece, or the arrows, turn the coverflow by scrolling to that piece.
  const go = index => {
    const target = trigger.start + (Math.max(0, Math.min(steps, index)) / steps) * (trigger.end - trigger.start);
    if (window.ruchsLenis) window.ruchsLenis.scrollTo(target, { duration: 1.1 });
    else window.scrollTo({ top: target, behavior: 'smooth' });
  };
  items.forEach((item, i) => item.addEventListener('click', event => {
    if (i === current) return;
    event.preventDefault();
    // Lenis stops any scroll when a link is clicked; turn on the next frame.
    requestAnimationFrame(() => go(i));
  }));
  section.querySelector('[data-flow-prev]').addEventListener('click', () => go(current - 1));
  section.querySelector('[data-flow-next]').addEventListener('click', () => go(current + 1));
}
