(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const film = document.querySelector('[data-campaign-video]');
  const filmToggle = document.querySelector('[data-campaign-toggle]');
  if (film && filmToggle) {
    let inView = false;
    let wantsPlayback = !reducedMotion;
    const syncLabel = () => {
      const playing = !film.paused;
      filmToggle.textContent = playing ? 'Pause film' : 'Play film';
      filmToggle.setAttribute('aria-label', playing ? 'Pause fashion film' : 'Play fashion film');
    };
    const updatePlayback = () => {
      if (!inView || !wantsPlayback || document.hidden) {
        film.pause();
        syncLabel();
        return;
      }
      film.play().then(syncLabel).catch(() => {
        wantsPlayback = false;
        syncLabel();
      });
    };
    filmToggle.addEventListener('click', () => {
      wantsPlayback = film.paused;
      updatePlayback();
    });
    film.addEventListener('pause', syncLabel);
    film.addEventListener('play', syncLabel);
    document.addEventListener('visibilitychange', updatePlayback);
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        inView = entries[0]?.isIntersecting || false;
        updatePlayback();
      }, { threshold: 0.15, rootMargin: '150px 0px' });
      observer.observe(film);
    } else {
      inView = true;
      updatePlayback();
    }
  }

  const cards = [...document.querySelectorAll('[data-lookbook-card]')];
  const count = document.querySelector('[data-lookbook-count]');
  const orbit = document.querySelector('[data-lookbook-orbit]');
  if (!cards.length || !count || !orbit) return;
  let active = 0;
  const render = () => {
    cards.forEach((card, index) => {
      const offset = (index - active + cards.length) % cards.length;
      card.dataset.position = offset === cards.length - 1 ? '-1' : String(offset);
      if (index === active) card.setAttribute('aria-current', 'true');
      else card.removeAttribute('aria-current');
    });
    count.textContent = `${String(active + 1).padStart(2, '0')} / ${String(cards.length).padStart(2, '0')}`;
  };
  document.querySelector('[data-lookbook-prev]')?.addEventListener('click', () => {
    active = (active - 1 + cards.length) % cards.length;
    render();
  });
  document.querySelector('[data-lookbook-next]')?.addEventListener('click', () => {
    active = (active + 1) % cards.length;
    render();
  });
  if (!reducedMotion && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    const viewport = orbit.parentElement;
    viewport.addEventListener('pointermove', event => {
      const rect = viewport.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - .5;
      const y = (event.clientY - rect.top) / rect.height - .5;
      orbit.style.setProperty('--lookbook-tilt-x', `${(-y * 5).toFixed(2)}deg`);
      orbit.style.setProperty('--lookbook-tilt-y', `${(x * 5).toFixed(2)}deg`);
    });
    viewport.addEventListener('pointerleave', () => {
      orbit.style.removeProperty('--lookbook-tilt-x');
      orbit.style.removeProperty('--lookbook-tilt-y');
    });
  }
  render();
})();
