/* Ruchs garment recolour, shared by the try-on dialog and the home page colour demo.
   Recolours the garment's own hue in a product photo and keeps its texture, folds
   and print. Pinks and reds also have to match the garment's lightness and form
   large connected areas, so lips and skin shadows keep their colour.
   window.RuchsRecolour.recolour(src, garmentHue, hex, maxSide) -> Promise<Blob> */
(() => {
  const hexToHsl = hex => {
    const value = parseInt(hex.slice(1), 16);
    return rgbToHsl((value >> 16) & 255, (value >> 8) & 255, value & 255);
  };
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min;
    const s = l > .5 ? d / (2 - max - min) : d / (max + min);
    const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s, l];
  }
  function hslToRgb(h, s, l) {
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [f(0) * 255, f(8) * 255, f(4) * 255];
  }
  const hueDistance = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
  const smooth = (edge0, edge1, x) => { const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0))); return t * t * (3 - 2 * t); };

  async function recolour(source, garmentHue, hex, maxSide) {
    const image = new Image();
    image.decoding = 'async';
    image.src = source;
    await image.decode();
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    const context = canvas.getContext('2d', {willReadFrequently: true});
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const frame = context.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = frame.data;
    // First pass: the garment's own lightness and saturation.
    let sumL = 0, sumS = 0, count = 0;
    for (let i = 0; i < pixels.length; i += 16) {
      const [h, s, l] = rgbToHsl(pixels[i], pixels[i + 1], pixels[i + 2]);
      if (s > .2 && hueDistance(h, garmentHue) < 14) { sumL += l; sumS += s; count++; }
    }
    const meanL = count ? sumL / count : .5;
    const meanS = count ? sumS / count : .5;
    const [targetH, targetS, targetL] = hexToHsl(hex);
    // Folds and weave survive: lightness keeps its variation around the new mean.
    const spread = targetL < meanL ? targetL / meanL : (1 - targetL) / (1 - meanL);
    const contrast = Math.min(1.15, Math.max(.45, spread));
    const saturation = targetS / Math.max(meanS, .2);
    // Pinks and reds sit next to lips and skin shadows in hue; for those, also
    // require the garment's own lightness so skin keeps its colour.
    const nearSkin = hueDistance(garmentHue, 15) < 45;
    const width = canvas.width;
    const height = canvas.height;
    const weights = new Float32Array(width * height);
    const sats = new Float32Array(width * height);
    const lights = new Float32Array(width * height);
    // Blues and purples never meet skin in hue: a wider, gentler window takes in
    // pale and sheer parts of the garment too.
    const [hueNear, hueFar, satLow, satHigh] = nearSkin ? [14, 26, .1, .22] : [20, 34, .035, .11];
    for (let p = 0, i = 0; i < pixels.length; p++, i += 4) {
      const [h, s, l] = rgbToHsl(pixels[i], pixels[i + 1], pixels[i + 2]);
      let weight = (1 - smooth(hueNear, hueFar, hueDistance(h, garmentHue))) * smooth(satLow, satHigh, s);
      if (nearSkin && weight > 0) weight *= 1 - smooth(.16, .28, Math.abs(l - meanL));
      weights[p] = weight;
      sats[p] = s;
      lights[p] = l;
    }
    // Keep only the garment: large connected areas. Small separate patches
    // (lips, a ribbon of shadow) are dropped.
    const cell = 6;
    const columns = Math.ceil(width / cell);
    const rows = Math.ceil(height / cell);
    const cellWeight = new Float32Array(columns * rows);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) cellWeight[((y / cell) | 0) * columns + ((x / cell) | 0)] += weights[y * width + x];
    for (let c = 0; c < cellWeight.length; c++) cellWeight[c] /= cell * cell;
    const labels = new Int32Array(columns * rows).fill(-1);
    const sizes = [];
    for (let start = 0; start < labels.length; start++) {
      if (labels[start] !== -1 || cellWeight[start] < .35) continue;
      const label = sizes.length;
      let size = 0;
      const stack = [start];
      labels[start] = label;
      while (stack.length) {
        const c = stack.pop();
        size++;
        const cx = c % columns;
        for (const n of [c - columns, c + columns, cx > 0 ? c - 1 : -1, cx < columns - 1 ? c + 1 : -1]) {
          if (n >= 0 && n < labels.length && labels[n] === -1 && cellWeight[n] >= .35) { labels[n] = label; stack.push(n); }
        }
      }
      sizes.push(size);
    }
    const largest = Math.max(0, ...sizes);
    const keep = new Uint8Array(columns * rows);
    // Only pinks and reds need the patch filter; for other hues every matching area is garment.
    labels.forEach((label, c) => { if (!nearSkin ? cellWeight[c] > .02 : label >= 0 && sizes[label] >= largest * .06) keep[c] = 1; });
    // Grow the kept area by one cell so garment edges are not cut off.
    const grown = keep.slice();
    keep.forEach((on, c) => {
      if (on) return;
      const cx = c % columns;
      if ([c - columns, c + columns, cx > 0 ? c - 1 : -1, cx < columns - 1 ? c + 1 : -1].some(n => n >= 0 && n < keep.length && keep[n])) grown[c] = cellWeight[c] > .02 ? 1 : 0;
    });
    for (let y = 0; y < height; y++) {
      const rowCell = ((y / cell) | 0) * columns;
      for (let x = 0; x < width; x++) {
        const p = y * width + x;
        const weight = weights[p];
        if (weight <= 0 || !grown[rowCell + ((x / cell) | 0)]) continue;
        const i = p * 4;
        const nl = Math.min(.97, Math.max(.02, targetL + (lights[p] - meanL) * contrast));
        const [r, g, b] = hslToRgb(targetH, Math.min(1, sats[p] * saturation), nl);
        pixels[i] += (r - pixels[i]) * weight;
        pixels[i + 1] += (g - pixels[i + 1]) * weight;
        pixels[i + 2] += (b - pixels[i + 2]) * weight;
      }
    }
    context.putImageData(frame, 0, 0);
    return new Promise((resolve, reject) => canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('recolour'))), 'image/jpeg', .9));
  }

  window.RuchsRecolour = {recolour};
})();
