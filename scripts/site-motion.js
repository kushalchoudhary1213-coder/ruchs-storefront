/* Ruchs site motion engine.
   Built on open-source GSAP (ScrollTrigger, SplitText) and Lenis. One engine for
   every page: page curtain, smooth scroll, split-text entrances, image reveals and
   parallax. The home page follows the reference film's motion (site-fx.js): films
   held still in their windows while panels slide over them, content that rises in,
   a frosted card on the hero, a coverflow and a category strip. Everything stands
   still for visitors who ask for reduced motion.

   One motion scale throughout:
   entrances  expo.out, 0.9 to 1.1s      wipes   expo.inOut, 1.2s
   hovers     power3, 0.5 to 0.6s        stagger 0.04 to 0.08s */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';
import * as fx from './site-fx.js';

gsap.registerPlugin(ScrollTrigger, SplitText);
gsap.ticker.lagSmoothing(0);

const html = document.documentElement;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const OVERLAYS = ['#mobile-menu', '#search-panel', '#cart-layer', '#tryon-layer', '#live-tryon-layer'];
// Browsers with cross-document View Transitions move between pages natively;
// the curtain and the photo zoom remain for the others.
const nativeTransitions = 'CSSViewTransitionRule' in window && !reduce;

function storage(key, value) {
  try {
    if (value === undefined) return sessionStorage.getItem(key);
    sessionStorage.setItem(key, value);
  } catch { /* private mode: treat every visit as new */ }
  return null;
}

/* ---------- Smooth scroll (Lenis) shared with the showcase ---------- */
function startLenis() {
  const panels = $$(OVERLAYS.join(','));
  const lenis = new Lenis({ lerp: .1, anchors: { offset: -80 }, stopInertiaOnNavigate: true, prevent: node => panels.some(panel => panel.contains(node)) });
  const sync = () => (panels.some(panel => !panel.hidden) ? lenis.stop() : lenis.start());
  const locks = new MutationObserver(sync);
  panels.forEach(panel => locks.observe(panel, { attributes: true, attributeFilter: ['hidden'] }));
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(time => lenis.raf(time * 1000));
  // Pins add height after load; keep Lenis's scroll limit in step.
  ScrollTrigger.addEventListener('refresh', () => lenis.resize());
  window.ruchsLenis = lenis;
  return lenis;
}

/* ---------- Preloader (first visit) and page curtain ---------- */
function curtainIn(first) {
  const curtain = document.querySelector('.a-curtain');
  if (!curtain) return Promise.resolve();
  storage('ruchs-seen', '1');
  const mark = curtain.querySelector('.a-curtain__inner img');
  const tl = gsap.timeline({ defaults: { ease: 'expo.inOut' } });
  if (first) {
    tl.from(mark, { scale: .7, opacity: 0, duration: .8, ease: 'expo.out' })
      .to(mark, { opacity: 0, y: -16, duration: .3, ease: 'power2.in' }, .9);
  } else {
    tl.to(mark, { opacity: 0, scale: .9, duration: .2, ease: 'power2.in' });
  }
  tl.to(curtain, { clipPath: 'inset(0 0 100% 0)', duration: .9 })
    .set(curtain, { visibility: 'hidden' });
  return new Promise(resolve => tl.eventCallback('onComplete', resolve));
}

// Arriving through a photo zoom: no curtain, the photo is the transition.
function liftNow(wait = 1) {
  storage('ruchs-seen', '1');
  const curtain = document.querySelector('.a-curtain');
  if (curtain) gsap.set(curtain, { visibility: 'hidden', clipPath: 'inset(0 0 100% 0)' });
  return new Promise(resolve => gsap.delayedCall(wait, resolve));
}

function curtainLinks() {
  const curtain = document.querySelector('.a-curtain');
  if (!curtain || nativeTransitions) return;
  document.addEventListener('click', event => {
    const link = event.target.closest?.('a[href]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (link.target && link.target !== '_self') return;
    if (link.hasAttribute('download') || link.closest('dialog, .cart-layer')) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname === '/account') return;
    if (url.pathname === location.pathname && url.search === location.search) return; // same page or anchor
    event.preventDefault();
    const mark = curtain.querySelector('.a-curtain__inner img');
    gsap.timeline()
      .set(curtain, { visibility: 'visible', clipPath: 'inset(100% 0 0 0)' })
      .set(mark, { opacity: 0, scale: .85, y: 0 })
      .to(curtain, { clipPath: 'inset(0% 0 0 0)', duration: .55, ease: 'expo.inOut' })
      .to(mark, { opacity: 1, scale: 1, duration: .3, ease: 'power3.out' }, '-=.2')
      .add(() => { location.href = url.href; });
  });
  addEventListener('pageshow', event => {
    if (!event.persisted) return;
    gsap.set(curtain, { visibility: 'hidden', clipPath: 'inset(0 0 100% 0)' });
  });
}

/* ---------- Split-text entrances ---------- */
function splitEntrances(introDelay) {
  // Page titles: letters rise out of word masks.
  $$('.page-intro h1, .listing-intro h1, .product-intro h1, .product-information h1, .not-found h1, .article-content > h1').forEach(title => {
    SplitText.create(title, {
      type: 'words,chars', mask: 'words', autoSplit: true,
      onSplit: self => gsap.from(self.chars, { yPercent: 110, rotate: 5, duration: 1.1, stagger: .022, ease: 'expo.out', delay: introDelay }),
    });
  });
  // Section headings: words rise from masks as they scroll in.
  $$('.section-heading h2, .sc-head h2, .sc-tryon h2, .lx-fav__head h2, .lx-strip__head h2, .lx-window__copy h2, .reviews__head h2, .article-content > h2, .listing-section h2, .size-guide h2, .footer-connect h2').forEach(heading => {
    SplitText.create(heading, {
      type: 'words', mask: 'words', autoSplit: true,
      onSplit: self => gsap.from(self.words, { yPercent: 110, duration: 1, stagger: .06, ease: 'expo.out', scrollTrigger: { trigger: heading, start: 'top 88%' } }),
    });
  });
  // Body copy: lines slide up behind line masks.
  $$('.page-intro > p, .article-content > p, .product-description p, .listing-intro p').forEach(paragraph => {
    SplitText.create(paragraph, {
      type: 'lines', mask: 'lines', autoSplit: true,
      onSplit: self => gsap.from(self.lines, { yPercent: 105, duration: .9, stagger: .06, ease: 'expo.out', scrollTrigger: { trigger: paragraph, start: 'top 90%' } }),
    });
  });
  // Small labels: a quiet fade up, whole.
  $$('.breadcrumbs, .lx-fav__head > p, .lx-fav__head .lx-pill').forEach(labelText => {
    gsap.from(labelText, { y: 8, opacity: 0, duration: .7, ease: 'expo.out', scrollTrigger: { trigger: labelText, start: 'top 94%' } });
  });
}

/* ---------- Image reveals ---------- */
function imageReveals(introDelay, arrived = false) {
  const reveal = (elements, from, options = {}) => elements.forEach((element, index) => {
    const tl = gsap.timeline({ scrollTrigger: options.immediate ? undefined : { trigger: element, start: 'top 90%' }, delay: options.immediate ? introDelay : 0 });
    tl.fromTo(element, { clipPath: typeof from === 'function' ? from(index) : from }, { clipPath: options.to || 'inset(0% 0% 0% 0%)', duration: 1.2, ease: 'expo.inOut' });
    const media = element.querySelector('img, video');
    if (media) tl.fromTo(media, { scale: 1.2 }, { scale: options.rest || 1, duration: 1.5, ease: 'expo.out' }, 0);
  });
  // Product photo: opens upward from the bottom edge.
  if (!arrived) reveal($$('.product-gallery__main'), 'inset(100% 0% 0% 0%)', { immediate: true });
  // Tiles, story, article and about photographs, the try-on photo: all open upward.
  reveal($$('.collection-tile, .category-card, .story-section__image, .about-shot'), 'inset(100% 0% 0% 0%)', { rest: 1.04 });
  reveal($$('.article-content img, .sc-tryon__visual'), 'inset(100% 0% 0% 0%)');
  $$('.sc-tryon__ways').forEach(group => gsap.from(group.children, { y: 18, opacity: 0, duration: .9, stagger: .06, ease: 'expo.out', scrollTrigger: { trigger: group, start: 'top 82%' } }));
  // Product grids: batches rise in.
  const cards = $$('.product-grid .product-card, .search-results .product-card');
  if (cards.length) {
    gsap.set(cards, { opacity: 0, y: 50 });
    ScrollTrigger.batch(cards, {
      start: 'top 94%',
      onEnter: batch => gsap.to(batch, { opacity: 1, y: 0, duration: 1, stagger: { each: .07, grid: 'auto' }, ease: 'expo.out', overwrite: 'auto' }),
    });
    // Sorting and filtering move cards around: re-measure, and never leave a visible card hidden.
    let settle;
    new MutationObserver(() => {
      clearTimeout(settle);
      settle = setTimeout(() => {
        ScrollTrigger.refresh();
        cards.filter(card => card.getBoundingClientRect().top < innerHeight).forEach(card => gsap.to(card, { opacity: 1, y: 0, duration: .6, overwrite: 'auto' }));
      }, 60);
    }).observe(cards[0].parentElement, { childList: true });
  }
  // Product details, reviews, form fields: rise in sequence.
  $$('.product-information, .reviews__list, .contact-form, .size-guide__body, .not-found-links, .footer-main').forEach(group => {
    gsap.from(group.children, { y: 24, opacity: 0, duration: .9, stagger: .05, ease: 'expo.out', scrollTrigger: { trigger: group, start: 'top 88%' } });
  });
  gsap.from('.product-gallery__thumbs > *', { x: -20, opacity: 0, duration: .8, stagger: .05, ease: 'expo.out', delay: introDelay + .3 });
  $$('.collection-chips').forEach(row => gsap.from(row.children, { y: 12, opacity: 0, duration: .7, stagger: .035, ease: 'expo.out', scrollTrigger: { trigger: row, start: 'top 92%' } }));
  gsap.from('.article-stat', { y: 40, opacity: 0, stagger: .1, duration: 1, ease: 'expo.out', scrollTrigger: { trigger: '.article-stats', start: 'top 85%' } });
}

/* ---------- Header entrance ---------- */
function headerIntro(introDelay) {
  gsap.from('.site-header .brand, .primary-nav a, .header-actions > *, .mobile-menu-button', { yPercent: -120, opacity: 0, duration: .9, stagger: .04, ease: 'expo.out', delay: introDelay, clearProps: 'transform,opacity' });
}

/* ---------- Parallax ---------- */
function parallax() {
  $$('.collection-tile img, .category-card img, .story-section__image img').forEach(image => {
    gsap.fromTo(image, { yPercent: -4 }, { yPercent: 4, ease: 'none', scrollTrigger: { trigger: image.parentElement, start: 'top bottom', end: 'bottom top', scrub: true } });
  });
  $$('.sc-category-nav a').forEach((link, index) => gsap.from(link, { y: 20, opacity: 0, duration: 1, delay: index * .06, ease: 'expo.out', scrollTrigger: { trigger: link.parentElement, start: 'top 90%' } }));
}

/* ---------- Rolling nav links ---------- */
function rollingLinks() {
  $$('.primary-nav a, .mobile-menu nav a').forEach(link => {
    const label = link.firstChild?.nodeType === 3 ? link.firstChild.textContent.trim() : link.textContent.trim();
    if (!label || link.querySelector('.a-roll')) return;
    link.setAttribute('aria-label', label);
    const rest = [...link.childNodes].filter(node => node.nodeType !== 3);
    link.textContent = '';
    const roll = document.createElement('span');
    roll.className = 'a-roll';
    roll.setAttribute('aria-hidden', 'true');
    roll.innerHTML = `<span>${label}</span><span>${label}</span>`;
    link.append(roll, ...rest);
  });
}

/* ---------- Product page: zoom lens on the main photo ---------- */
function zoomLens() {
  const main = document.querySelector('.product-gallery__main');
  const image = document.getElementById('main-product-image');
  if (!main || !image) return;
  const scale = gsap.quickTo(image, 'scale', { duration: .6, ease: 'power3' });
  main.addEventListener('pointermove', event => {
    if (event.target.closest('button')) return;
    const box = main.getBoundingClientRect();
    image.style.transformOrigin = `${((event.clientX - box.left) / box.width) * 100}% ${((event.clientY - box.top) / box.height) * 100}%`;
    scale(1.8);
  });
  main.addEventListener('pointerleave', () => scale(1));
}

/* ---------- Bag: the photo flies into the bag; hearts give a small burst ---------- */
function bagAndHearts() {
  const count = document.querySelector('[data-cart-count]');
  const bag = document.querySelector('.bag-button');
  let lastAdd = 0;
  document.addEventListener('click', event => {
    if (event.target.closest?.('[data-add-to-cart], [data-buy-bar-add]')) lastAdd = Date.now();
    const heart = event.target.closest?.('.wish-button, .save-product');
    if (heart) burst(heart);
  }, true);
  if (count && bag) {
    let before = count.textContent;
    new MutationObserver(() => {
      const now = count.textContent;
      if (Number(now) > Number(before) && Date.now() - lastAdd < 4000) fly();
      before = now;
    }).observe(count, { childList: true, characterData: true, subtree: true });
  }
  function fly() {
    const source = document.getElementById('main-product-image');
    if (!source) return;
    const from = source.getBoundingClientRect();
    const to = bag.getBoundingClientRect();
    const ghost = source.cloneNode();
    ghost.removeAttribute('id');
    ghost.className = 'a-fly';
    Object.assign(ghost.style, { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`, transform: 'none' });
    document.body.append(ghost);
    gsap.timeline({ onComplete: () => ghost.remove() })
      .to(ghost, { x: to.left + to.width / 2 - from.left - from.width / 2, y: to.top + to.height / 2 - from.top - from.height / 2, scale: .05, borderRadius: '50%', duration: .9, ease: 'expo.inOut' })
      .to(ghost, { opacity: 0, duration: .15 }, '-=.15')
      .fromTo(bag, { scale: 1 }, { scale: 1.25, duration: .18, yoyo: true, repeat: 1, ease: 'power2.out' });
  }
  function burst(button) {
    const box = button.getBoundingClientRect();
    gsap.fromTo(button, { scale: .8 }, { scale: 1, duration: .6, ease: 'back.out(3)' });
    for (let i = 0; i < 6; i += 1) {
      const spark = document.createElement('i');
      spark.className = 'a-spark';
      spark.style.left = `${box.left + box.width / 2}px`;
      spark.style.top = `${box.top + box.height / 2}px`;
      document.body.append(spark);
      const angle = (i / 6) * Math.PI * 2;
      gsap.to(spark, { x: Math.cos(angle) * 30, y: Math.sin(angle) * 30, scale: 0, duration: .6, ease: 'expo.out', onComplete: () => spark.remove() });
    }
  }
}

/* ---------- Start ---------- */
function start() {
  html.classList.add('a-engine');
  if (reduce) {
    fx.colourDemo();
    return;
  }
  const lenis = startLenis();
  lenis.stop();
  const viaTransition = html.classList.contains('a-vt');
  const arrived = fx.arrival() || viaTransition;
  const firstVisit = !arrived && !storage('ruchs-seen');
  const introDelay = viaTransition ? .3 : arrived ? .8 : firstVisit ? 1.2 : .45;
  if (fine) { zoomLens(); fx.macroPan(); }
  if (!viaTransition) headerIntro(introDelay);
  splitEntrances(introDelay);
  imageReveals(introDelay, arrived);
  parallax();
  rollingLinks();
  bagAndHearts();
  fx.heroIntro(introDelay);
  fx.stockFilms();
  fx.windows();
  fx.curatedGrid();
  fx.rise();
  fx.coverflow();
  fx.solidHeader();
  fx.colourDemo();
  fx.flipSort();
  fx.zoomThrough();
  fx.panels();
  curtainLinks();
  ScrollTrigger.sort();
  ScrollTrigger.refresh();
  const lifted = arrived ? liftNow(viaTransition ? .1 : 1) : curtainIn(firstVisit);
  lifted.then(() => lenis.start());
  document.fonts?.ready.then(() => ScrollTrigger.refresh());
  addEventListener('load', () => ScrollTrigger.refresh());
  // Sections added after the first measure (recently viewed) move everything below them.
  document.addEventListener('ruchs:layout', () => ScrollTrigger.refresh());
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
