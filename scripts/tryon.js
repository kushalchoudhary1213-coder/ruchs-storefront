(() => {
  const layer = document.querySelector('#tryon-layer');
  if (!layer) return;

  const openButton = document.querySelector('[data-tryon-open]');
  const closeButton = layer.querySelector('.tryon-close');
  const fileInput = layer.querySelector('[data-tryon-file]');
  const fileLabel = layer.querySelector('[data-tryon-file-label]');
  const garmentImage = layer.querySelector('[data-tryon-garment]');
  const garmentNote = layer.querySelector('[data-tryon-garment-note]');
  const closeup = layer.querySelector('[data-tryon-closeup]');
  const colourPanel = layer.querySelector('[data-tryon-hue]');
  const colourName = layer.querySelector('[data-tryon-colour-name]');
  const result = layer.querySelector('[data-tryon-result]');
  const hint = layer.querySelector('[data-tryon-hint]');
  const generateButton = layer.querySelector('[data-tryon-generate]');
  const download = layer.querySelector('[data-tryon-download]');
  const status = layer.querySelector('[data-tryon-status]');
  const handle = document.querySelector('[data-product-handle]').dataset.productHandle;
  const garmentHue = colourPanel ? Number(colourPanel.dataset.tryonHue) : null;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  let person = null;
  let previewUrl = null;
  let resultUrl = null;
  let garmentUrl = null;
  let controller = null;
  let returnFocus = null;
  let available = false;
  let colour = null; // {key, label, hex}

  const setStatus = (message, error = false) => {
    status.textContent = message;
    status.classList.toggle('is-error', error);
  };

  const updateButton = () => {
    generateButton.disabled = !available || !person || !!controller;
  };

  const releaseUrls = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    previewUrl = resultUrl = null;
  };

  const galleryImages = () => [...document.querySelectorAll('.gallery-thumb')].map(thumb => ({
    src: thumb.dataset.galleryImage,
    index: Number(thumb.dataset.imageIndex || 0),
  })).filter(item => item.src);

  const activeImage = () => {
    const thumb = document.querySelector('.gallery-thumb.is-active');
    const source = thumb?.dataset.galleryImage || document.querySelector('#main-product-image').src;
    if (!colour) showGarment(source);
    return {src: source, index: Number(thumb?.dataset.imageIndex || 0)};
  };

  function showGarment(source) {
    garmentImage.src = source;
    if (closeup) closeup.style.setProperty('--closeup', `url("${source}")`);
  }

  // Shared with the home page colour demo (recolour.js).
  const recolour = (source, hex, maxSide) => window.RuchsRecolour.recolour(source, garmentHue, hex, maxSide);

  async function chooseColour(button) {
    layer.querySelectorAll('[data-tryon-colours] .swatch').forEach(swatch => {
      const on = swatch === button;
      swatch.classList.toggle('is-active', on);
      swatch.setAttribute('aria-pressed', String(on));
    });
    colour = button.dataset.colour ? {key: button.dataset.colour, label: button.dataset.label, hex: button.dataset.hex} : null;
    colourName.textContent = colour ? colour.label : 'As made';
    if (garmentUrl) { URL.revokeObjectURL(garmentUrl); garmentUrl = null; }
    const {src} = activeImage();
    if (!colour) { garmentNote.textContent = 'Current product photo'; showGarment(src); return; }
    garmentNote.textContent = `Colour preview: ${colour.label}`;
    try {
      const blob = await recolour(src, colour.hex, 900);
      if (!colour || colour.key !== button.dataset.colour) return;
      garmentUrl = URL.createObjectURL(blob);
      showGarment(garmentUrl);
    } catch {
      setStatus('Could not preview this colour. Please try another.', true);
    }
  }

  /* ---------- Result: before/after slider and a fabric loupe ---------- */
  function showResult(url) {
    const compare = document.createElement('div');
    compare.className = 'tryon-compare';
    compare.style.setProperty('--split', '100%');
    compare.innerHTML = `<img class="tryon-compare__after" alt="AI virtual try-on preview wearing this Ruchs piece">
      <div class="tryon-compare__before" aria-hidden="true"><img alt=""></div>
      <span class="tryon-compare__handle" aria-hidden="true"></span>
      <span class="tryon-loupe" aria-hidden="true"></span>
      <input class="tryon-compare__range" type="range" min="0" max="100" value="100" aria-label="Compare your photo with the preview">`;
    compare.querySelector('.tryon-compare__after').src = url;
    compare.querySelector('.tryon-compare__before img').src = previewUrl;
    const range = compare.querySelector('input');
    const setSplit = value => compare.style.setProperty('--split', `${value}%`);
    range.addEventListener('input', () => setSplit(range.value));
    result.replaceChildren(compare);
    hint.hidden = false;
    // Reveal: the preview wipes across your photo, then rests in the middle.
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { range.value = 50; setSplit(50); }
    else {
      const started = performance.now();
      const step = now => {
        const t = Math.min(1, (now - started) / 1400);
        const eased = 1 - Math.pow(1 - t, 4);
        const value = 100 - 50 * eased;
        range.value = value;
        setSplit(value);
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
    if (!finePointer) return;
    const loupe = compare.querySelector('.tryon-loupe');
    const after = compare.querySelector('.tryon-compare__after');
    loupe.style.backgroundImage = `url("${url}")`;
    compare.addEventListener('pointermove', event => {
      if (!after.naturalWidth) return;
      // The preview is letterboxed (object-fit: contain): magnify the picture, not the box.
      const box = compare.getBoundingClientRect();
      const fit = Math.min(box.width / after.naturalWidth, box.height / after.naturalHeight);
      const width = after.naturalWidth * fit;
      const height = after.naturalHeight * fit;
      const left = (box.width - width) / 2;
      const top = (box.height - height) / 2;
      const x = event.clientX - box.left;
      const y = event.clientY - box.top;
      const inside = x >= left && x <= left + width && y >= top && y <= top + height;
      compare.classList.toggle('is-inspecting', inside);
      if (!inside) return;
      const zoom = 2.6;
      loupe.style.transform = `translate(${x - 70}px, ${y - 70}px)`;
      loupe.style.backgroundSize = `${width * zoom}px ${height * zoom}px`;
      loupe.style.backgroundPosition = `${-((x - left) * zoom - 70)}px ${-((y - top) * zoom - 70)}px`;
    });
    compare.addEventListener('pointerleave', () => compare.classList.remove('is-inspecting'));
  }

  function open() {
    returnFocus = document.activeElement;
    activeImage();
    layer.hidden = false;
    document.body.classList.add('tryon-open');
    closeButton.focus();
    setStatus('Checking try-on availability…');
    fetch('/api/try-on/status', {cache: 'no-store'})
      .then(response => response.ok ? response.json() : Promise.reject(new Error('Try-on is unavailable right now.')))
      .then(data => {
        if (layer.hidden) return;
        available = !!data.available;
        setStatus(available ? 'Choose a photo to begin.' : (data.reason || 'Try-on is unavailable right now.'), !available);
        updateButton();
      })
      .catch(() => { available = false; setStatus('Try-on is unavailable right now.', true); updateButton(); });
  }

  function close() {
    controller?.abort();
    controller = null;
    releaseUrls();
    person = null;
    fileInput.value = '';
    fileLabel.textContent = 'Choose a photo';
    result.innerHTML = '<div class="tryon-placeholder"><span>VIRTUAL TRY-ON</span><p>Your look appears here.</p></div>';
    hint.hidden = true;
    download.hidden = true;
    layer.hidden = true;
    document.body.classList.remove('tryon-open');
    setStatus('');
    updateButton();
    returnFocus?.focus?.();
  }

  async function compactImage(file) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1536 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    let quality = .88;
    let blob;
    do {
      blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
      quality -= .12;
    } while (blob?.size > 2_800_000 && quality >= .48);
    if (!blob || blob.size > 2_800_000) throw new Error('Please choose a smaller photo.');
    return new File([blob], 'my-photo.jpg', {type: 'image/jpeg'});
  }

  async function selectPhoto() {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 15_000_000) {
      fileInput.value = '';
      setStatus('Choose a JPG, PNG or WebP photo smaller than 15 MB.', true);
      return;
    }
    setStatus('Preparing your photo…');
    try {
      person = await compactImage(file);
      releaseUrls();
      previewUrl = URL.createObjectURL(person);
      result.innerHTML = '';
      hint.hidden = true;
      const image = document.createElement('img');
      image.src = previewUrl;
      image.alt = 'Your selected photo';
      result.appendChild(image);
      fileLabel.textContent = file.name;
      download.hidden = true;
      setStatus(available ? 'Ready to create your look.' : 'Try-on is unavailable right now.', !available);
      updateButton();
    } catch {
      person = null;
      setStatus('Could not read this photo. Please choose another.', true);
      updateButton();
    }
  }

  async function generate() {
    if (!available || !person || controller) return;
    controller = new AbortController();
    updateButton();
    download.hidden = true;
    const chosen = activeImage();
    const body = new FormData();
    body.append('person', person);
    body.append('handle', handle);
    body.append('image_index', String(chosen.index));
    try {
      if (colour) {
        // The chosen photo first, then two more angles, all in the new colour.
        setStatus(`Preparing the ${colour.label.toLowerCase()} preview…`);
        const sources = [chosen.src, ...galleryImages().filter(item => item.src !== chosen.src).map(item => item.src)].slice(0, 3);
        const blobs = await Promise.all(sources.map(source => recolour(source, colour.hex, 1400)));
        body.append('colour', colour.key);
        blobs.forEach((blob, index) => body.append('garment', new File([blob], `garment-${index}.jpg`, {type: 'image/jpeg'})));
      }
      setStatus('Creating your look in fine detail. This usually takes a few moments…');
      const response = await fetch('/api/try-on', {method: 'POST', body, signal: controller.signal});
      if (!response.ok) {
        const problem = await response.json().catch(() => ({}));
        throw new Error(problem.error || 'Could not create your preview. Please try again.');
      }
      const imageBlob = await response.blob();
      if (!imageBlob.type.startsWith('image/')) throw new Error('The try-on service returned an invalid image.');
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      resultUrl = URL.createObjectURL(imageBlob);
      showResult(resultUrl);
      download.href = resultUrl;
      download.hidden = false;
      setStatus(colour ? `Your preview in ${colour.label.toLowerCase()} is ready.` : 'Your preview is ready.');
    } catch (error) {
      if (error.name !== 'AbortError') setStatus(error.message || 'Could not create your preview.', true);
    } finally {
      controller = null;
      updateButton();
    }
  }

  openButton.addEventListener('click', open);
  if (location.hash === '#try-on') requestAnimationFrame(open);
  layer.querySelectorAll('[data-tryon-close]').forEach(button => button.addEventListener('click', close));
  fileInput.addEventListener('change', selectPhoto);
  generateButton.addEventListener('click', generate);
  layer.querySelectorAll('[data-tryon-colours] .swatch').forEach(button => button.addEventListener('click', () => chooseColour(button)));
  document.querySelectorAll('[data-gallery-image]').forEach(button => button.addEventListener('click', () => {
    requestAnimationFrame(() => {
      const active = layer.querySelector('[data-tryon-colours] .swatch.is-active');
      if (colour && active) chooseColour(active);
      else activeImage();
    });
  }));
  document.addEventListener('keydown', event => {
    if (layer.hidden) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key === 'Tab') {
      const items = [...layer.querySelectorAll('button:not(:disabled), a:not([hidden]), input:not([hidden])')].filter(node => node.getClientRects().length);
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
})();
