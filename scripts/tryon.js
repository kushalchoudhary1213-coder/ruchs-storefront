(() => {
  const layer = document.querySelector('#tryon-layer');
  if (!layer) return;

  const openButton = document.querySelector('[data-tryon-open]');
  const closeButton = layer.querySelector('.tryon-close');
  const fileInput = layer.querySelector('[data-tryon-file]');
  const fileLabel = layer.querySelector('[data-tryon-file-label]');
  const garmentImage = layer.querySelector('[data-tryon-garment]');
  const result = layer.querySelector('[data-tryon-result]');
  const generateButton = layer.querySelector('[data-tryon-generate]');
  const download = layer.querySelector('[data-tryon-download]');
  const status = layer.querySelector('[data-tryon-status]');
  const handle = document.querySelector('[data-product-handle]').dataset.productHandle;
  let person = null;
  let previewUrl = null;
  let resultUrl = null;
  let controller = null;
  let returnFocus = null;
  let available = false;

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

  const activeImage = () => {
    const thumb = document.querySelector('.gallery-thumb.is-active');
    garmentImage.src = thumb?.dataset.galleryImage || document.querySelector('#main-product-image').src;
    return Number(thumb?.dataset.imageIndex || 0);
  };

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
    setStatus('Creating your look. This usually takes a few moments…');
    const body = new FormData();
    body.append('person', person);
    body.append('handle', handle);
    body.append('image_index', String(activeImage()));
    try {
      const response = await fetch('/api/try-on', {method: 'POST', body, signal: controller.signal});
      if (!response.ok) {
        const problem = await response.json().catch(() => ({}));
        throw new Error(problem.error || 'Could not create your preview. Please try again.');
      }
      const imageBlob = await response.blob();
      if (!imageBlob.type.startsWith('image/')) throw new Error('The try-on service returned an invalid image.');
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      resultUrl = URL.createObjectURL(imageBlob);
      const image = document.createElement('img');
      image.src = resultUrl;
      image.alt = 'AI virtual try-on preview wearing this Ruchs piece';
      result.replaceChildren(image);
      download.href = resultUrl;
      download.hidden = false;
      setStatus('Your preview is ready.');
    } catch (error) {
      if (error.name !== 'AbortError') setStatus(error.message || 'Could not create your preview.', true);
    } finally {
      controller = null;
      updateButton();
    }
  }

  openButton.addEventListener('click', open);
  layer.querySelectorAll('[data-tryon-close]').forEach(button => button.addEventListener('click', close));
  fileInput.addEventListener('change', selectPhoto);
  generateButton.addEventListener('click', generate);
  document.querySelectorAll('[data-gallery-image]').forEach(button => button.addEventListener('click', () => {
    requestAnimationFrame(activeImage);
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
