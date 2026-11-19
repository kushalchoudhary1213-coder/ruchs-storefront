import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger);
gsap.ticker.lagSmoothing(0);

function initShowcase(root) {
  const media = gsap.matchMedia();
  const motionAllowed = '(prefers-reduced-motion: no-preference)';
  const desktopMotion = motionAllowed + ' and (min-width: 960px) and (min-height: 600px) and (hover: hover) and (pointer: fine)';
  const header = document.querySelector('.site-header');
  const headerHeight = () => header?.getBoundingClientRect().height || 0;
  const rail = root.querySelector('[data-sc-rail]');
  const viewport = rail.querySelector('[data-sc-window]');
  const track = rail.querySelector('[data-sc-track]');
  const progress = rail.querySelector('[data-sc-progress]');
  const previous = rail.querySelector('[data-sc-prev]');
  const next = rail.querySelector('[data-sc-next]');
  let pin;
  let lenis;

  const travel = () => Math.max(0, track.scrollWidth - viewport.clientWidth);
  const currentX = () => pin ? pin.progress * travel() : viewport.scrollLeft;
  const cardStop = card => card.getBoundingClientRect().left - track.firstElementChild.getBoundingClientRect().left;

  function updateRail() {
    const end = travel();
    const offset = currentX();
    if (progress) {
      const visible = Math.min(1, (offset + viewport.clientWidth) / Math.max(1, track.scrollWidth));
      progress.style.transform = 'scaleX(' + visible + ')';
    }
    previous?.setAttribute('aria-disabled', String(offset < 2));
    next?.setAttribute('aria-disabled', String(offset >= end - 2));
  }

  function moveTo(offset, immediate = false) {
    const end = travel();
    if (!end) return;
    const position = gsap.utils.clamp(0, end, offset);
    if (pin && lenis) {
      const scroll = pin.start + (pin.end - pin.start) * position / end;
      lenis.scrollTo(scroll, { immediate });
    } else {
      viewport.scrollTo({ left: position, behavior: immediate || !matchMedia(motionAllowed).matches ? 'instant' : 'smooth' });
    }
  }

  function step(direction) {
    const current = currentX();
    const stops = [...track.querySelectorAll('.sc-look')].map(card =>
      Math.min(travel(), cardStop(card)));
    if (direction < 0) stops.reverse();
    const target = stops.find(x => direction * (x - current) > 3);
    moveTo(target ?? (direction > 0 ? travel() : 0));
  }

  previous?.addEventListener('click', () => step(-1));
  next?.addEventListener('click', () => step(1));
  for (const button of [previous, next]) if (button) button.hidden = false;
  viewport.addEventListener('scroll', updateRail, { passive: true });
  viewport.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const direction = event.key === 'ArrowLeft' ? -1 : 1;
    const activeCard = event.target.closest('.sc-look');
    if (!activeCard) return step(direction);
    const sibling = direction < 0 ? activeCard.previousElementSibling : activeCard.nextElementSibling;
    if (sibling) {
      sibling.querySelector('a')?.focus({ preventScroll: true });
      moveTo(cardStop(sibling), true);
    }
  });
  viewport.addEventListener('focusin', event => {
    if (!pin || !event.target.matches(':focus-visible')) return;
    const card = event.target.closest('.sc-look');
    if (!card) return;
    const visible = viewport.getBoundingClientRect();
    const bounds = card.getBoundingClientRect();
    if (bounds.left < visible.left - 2 || bounds.right > visible.right + 2) {
      moveTo(cardStop(card), true);
    }
  });
  const railObserver = new ResizeObserver(updateRail);
  railObserver.observe(viewport);
  updateRail();

  media.add(motionAllowed, () => {
    const title = root.querySelector('[data-sc-title]');
    const words = title.querySelectorAll('.sc-word > span');
    if (words.length && root.getBoundingClientRect().top > -innerHeight / 3) {
      title.classList.add('sc-title-entering');
      gsap.from(words, {
        yPercent: 96, duration: .7, stagger: .07, ease: 'power3.out', clearProps: 'transform',
        onComplete: () => title.classList.remove('sc-title-entering')
      });
    }
    return () => title.classList.remove('sc-title-entering');
  });

  media.add(desktopMotion, () => {
    const overlays = ['#mobile-menu', '#search-panel', '#cart-layer', '#tryon-layer', '#live-tryon-layer'];
    const panels = [...document.querySelectorAll(overlays.join(','))];
    lenis = new Lenis({
      lerp: .14,
      anchors: true,
      stopInertiaOnNavigate: true,
      prevent: node => panels.includes(node)
    });
    const syncOverlays = () => {
      if (panels.some(panel => !panel.hidden)) lenis.stop();
      else lenis.start();
    };
    const locks = new MutationObserver(syncOverlays);
    panels.forEach(panel => locks.observe(panel, { attributes: true, attributeFilter: ['hidden'] }));
    syncOverlays();
    const frame = seconds => lenis.raf(seconds * 1000);
    gsap.ticker.add(frame);
    lenis.on('scroll', ScrollTrigger.update);

    if (travel() > 4) {
      rail.classList.add('sc-rail-enhanced');
      viewport.scrollLeft = 0;
      const tween = gsap.to(track, {
        x: () => -travel(), ease: 'none',
        scrollTrigger: {
          trigger: rail, pin: rail.querySelector('[data-sc-pin]'),
          start: () => 'top top+=' + headerHeight(), end: () => '+=' + travel(),
          scrub: true, invalidateOnRefresh: true, anticipatePin: 1,
          onUpdate: updateRail, onRefresh: updateRail
        }
      });
      pin = tween.scrollTrigger;
    }

    const events = new AbortController();
    root.querySelectorAll('[data-sc-magnetic]').forEach(link => {
      const accent = link.querySelector('svg, span');
      if (!accent) return;
      const toX = gsap.quickTo(accent, 'x', { duration: .25, ease: 'power2.out' });
      const toY = gsap.quickTo(accent, 'y', { duration: .25, ease: 'power2.out' });
      link.addEventListener('pointermove', event => {
        const box = link.getBoundingClientRect();
        toX(8 * ((event.clientX - box.left) / box.width - .5));
        toY(8 * ((event.clientY - box.top) / box.height - .5));
      }, { signal: events.signal });
      link.addEventListener('pointerleave', () => { toX(0); toY(0); }, { signal: events.signal });
    });
    ScrollTrigger.refresh();
    return () => {
      events.abort();
      locks.disconnect();
      gsap.ticker.remove(frame);
      lenis.destroy();
      lenis = null;
      pin = null;
      rail.classList.remove('sc-rail-enhanced');
      updateRail();
    };
  });

  document.fonts?.ready.then(() => ScrollTrigger.refresh());
}

const showcase = document.querySelector('.showcase');
if (showcase) initShowcase(showcase);
