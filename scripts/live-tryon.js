(() => {
  const layer = document.querySelector('#live-tryon-layer');
  if (!layer) return;

  const openButton = document.querySelector('[data-live-open]');
  const closeButton = layer.querySelector('[data-live-close-button]');
  const startButton = layer.querySelector('[data-live-start]');
  const stopButton = layer.querySelector('[data-live-stop]');
  const status = layer.querySelector('[data-live-status]');
  const stage = layer.querySelector('[data-live-stage]');
  const camera = layer.querySelector('[data-live-camera]');
  const result = layer.querySelector('[data-live-result]');
  const garmentImage = layer.querySelector('[data-live-garment]');
  const timerLabel = layer.querySelector('[data-live-timer]');
  const product = document.querySelector('[data-product-handle]');
  const handle = product.dataset.productHandle;
  const prompt = product.dataset.livePrompt;
  let sdkPromise;
  let stream;
  let request;
  let timer;
  let secondsLeft = 0;
  let operation = 0;
  let connecting = false;
  let available = false;
  let returnFocus;

  function setStatus(message, error = false) {
    status.textContent = message;
    status.classList.toggle('is-error', error);
  }

  function activeImage() {
    const thumb = document.querySelector('.gallery-thumb.is-active');
    garmentImage.src = thumb?.dataset.galleryImage || document.querySelector('#main-product-image').src;
    return Number(thumb?.dataset.imageIndex || 0);
  }

  function loadSdk() {
    if (window.RuchsDecart) return Promise.resolve();
    if (!sdkPromise) {
      sdkPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = '/decart-live.js';
        script.onload = () => window.RuchsDecart ? resolve() : reject(new Error('Live try-on could not load.'));
        script.onerror = () => reject(new Error('Live try-on could not load.'));
        document.head.appendChild(script);
      }).catch(error => { sdkPromise = null; throw error; });
    }
    return sdkPromise;
  }

  function stop(message = 'Camera stopped.', error = false) {
    operation += 1;
    request?.abort();
    request = null;
    window.RuchsDecart?.stop();
    stream?.getTracks().forEach(track => track.stop());
    stream = null;
    camera.srcObject = null;
    result.srcObject = null;
    clearInterval(timer);
    timer = null;
    timerLabel.textContent = '';
    stage.classList.remove('has-camera', 'has-result');
    stopButton.hidden = true;
    startButton.hidden = false;
    startButton.disabled = connecting || !available;
    setStatus(message, error);
  }

  async function open() {
    returnFocus = document.activeElement;
    activeImage();
    layer.hidden = false;
    document.body.classList.add('tryon-open');
    closeButton.focus();
    setStatus('Checking live try-on availability…');
    startButton.disabled = true;
    try {
      const response = await fetch('/api/live/status', {cache: 'no-store'});
      if (!response.ok) throw new Error('Live try-on is unavailable right now.');
      const data = await response.json();
      if (layer.hidden) return;
      available = !!data.available;
      startButton.disabled = !available;
      setStatus(available ? 'Ready when you are.' : data.reason || 'Live try-on is unavailable right now.', !available);
    } catch {
      available = false;
      startButton.disabled = true;
      setStatus('Live try-on is unavailable right now.', true);
    }
  }

  function close() {
    stop('');
    layer.hidden = true;
    document.body.classList.remove('tryon-open');
    returnFocus?.focus?.();
  }

  async function start() {
    if (!available || connecting || stream) return;
    const current = ++operation;
    connecting = true;
    startButton.disabled = true;
    request = new AbortController();
    try {
      setStatus('Preparing this piece…');
      await loadSdk();
      const index = activeImage();
      const garmentResponse = await fetch(`/api/live/garment?handle=${encodeURIComponent(handle)}&image_index=${index}`, {signal: request.signal});
      if (!garmentResponse.ok) throw new Error('Could not load this garment for live try-on.');
      const blob = await garmentResponse.blob();
      const garment = new File([blob], 'ruchs-garment', {type: blob.type || 'image/jpeg'});
      if (current !== operation) return;

      setStatus('Allow camera access to begin.');
      const cameraStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {facingMode: 'user', width: {ideal: 1280}, height: {ideal: 720}, frameRate: {ideal: 30, max: 30}},
      });
      if (current !== operation) { cameraStream.getTracks().forEach(track => track.stop()); return; }
      stream = cameraStream;
      camera.srcObject = stream;
      camera.play().catch(() => {});
      stage.classList.add('has-camera');
      stream.getVideoTracks()[0]?.addEventListener('ended', () => { if (current === operation) stop('Camera disconnected.'); });

      setStatus('Starting your live fitting…');
      const tokenResponse = await fetch('/api/live/token', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({handle}),
        signal: request.signal,
      });
      const tokenData = await tokenResponse.json().catch(() => ({}));
      if (!tokenResponse.ok) throw new Error(tokenData.error || 'Could not start live try-on.');
      if (current !== operation) return;
      await window.RuchsDecart.start({
        token: tokenData.apiKey,
        stream,
        garment,
        prompt,
        onRemoteStream: remote => {
          if (current !== operation) return;
          result.srcObject = remote;
          result.play().catch(() => {});
          stage.classList.add('has-result');
          setStatus('You are wearing the preview live.');
        },
        onState: state => {
          if (current !== operation) return;
          if (state === 'reconnecting') setStatus('Reconnecting…');
          if (state === 'generating') setStatus('Applying this piece live…');
        },
        onError: error => { if (current === operation) stop(error.message || 'Live try-on ended.', true); },
      });
      if (current !== operation) { window.RuchsDecart.stop(); return; }
      stopButton.hidden = false;
      startButton.hidden = true;
      secondsLeft = Math.min(30, Number(tokenData.maxSessionSeconds) || 30);
      timerLabel.textContent = `${secondsLeft}s left`;
      timer = setInterval(() => {
        secondsLeft -= 1;
        timerLabel.textContent = `${Math.max(0, secondsLeft)}s left`;
        if (secondsLeft <= 0) stop('Your live preview has ended.');
      }, 1000);
    } catch (error) {
      if (current === operation && error.name !== 'AbortError') stop(error.message || 'Could not start live try-on.', true);
    } finally {
      connecting = false;
      request = null;
      if (!layer.hidden && !stream) startButton.disabled = !available;
    }
  }

  openButton.addEventListener('click', open);
  layer.querySelectorAll('[data-live-close]').forEach(button => button.addEventListener('click', close));
  startButton.addEventListener('click', start);
  stopButton.addEventListener('click', () => stop());
  document.addEventListener('keydown', event => {
    if (layer.hidden) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key === 'Tab') {
      const items = [...layer.querySelectorAll('button:not(:disabled)')].filter(node => node.getClientRects().length);
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && stream) stop('Camera stopped.'); });
  window.addEventListener('pagehide', () => stop(''));
})();
