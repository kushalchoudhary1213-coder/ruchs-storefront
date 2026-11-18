// Adapted from React Bits AnimatedContent and SpotlightCard for this static storefront.
(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const revealSelector = [
    '.intro-band .wrap', '.section-heading', '.category-card', '.collection-tile',
    '.story-section__image', '.story-section__copy', '.product-card',
    '.values-band .wrap > div', '.closing-story > div', '.page-intro',
    '.listing-intro', '.product-gallery', '.product-information', '.article-content'
  ].join(', ');

  if (!reducedMotion && 'IntersectionObserver' in window) {
    const targets = [...document.querySelectorAll(revealSelector)];
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('rb-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -5% 0px' });

    targets.forEach(element => {
      element.classList.add('rb-reveal');
      if (element.matches('.category-card, .collection-tile, .product-card, .values-band .wrap > div')) {
        const index = [...element.parentElement.children].indexOf(element);
        element.style.setProperty('--rb-delay', `${Math.min(index % 4, 3) * 65}ms`);
      }
      observer.observe(element);
    });
    document.documentElement.classList.add('rb-motion');
  }

  if (reducedMotion || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  document.querySelectorAll('.values-band .wrap > div').forEach(card => {
    card.classList.add('rb-spotlight');
    card.addEventListener('pointermove', event => {
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--rb-x', `${event.clientX - rect.left}px`);
      card.style.setProperty('--rb-y', `${event.clientY - rect.top}px`);
      card.classList.add('rb-lit');
    });
    card.addEventListener('pointerleave', () => card.classList.remove('rb-lit'));
  });
})();
