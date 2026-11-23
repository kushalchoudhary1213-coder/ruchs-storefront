/* Ruchs add-ons: instant search, quick view, photo viewer, recently viewed,
   back to top. Plain script on every page; it reads /products.json (the same
   file the bag uses) and works with or without the motion engine. */
(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const imagePath = src => `/catalog/${String(src).split('?')[0].split('/').pop()}.webp`;
  // The 560px copy: enough for thumbnails and small cards.
  const smallPath = src => imagePath(src).replace(/\.webp$/, '.560.webp');
  const money = amount => `₹ ${Math.round(amount).toLocaleString('en-US')}`;
  const priceOf = product => {
    const amounts = product.variants.map(variant => Number(variant.price));
    const low = Math.min(...amounts);
    return Math.max(...amounts) > low ? `From ${money(low)}` : money(low);
  };
  const plain = html => String(html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  const firstSentence = product => (plain(product.body_html).match(/^.{20,220}?[.!?](\s|$)/) || [plain(product.body_html).slice(0, 180)])[0].trim();
  let catalog;
  const products = () => (catalog ||= fetch('/products.json').then(response => response.json()).then(data => data.products).catch(() => []));
  const store = {
    get: (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
    set: (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } },
  };

  /* ---------- Instant search: results as you type, keyboard first ---------- */
  function instantSearch() {
    const panel = $('#search-panel');
    const form = panel?.querySelector('form');
    const input = $('#site-search');
    if (!panel || !form || !input) return;
    const results = document.createElement('div');
    results.className = 'search-live';
    results.id = 'search-live';
    results.setAttribute('role', 'listbox');
    results.setAttribute('aria-label', 'Matching pieces');
    form.after(results);
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', 'search-live');
    input.setAttribute('aria-expanded', 'false');
    const hint = document.createElement('p');
    hint.className = 'search-hint';
    hint.innerHTML = 'Press <kbd>/</kbd> or <kbd>Ctrl</kbd> <kbd>K</kbd> to search from anywhere';
    results.after(hint);
    let active = -1;
    const suggestions = ['Dresses', 'Co-ord', 'Satin', 'Jumpsuit', 'Skirt'];

    function setActive(index) {
      const options = $$('[role="option"]', results);
      active = options.length ? (index + options.length) % options.length : -1;
      options.forEach((option, i) => option.setAttribute('aria-selected', String(i === active)));
      input.setAttribute('aria-activedescendant', active >= 0 ? options[active].id : '');
      options[active]?.scrollIntoView({block: 'nearest'});
    }
    async function render() {
      const query = input.value.trim().toLowerCase();
      active = -1;
      input.removeAttribute('aria-activedescendant');
      if (!query) {
        results.innerHTML = `<div class="search-live__chips">${suggestions.map(word => `<button type="button" class="collection-chip" data-search-word="${esc(word)}">${esc(word)}</button>`).join('')}</div>`;
        input.setAttribute('aria-expanded', 'false');
        return;
      }
      const words = query.split(/\s+/);
      const list = (await products()).map(product => {
        const title = product.title.toLowerCase();
        const hay = `${title} ${(product.product_type || '').toLowerCase()} ${(product.tags || []).join(' ').toLowerCase()} ${plain(product.body_html).toLowerCase()}`;
        if (!words.every(word => hay.includes(word))) return null;
        return {product, score: words.reduce((sum, word) => sum + (title.includes(word) ? 3 : 1), 0)};
      }).filter(Boolean).sort((a, b) => b.score - a.score);
      if (input.value.trim().toLowerCase() !== query) return;
      const shown = list.slice(0, 6);
      results.innerHTML = shown.length
        ? shown.map(({product}, i) => `<a class="search-live__item" role="option" id="search-option-${i}" aria-selected="false" href="/products/${esc(product.handle)}/">
            <img src="${esc(smallPath(product.images[0]?.src))}" alt="" width="56" height="72" loading="lazy">
            <span><strong>${esc(product.title)}</strong><small>${esc(product.product_type || 'Ruchs')}</small></span><em>${esc(priceOf(product))}</em></a>`).join('')
          + `<a class="search-live__all" href="/search/?q=${encodeURIComponent(input.value.trim())}">See all ${list.length} ${list.length === 1 ? 'piece' : 'pieces'}</a>`
        : `<p class="search-live__empty">No pieces match “${esc(input.value.trim())}”. Try a colour, a fabric or a kind of piece.</p>`;
      input.setAttribute('aria-expanded', String(shown.length > 0));
    }
    input.addEventListener('input', render);
    input.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown') { event.preventDefault(); setActive(active + 1); }
      if (event.key === 'ArrowUp') { event.preventDefault(); setActive(active - 1); }
      if (event.key === 'Enter' && active >= 0) { event.preventDefault(); $$('[role="option"]', results)[active]?.click(); }
    });
    results.addEventListener('click', event => {
      const word = event.target.closest('[data-search-word]');
      if (!word) return;
      input.value = word.dataset.searchWord;
      input.focus();
      render();
    });
    new MutationObserver(() => { if (!panel.hidden) { products(); render(); } }).observe(panel, {attributes: true, attributeFilter: ['hidden']});
    // "/" or Ctrl/Cmd+K opens search from anywhere, unless you are typing.
    document.addEventListener('keydown', event => {
      const typing = event.target.closest?.('input, textarea, select, [contenteditable="true"]');
      const shortcut = (event.key === '/' && !typing) || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k');
      if (!shortcut || !panel.hidden) return;
      event.preventDefault();
      $('[data-search-open]')?.click();
    });
  }

  /* ---------- Shared: a dialog that animates in (CSS @starting-style) ---------- */
  function makeDialog(className, label) {
    const dialog = document.createElement('dialog');
    dialog.className = className;
    dialog.setAttribute('aria-label', label);
    document.body.append(dialog);
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => document.documentElement.classList.remove('dialog-open'));
    return dialog;
  }
  const openDialog = dialog => { dialog.showModal(); document.documentElement.classList.add('dialog-open'); };

  /* ---------- Quick view on collection cards ---------- */
  function quickView() {
    const buttons = $$('[data-quick-view]');
    if (!buttons.length) return;
    const dialog = makeDialog('quick-view-dialog', 'Quick view');
    buttons.forEach(button => button.addEventListener('click', async () => {
      const product = (await products()).find(item => item.handle === button.dataset.quickView);
      if (!product) { location.href = `/products/${button.dataset.quickView}/`; return; }
      const sizeOption = (product.options || []).find(option => /size/i.test(option.name));
      const sizes = sizeOption ? sizeOption.values.map(value => {
        const open = product.variants.some(variant => variant[`option${sizeOption.position}`] === value && variant.available !== false);
        return `<li class="${open ? '' : 'is-out'}">${esc(value)}${open ? '' : '<span class="visually-hidden"> (sold out)</span>'}</li>`;
      }).join('') : '';
      const photos = product.images.slice(0, 6).map((image, i) => `<img src="${esc(imagePath(image.src))}" alt="${i ? '' : esc(product.title)}" loading="${i ? 'lazy' : 'eager'}">`).join('');
      dialog.innerHTML = `<div class="quick-view">
        <div class="quick-view__photos" tabindex="0" aria-label="Photos of the ${esc(product.title)}">${photos}</div>
        <div class="quick-view__copy">
          <button type="button" class="icon-button quick-view__close" aria-label="Close quick view">✕</button>
          <p class="quick-view__type">${esc(product.product_type || 'Ruchs')}</p>
          <h2>${esc(product.title)}</h2>
          <p class="quick-view__price">${esc(priceOf(product))}</p>
          <p class="quick-view__about">${esc(firstSentence(product))}</p>
          ${sizes ? `<p class="quick-view__label">${esc(sizeOption.name)}</p><ul class="quick-view__sizes">${sizes}</ul>` : ''}
          <div class="quick-view__actions">
            <a class="button button-dark" href="/products/${esc(product.handle)}/">Choose your size <span aria-hidden="true">→</span></a>
            <a class="button button-outline" href="/products/${esc(product.handle)}/#try-on">Try it on</a>
          </div>
        </div></div>`;
      dialog.querySelector('.quick-view__close').addEventListener('click', () => dialog.close());
      openDialog(dialog);
    }));
  }

  /* ---------- Product page: full-screen photo viewer ---------- */
  function photoViewer() {
    const main = $('#main-product-image');
    const thumbs = $$('.gallery-thumb[data-gallery-image]');
    if (!main || !thumbs.length) return;
    const sources = thumbs.map(thumb => thumb.dataset.galleryImage);
    const title = $('.product-information h1')?.textContent.trim() || 'this piece';
    const dialog = makeDialog('viewer-dialog', `Photos of the ${title}`);
    dialog.innerHTML = `<div class="viewer">
      <div class="viewer__track" tabindex="0">${sources.map((src, i) => `<figure class="viewer__slide"><img src="${esc(src)}" alt="${esc(title)}, photo ${i + 1} of ${sources.length}" loading="lazy"></figure>`).join('')}</div>
      <p class="viewer__count" aria-live="polite"></p>
      <button type="button" class="viewer__nav viewer__nav--prev" aria-label="Previous photo">‹</button>
      <button type="button" class="viewer__nav viewer__nav--next" aria-label="Next photo">›</button>
      <button type="button" class="viewer__close" aria-label="Close photos">✕</button></div>`;
    const track = dialog.querySelector('.viewer__track');
    const count = dialog.querySelector('.viewer__count');
    const slides = $$('.viewer__slide', dialog);
    const current = () => Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
    const go = index => {
      const target = Math.max(0, Math.min(sources.length - 1, index));
      track.scrollTo({left: target * track.clientWidth, behavior: reduce ? 'auto' : 'smooth'});
      count.textContent = `${target + 1} / ${sources.length}`;
    };
    track.addEventListener('scroll', () => { count.textContent = `${current() + 1} / ${sources.length}`; }, {passive: true});
    dialog.querySelector('.viewer__nav--prev').addEventListener('click', () => go(current() - 1));
    dialog.querySelector('.viewer__nav--next').addEventListener('click', () => go(current() + 1));
    dialog.querySelector('.viewer__close').addEventListener('click', () => close());
    dialog.addEventListener('keydown', event => {
      if (event.key === 'ArrowRight') { event.preventDefault(); go(current() + 1); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); go(current() - 1); }
    });
    // Same-document View Transition: the product photo grows into the viewer.
    const morph = update => {
      if (!document.startViewTransition || reduce) { update(); return; }
      const transition = document.startViewTransition(update);
      transition.ready.catch(() => {});
      transition.finished.catch(() => {});
      transition.updateCallbackDone.catch(() => {});
    };
    function open() {
      const start = Math.max(0, sources.indexOf($('.gallery-thumb.is-active')?.dataset.galleryImage));
      slides.forEach(slide => slide.querySelector('img').loading = 'eager');
      main.style.transform = '';
      main.style.viewTransitionName = 'viewer-photo';
      morph(() => {
        main.style.viewTransitionName = 'none';
        openDialog(dialog);
        track.scrollLeft = start * track.clientWidth;
        count.textContent = `${start + 1} / ${sources.length}`;
        slides[start].querySelector('img').style.viewTransitionName = 'viewer-photo';
      });
    }
    function close() {
      const index = current();
      morph(() => {
        slides.forEach(slide => { slide.querySelector('img').style.viewTransitionName = ''; });
        dialog.close();
        main.style.viewTransitionName = 'viewer-photo';
        const thumb = thumbs[index];
        if (thumb && !thumb.classList.contains('is-active')) thumb.click();
      });
      setTimeout(() => { main.style.viewTransitionName = ''; }, 900);
    }
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    main.addEventListener('click', open);
    main.setAttribute('role', 'button');
    main.setAttribute('tabindex', '0');
    main.setAttribute('aria-label', `Open the photos of the ${title} full screen`);
    main.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } });
  }

  /* ---------- Recently viewed ---------- */
  function recentlyViewed() {
    const key = 'ruchs-recent';
    const here = $('[data-product-handle]')?.dataset.productHandle;
    const seen = store.get(key, []).filter(handle => handle !== here);
    if (here) store.set(key, [here, ...seen].slice(0, 10));
    const anchor = here ? $('main') : $('.sc-new');
    if (!anchor || seen.length < (here ? 1 : 2)) return;
    products().then(list => {
      const pieces = seen.map(handle => list.find(product => product.handle === handle)).filter(Boolean).slice(0, 6);
      if (!pieces.length) return;
      const section = document.createElement('section');
      section.className = 'recent-section';
      section.setAttribute('aria-labelledby', 'recent-title');
      section.innerHTML = `<div class="recent-head"><h2 id="recent-title">Recently viewed</h2><button type="button" class="recent-clear">Clear</button></div>
        <div class="recent-rail">${pieces.map(product => `<a class="recent-card" href="/products/${esc(product.handle)}/"><img src="${esc(smallPath(product.images[0]?.src))}" alt="" loading="lazy"><strong>${esc(product.title)}</strong><span>${esc(priceOf(product))}</span></a>`).join('')}</div>`;
      section.querySelector('.recent-clear').addEventListener('click', () => { store.set(key, here ? [here] : []); section.remove(); });
      anchor.append(section);
      // The page grew: the motion engine re-measures its scroll positions.
      document.dispatchEvent(new CustomEvent('ruchs:layout'));
    });
  }

  /* ---------- Back to top, with a ring that fills as you scroll ---------- */
  function backToTop() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'to-top';
    button.setAttribute('aria-label', 'Back to top');
    button.innerHTML = '<span aria-hidden="true">↑</span>';
    document.body.append(button);
    const native = CSS.supports?.('animation-timeline: scroll()');
    const update = () => {
      const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
      button.classList.toggle('is-on', scrollY > innerHeight * .9);
      if (!native) button.style.setProperty('--f-progress', String(Math.min(1, scrollY / max)));
    };
    addEventListener('scroll', update, {passive: true});
    update();
    button.addEventListener('click', () => {
      if (window.ruchsLenis) window.ruchsLenis.scrollTo(0, {duration: 1.4});
      else scrollTo({top: 0, behavior: reduce ? 'auto' : 'smooth'});
      $('#main')?.focus?.({preventScroll: true});
    });
  }

  const start = () => { instantSearch(); quickView(); photoViewer(); recentlyViewed(); backToTop(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
