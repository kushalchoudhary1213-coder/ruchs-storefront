/* Ruchs film layer: card and product films, header, gallery fade, count-up.
   Entrances and scroll motion live in site-motion.js (GSAP); nothing here moves
   for visitors who ask for reduced motion. */
(() => {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  /* ---------- Header tucks away on scroll down ---------- */
  if (!reduce) {
    let last = scrollY;
    let ticking = false;
    addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = scrollY;
        const open = document.querySelector('#cart-layer:not([hidden]), #mobile-menu:not([hidden]), #search-panel:not([hidden])');
        document.documentElement.classList.toggle('m-header-hidden', !open && y > 240 && y > last + 4);
        if (y < last - 4 || y < 240) document.documentElement.classList.remove('m-header-hidden');
        last = y;
        ticking = false;
      });
    }, {passive: true});
    document.addEventListener('focusin', () => document.documentElement.classList.remove('m-header-hidden'));
  }

  /* ---------- Films: play only while visible ---------- */
  const films = new Set();
  function filmElement(base, poster, className) {
    const video = document.createElement('video');
    video.className = className;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'none';
    video.setAttribute('aria-hidden', 'true');
    if (poster) video.poster = poster;
    video.innerHTML = `<source src="${base}.webm" type="video/webm"><source src="${base}.mp4" type="video/mp4">`;
    return video;
  }

  // Product cards: the piece's film plays on hover or keyboard focus.
  if (finePointer && !reduce) {
    $$('.product-card[data-film]').forEach(card => {
      const link = card.querySelector('.product-card__image');
      let video;
      const start = () => {
        if (!video) {
          video = filmElement(card.dataset.film, null, 'product-card__film');
          link.appendChild(video);
        }
        video.play().then(() => video.classList.add('is-playing')).catch(() => {});
      };
      const stop = () => { if (!video) return; video.classList.remove('is-playing'); video.pause(); };
      card.addEventListener('pointerenter', start);
      card.addEventListener('pointerleave', stop);
      link.addEventListener('focus', start);
      link.addEventListener('blur', stop);
    });
  }

  // Product page: watch the film in place of the main photo.
  const filmToggle = document.querySelector('[data-gallery-film]');
  if (filmToggle) {
    const main = document.querySelector('.product-gallery__main');
    let video;
    filmToggle.addEventListener('click', () => {
      if (!video) {
        video = filmElement(filmToggle.dataset.galleryFilm, null, 'gallery-film');
        video.preload = 'auto';
        main.insertBefore(video, filmToggle);
      }
      const playing = filmToggle.getAttribute('aria-pressed') === 'true';
      filmToggle.setAttribute('aria-pressed', String(!playing));
      filmToggle.querySelector('[data-film-label]').textContent = playing ? 'Watch the film' : 'Pause the film';
      if (playing) { video.pause(); video.classList.remove('is-playing'); }
      else video.play().then(() => video.classList.add('is-playing')).catch(() => {});
    });
  }

  // Gallery: thumbnails cross-fade the main photo.
  const mainImage = document.getElementById('main-product-image');
  if (mainImage && !reduce) {
    document.addEventListener('click', event => {
      const thumb = event.target.closest?.('[data-gallery-image]');
      if (!thumb) return;
      mainImage.classList.add('m-swap');
      const next = new Image();
      next.src = thumb.dataset.galleryImage;
      next.decode().catch(() => {}).finally(() => requestAnimationFrame(() => mainImage.classList.remove('m-swap')));
    }, true);
  }

  /* ---------- Count-up figures ---------- */
  const figures = $$('.article-stat strong');
  if (figures.length && !reduce && 'IntersectionObserver' in window) {
    const format = new Intl.NumberFormat('en-IN');
    const counter = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      counter.unobserve(entry.target);
      const element = entry.target;
      const target = Number(element.textContent.replace(/[^\d]/g, ''));
      const started = performance.now();
      const tick = now => {
        const t = Math.min(1, (now - started) / 1400);
        element.textContent = format.format(Math.round(target * (1 - Math.pow(1 - t, 3))));
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }), {threshold: 0.6});
    figures.forEach(figure => counter.observe(figure));
  }

  // Pause everything that moves when the tab is hidden.
  document.addEventListener('visibilitychange', () => { if (document.hidden) films.forEach(video => video.pause()); });
})();
