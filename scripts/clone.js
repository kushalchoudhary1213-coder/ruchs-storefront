/* Local cart behavior for the static storefront snapshot. */
(() => {
  const KEY = "ruchs-clone-cart";
  const money = amount => `₹ ${Number(amount).toLocaleString("en-IN")}`;
  const readCart = () => {
    try { return JSON.parse(localStorage.getItem(KEY) || "[]"); }
    catch { return []; }
  };
  const saveCart = cart => localStorage.setItem(KEY, JSON.stringify(cart));
  const productHandle = location.pathname.match(/^\/products\/([^/]+)/)?.[1];
  let catalog;

  async function products() {
    if (!catalog) catalog = fetch("/products.json").then(r => r.json()).then(d => d.products);
    return catalog;
  }

  function localImage(url) {
    if (!url) return "";
    const basename = new URL(url).pathname.split("/").pop();
    return `/cdn/shop/files/${basename}`;
  }

  async function addCurrentProduct() {
    const product = (await products()).find(p => p.handle === productHandle);
    if (!product) return;
    const form = document.querySelector('form[action*="/cart/add"]');
    const id = Number(form?.querySelector('[name="id"]')?.value || document.querySelector('[name="id"]')?.value);
    const variant = product.variants.find(v => v.id === id) || product.variants[0];
    const quantity = Math.max(1, Number(form?.querySelector('[name="quantity"]')?.value || 1));
    const cart = readCart();
    const line = cart.find(item => item.id === variant.id);
    if (line) line.quantity += quantity;
    else cart.push({id: variant.id, handle: product.handle, title: product.title, variant: variant.title,
      price: Number(variant.price), quantity, image: localImage(product.images[0]?.src)});
    saveCart(cart);
    renderCart();
  }

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[character]);
  }

  function renderCart() {
    let overlay = document.getElementById("clone-cart-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "clone-cart-overlay";
      document.body.appendChild(overlay);
    }
    const cart = readCart();
    const count = cart.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = cart.reduce((sum, item) => sum + item.quantity * item.price, 0);
    overlay.innerHTML = `<div class="clone-cart-shade" data-close-cart></div>
      <aside class="clone-cart-panel" role="dialog" aria-modal="true" aria-label="Cart">
        <header><h2>Cart <span>(${count})</span></h2><button type="button" aria-label="Close cart" data-close-cart>×</button></header>
        ${cart.length ? `<div class="clone-cart-lines">${cart.map(item => `<article class="clone-cart-line">
          <a href="/products/${escapeHTML(item.handle)}/"><img src="${escapeHTML(item.image)}" alt=""></a>
          <div><a href="/products/${escapeHTML(item.handle)}/">${escapeHTML(item.title)}</a>
          <p>${escapeHTML(item.variant)}</p><strong>${money(item.price)}</strong>
          <div class="clone-cart-quantity"><button type="button" data-cart-minus="${item.id}" aria-label="Decrease quantity">−</button>
          <span>${item.quantity}</span><button type="button" data-cart-plus="${item.id}" aria-label="Increase quantity">+</button>
          <button type="button" data-cart-remove="${item.id}" class="clone-cart-remove">Remove</button></div></div></article>`).join("")}</div>
          <footer><div><span>Subtotal</span><strong>${money(subtotal)}</strong></div><small>Taxes included. Shipping calculated at checkout.</small>
          <button type="button" class="clone-cart-checkout" data-checkout>CHECK OUT</button>
          <p class="clone-cart-note" hidden>Checkout requires the original Shopify store.</p></footer>` :
          `<div class="clone-cart-empty"><h3>Your cart is empty</h3><a href="/collections/all/">Continue shopping</a></div>`}
      </aside>`;
    overlay.classList.add("is-open");
    document.body.style.overflow = "hidden";
  }

  function closeCart() {
    document.getElementById("clone-cart-overlay")?.classList.remove("is-open");
    document.body.style.overflow = "";
  }

  document.addEventListener("click", event => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('[data-testid="cart-drawer-trigger"], a[href="/cart"]')) {
      event.preventDefault(); event.stopImmediatePropagation(); renderCart(); return;
    }
    if (target.closest('[id*="ProductSubmitButton"], product-form-component button[type="submit"]')) {
      event.preventDefault(); event.stopImmediatePropagation(); addCurrentProduct(); return;
    }
    if (target.closest("[data-close-cart]")) { event.preventDefault(); closeCart(); return; }
    const plus = target.closest("[data-cart-plus]");
    const minus = target.closest("[data-cart-minus]");
    const remove = target.closest("[data-cart-remove]");
    if (plus || minus || remove) {
      event.preventDefault();
      const id = Number((plus || minus || remove).getAttribute(plus ? "data-cart-plus" : minus ? "data-cart-minus" : "data-cart-remove"));
      const cart = readCart();
      const line = cart.find(item => item.id === id);
      if (line) line.quantity = remove ? 0 : line.quantity + (plus ? 1 : -1);
      saveCart(cart.filter(item => item.quantity > 0));
      renderCart(); return;
    }
    if (target.closest("[data-checkout]")) {
      event.preventDefault();
      document.querySelector(".clone-cart-note")?.removeAttribute("hidden");
    }
  }, true);
  document.addEventListener("keydown", event => { if (event.key === "Escape") closeCart(); });
})();
