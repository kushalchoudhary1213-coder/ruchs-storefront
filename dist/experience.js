(() => {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  for (const film of document.querySelectorAll('[data-campaign-video]')) {
    const section = film.closest('section');
    const toggle = section.querySelector('[data-campaign-toggle]');
    const title = section.querySelector('h2').textContent.trim().replace(/\s+/g, ' ');
    let inView = false;
    let choice = null;

    function label() {
      const action = film.paused ? 'Play film' : 'Pause film';
      toggle.textContent = action;
      toggle.setAttribute('aria-label', action + ' — ' + title);
    }
    function update() {
      const wantsPlayback = choice ?? (!reduceMotion.matches && !navigator.connection?.saveData);
      if (inView && !document.hidden && wantsPlayback) {
        film.play().catch(error => {
          if (error.name === 'NotAllowedError') choice = false;
          label();
        });
      } else {
        film.pause();
      }
    }
    toggle.hidden = false;
    label();
    toggle.addEventListener('click', () => {
      choice = film.paused;
      update();
    });
    film.addEventListener('play', label);
    film.addEventListener('pause', label);
    document.addEventListener('visibilitychange', update);
    reduceMotion.addEventListener('change', () => {
      choice = null;
      update();
    });
    new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting && entry.intersectionRatio >= 0.1;
      update();
    }, {threshold: [0, 0.1]}).observe(film);
  }
})();
