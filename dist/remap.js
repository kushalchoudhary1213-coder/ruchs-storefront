(() => {
  const CART_KEY = 'ruchs-clone-cart';
  const WISH_KEY = 'ruchs-remap-wishlist';
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch { return fallback; } };
  const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const money = value => `₹ ${Number(value).toLocaleString('en-IN', {maximumFractionDigits: 0})}`;
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  const imagePath = url => `/catalog/${new URL(url).pathname.split('/').pop()}.webp`;
  // Scope the shared photo to the one collection card that opens this product.
  // Normal link navigation still handles history, modifier keys and deep links.
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    window.addEventListener('pageswap', event => {
      if (!event.viewTransition || !event.activation) return;
      const destination = new URL(event.activation.entry.url);
      const clicked = document.activeElement?.closest('a');
      const card = clicked?.closest('article')?.querySelector('.product-card__image');
      const photo = clicked?.href === destination.href ? (card || clicked).querySelector('img') : null;
      if (photo && destination.pathname.startsWith('/products/')) {
        photo.style.viewTransitionName = 'look-photo';
        event.viewTransition.finished.finally(() => photo.style.removeProperty('view-transition-name'));
      }
    });
    window.addEventListener('pagereveal', event => {
      const photo = document.getElementById('main-product-image');
      if (!event.viewTransition || !photo) return;
      photo.style.viewTransitionName = 'look-photo';
      event.viewTransition.finished.finally(() => photo.style.removeProperty('view-transition-name'));
    });
  }
  const cartNote = 'Taxes included. Offers, shipping and payment are completed on the secure Ruchs checkout.';
  let productsPromise;
  let previousFocus;

  // Live Shopify stock and prices replace the build-time snapshot when the
  // Worker has a Storefront API token. Without one, the snapshot is used.
  function liveInventory() {
    return fetch('/api/inventory').then(response => response.ok ? response.json() : {live: false, variants: {}}).catch(() => ({live: false, variants: {}}));
  }
  function products() {
    return productsPromise ||= Promise.all([
      fetch('/products.json').then(response => response.json()),
      liveInventory(),
    ]).then(([data, stock]) => {
      if (!stock.live) return data.products;
      for (const product of data.products) {
        for (const variant of product.variants) {
          const live = stock.variants[String(variant.id)];
          if (live) Object.assign(variant, {available: live.available, price: live.price, compare_at_price: live.compareAtPrice});
          else variant.available = false;
        }
      }
      return data.products;
    });
  }
  async function refreshCartPrices() {
    const items = cart();
    if (!items.length) return;
    const variants = new Map((await products()).flatMap(product => product.variants.map(variant => [variant.id, variant])));
    let changed = false;
    for (const item of items) {
      const variant = variants.get(item.id);
      if (variant && Number(variant.price) !== item.price) { item.price = Number(variant.price); changed = true; }
    }
    if (changed) { write(CART_KEY, items); if (!$('#cart-layer').hidden) renderCart(); }
  }
  // Shiprocket's checkout script (the one ruchs.in uses) loads only when a
  // shopper chooses Buy now, so it never slows down browsing.
  let shiprocketReady;
  function loadShiprocket() {
    return shiprocketReady ||= new Promise((resolve, reject) => {
      if (window.HeadlessCheckout) return resolve();
      const styles = document.createElement('link');
      styles.rel = 'stylesheet';
      styles.href = 'https://fastrr-boost-ui.pickrr.com/assets/styles/sr-checkout.css';
      document.head.appendChild(styles);
      const script = document.createElement('script');
      script.src = 'https://fastrr-boost-ui.pickrr.com/assets/js/channels/shopify.js';
      script.async = true;
      script.onload = () => window.HeadlessCheckout ? resolve() : reject(new Error('shiprocket-missing'));
      script.onerror = () => reject(new Error('shiprocket-unavailable'));
      document.head.appendChild(script);
    }).catch(error => { shiprocketReady = null; throw error; });
  }
  async function startCheckout(button, event) {
    const note = $('.cart-note');
    const items = cart();
    if (!items.length) return;
    const provider = button.dataset.checkout === 'shiprocket' ? 'shiprocket' : 'shopify';
    const buttons = $$('[data-checkout]');
    buttons.forEach(node => { node.disabled = true; });
    note.setAttribute('role', 'status');
    note.textContent = 'Opening secure checkout…';
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({provider, lines: items.map(item => ({id: item.id, quantity: item.quantity}))}),
      });
      const data = await response.json();
      if (!response.ok || !(data.url || data.token)) throw new Error(data.error || 'Checkout is unavailable right now. Please try again.');
      if (data.token) {
        try {
          await loadShiprocket();
          window.HeadlessCheckout.addToCart(event, data.token, {fallbackUrl: data.fallbackUrl});
          note.textContent = cartNote;
          buttons.forEach(node => { node.disabled = false; });
        } catch {
          location.href = data.fallbackUrl;
        }
        return;
      }
      location.href = data.url;
    } catch (error) {
      note.textContent = error.message || 'Checkout is unavailable right now. Please try again.';
      buttons.forEach(node => { node.disabled = false; });
    }
  }

  function cart() { return read(CART_KEY, []); }
  function wishlist() { return read(WISH_KEY, []); }
  function updateCartCount() {
    const count = cart().reduce((sum, item) => sum + item.quantity, 0);
    $$('[data-cart-count]').forEach(node => { node.textContent = count; node.hidden = !count; });
    $('[data-cart-heading-count]').textContent = `(${count})`;
  }

  function openCart() {
    previousFocus = document.activeElement;
    renderCart();
    $('#cart-layer').hidden = false;
    document.body.style.overflow = 'hidden';
    $('#cart-layer [data-cart-close]').focus();
  }
  function closeCart() {
    $('#cart-layer').hidden = true;
    document.body.style.overflow = '';
    previousFocus?.focus?.();
  }
  function closeMenu(restoreFocus = true) {
    const menu = $('#mobile-menu');
    if (menu.hidden) return;
    menu.hidden = true;
    const opener = $('[data-menu-open]');
    opener.setAttribute('aria-expanded', 'false');
    if (restoreFocus) opener.focus();
  }
  function renderCart() {
    const items = cart();
    updateCartCount();
    const lines = $('[data-cart-lines]');
    const foot = $('[data-cart-footer]');
    if (!items.length) {
      lines.innerHTML = '<div class="cart-empty"><h3>Your bag is empty</h3><p>Find a piece that feels like you.</p><a class="button button-dark" href="/collections/all/">Explore the collection</a></div>';
      foot.innerHTML = '';
      return;
    }
    lines.innerHTML = items.map(item => `<article class="cart-line"><a href="/products/${escapeHTML(item.handle)}/"><img src="${escapeHTML(item.image)}" alt="${escapeHTML(item.title)}"></a><div><h3><a href="/products/${escapeHTML(item.handle)}/">${escapeHTML(item.title)}</a></h3><p>${escapeHTML(item.variant)}</p><strong>${money(item.price)}</strong><div class="cart-line__qty"><button type="button" data-cart-minus="${item.id}" aria-label="Decrease ${escapeHTML(item.title)} quantity">−</button><span>${item.quantity}</span><button type="button" data-cart-plus="${item.id}" aria-label="Increase ${escapeHTML(item.title)} quantity">+</button><button type="button" class="cart-remove" data-cart-remove="${item.id}">Remove</button></div></div></article>`).join('');
    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    foot.innerHTML = `<div class="cart-subtotal"><span>Subtotal</span><strong>${money(subtotal)}</strong></div><div class="cart-checkout"><button type="button" class="button button-dark" data-checkout="shiprocket">Buy now <small>Shiprocket · UPI, cards &amp; COD</small></button><button type="button" class="button button-outline" data-checkout="shopify">Shopify checkout <small>Razorpay · UPI &amp; cards</small></button></div><p class="cart-note">${cartNote}</p>`;
  }

  function toggleWishlist(handle) {
    const saved = wishlist();
    const next = saved.includes(handle) ? saved.filter(item => item !== handle) : [...saved, handle];
    write(WISH_KEY, next);
    syncWishlist();
    if ($('#wishlist-grid')) renderWishlist();
  }
  function syncWishlist() {
    const saved = wishlist();
    $$('[data-wish]').forEach(button => {
      const active = saved.includes(button.dataset.wish);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      button.setAttribute('aria-label', `${active ? 'Remove' : 'Save'} ${button.dataset.wish.replaceAll('-', ' ')} ${active ? 'from' : 'to'} wishlist`);
    });
  }
  async function renderWishlist() {
    const grid = $('#wishlist-grid');
    if (!grid) return;
    const saved = wishlist();
    const matches = (await products()).filter(product => saved.includes(product.handle));
    grid.innerHTML = matches.map(product => `<article class="product-card"><a class="product-card__image" href="/products/${escapeHTML(product.handle)}/"><img src="${imagePath(product.images[0].src)}" alt="${escapeHTML(product.title)}" loading="lazy"></a><div class="product-card__meta"><div><h3><a href="/products/${escapeHTML(product.handle)}/">${escapeHTML(product.title)}</a></h3><p>${money(product.variants[0].price)}</p></div><button class="icon-button wish-button" data-wish="${escapeHTML(product.handle)}" aria-pressed="true" aria-label="Remove from wishlist"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z"/></svg></button></div></article>`).join('');
    $('#wishlist-empty').hidden = !!matches.length;
    syncWishlist();
  }

  async function currentVariant() {
    const handle = $('[data-product-handle]')?.dataset.productHandle;
    if (!handle) return null;
    const product = (await products()).find(item => item.handle === handle);
    if (!product) return null;
    const selected = product.options.map(option => $(`input[name="option-${option.position}"]:checked`)?.value);
    const variant = product.variants.find(item => [item.option1, item.option2, item.option3].filter(Boolean).every((value, index) => value === selected[index]));
    return {product, variant};
  }
  async function updateVariant() {
    if (!$('[data-product-handle]')) return;
    const choice = await currentVariant();
    if (!choice) return;
    const button = $('[data-add-to-cart]');
    if (!choice.variant || !choice.variant.available) {
      $('#product-price').textContent = choice.variant ? money(choice.variant.price) : 'Unavailable';
      button.disabled = true;
      button.textContent = 'Unavailable';
    } else {
      $('#product-price').textContent = money(choice.variant.price);
      button.disabled = false;
      button.innerHTML = 'Add to bag <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 12h16m-6-6 6 6-6 6"/></svg>';
    }
  }
  async function addCurrentProduct() {
    const choice = await currentVariant();
    if (!choice?.variant?.available) return;
    const {product, variant} = choice;
    const amount = Math.max(1, Number($('#product-quantity')?.value || 1));
    const items = cart();
    const existing = items.find(item => item.id === variant.id);
    if (existing) existing.quantity += amount;
    else items.push({id: variant.id, handle: product.handle, title: product.title, variant: variant.title, price: Number(variant.price), quantity: amount, image: imagePath(product.images[0].src)});
    write(CART_KEY, items);
    openCart();
  }

  function filterSearch() {
    const grid = $('#search-grid');
    if (!grid) return;
    const query = new URLSearchParams(location.search).get('q')?.trim() || '';
    $('#search-query').value = query;
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    let count = 0;
    grid.querySelectorAll('.product-card').forEach(card => {
      const match = words.every(word => card.dataset.title.includes(word));
      card.hidden = !match;
      if (match) count++;
    });
    $('#search-count').textContent = query ? `${count} results for “${query}”` : `${count} pieces`;
    $('#search-empty').hidden = count > 0;
  }
  function sortListing() {
    const grid = $('#listing-grid');
    if (!grid) return;
    const mode = $('#sort-products').value;
    const cards = [...grid.querySelectorAll('.product-card')];
    cards.sort((a,b) => mode === 'price-low' ? Number(a.dataset.price) - Number(b.dataset.price) : mode === 'price-high' ? Number(b.dataset.price) - Number(a.dataset.price) : mode === 'name' ? a.dataset.title.localeCompare(b.dataset.title) : Number(a.dataset.order) - Number(b.dataset.order));
    cards.forEach(card => grid.appendChild(card));
  }

  document.addEventListener('click', event => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('[data-menu-open]')) { const menu = $('#mobile-menu'); menu.hidden = false; $('[data-menu-open]').setAttribute('aria-expanded','true'); menu.querySelector('[data-menu-close]').focus(); }
    if (target.closest('[data-menu-close]')) closeMenu();
    if (target.closest('#mobile-menu a')) closeMenu(false);
    if (target.closest('[data-search-open]')) { $('#search-panel').hidden = false; $('#site-search').focus(); }
    if (target.closest('[data-search-close]')) { $('#search-panel').hidden = true; $('[data-search-open]').focus(); }
    if (target.closest('[data-cart-open]')) openCart();
    if (target.closest('[data-cart-close]')) closeCart();
    const wish = target.closest('[data-wish]'); if (wish) toggleWishlist(wish.dataset.wish);
    const thumb = target.closest('[data-gallery-image]');
    if (thumb) { $('#main-product-image').src = thumb.dataset.galleryImage; $$('.gallery-thumb').forEach(button => button.classList.toggle('is-active', button === thumb)); }
    if (target.closest('[data-qty-plus]')) $('#product-quantity').value = Number($('#product-quantity').value || 1) + 1;
    if (target.closest('[data-qty-minus]')) $('#product-quantity').value = Math.max(1, Number($('#product-quantity').value || 1) - 1);
    if (target.closest('[data-add-to-cart]')) addCurrentProduct();
    const change = target.closest('[data-cart-plus],[data-cart-minus],[data-cart-remove]');
    if (change) {
      const id = Number(change.dataset.cartPlus || change.dataset.cartMinus || change.dataset.cartRemove);
      const items = cart(); const line = items.find(item => item.id === id);
      if (line) line.quantity = change.dataset.cartRemove ? 0 : line.quantity + (change.dataset.cartPlus ? 1 : -1);
      write(CART_KEY, items.filter(item => item.quantity > 0)); renderCart();
    }
    const checkoutButton = target.closest('[data-checkout]');
    if (checkoutButton && !checkoutButton.disabled) startCheckout(checkoutButton, event);
  });
  document.addEventListener('change', event => {
    if (event.target.matches('.variant-choice input')) updateVariant();
    if (event.target.matches('#sort-products')) sortListing();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') { if (!$('#cart-layer').hidden) closeCart(); closeMenu(); $('#search-panel').hidden = true; }
  });
  updateCartCount(); syncWishlist(); updateVariant(); renderWishlist(); filterSearch(); refreshCartPrices();
})();
