import {
  AmbientLight, CanvasTexture, Color, DirectionalLight, DoubleSide, Group,
  Mesh, MeshPhysicalMaterial, OrthographicCamera, PlaneGeometry, Scene,
  SRGBColorSpace, WebGLRenderer
} from 'three';

// Parameterize a broad swatch: the warp runs vertically and the pleats open
// toward the free hem. Distances are in local model space.
function makeCloth() {
  const geometry = new PlaneGeometry(1, 1, 160, 104);
  const positions = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < positions.count; i++) {
    const u = uv.getX(i) * 2 - 1;
    const t = 1 - uv.getY(i);
    const phase = 8.5 * u + 0.8 * Math.sin(3.2 * u + 2.7 * t)
      + 1.7 * t + 1.05 * Math.sin(2.5 * t - 2.2 * u);
    const pleat = Math.sin(phase) + 0.22 * Math.sin(2 * phase + 0.25);
    const width = 1.16 + 0.66 * t - 0.24 * Math.sin(t * Math.PI);
    const x = width * u + 0.16 * Math.cos(phase) - 0.46 * Math.sin(4.2 * t);
    const y = 1.16 - 2.72 * t + 0.61 * u + 0.34 * Math.cos(2.5 * u + t)
      - 0.24 * t * Math.cos(phase);
    const gathers = Math.exp(-3 * (1 - t)) * Math.sin(16 * u - 3 * t + 2 * Math.sin(3 * u));
    const z = (0.34 + 0.22 * t + 0.15 * Math.sin(2.3 * u + t)) * pleat
      + 0.48 * Math.sin(Math.PI * (u + 0.55 * t)) - 0.45 * u * (1 - t) + 0.11 * gathers;
    positions.setXYZ(i, x, y, z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function makeWeave() {
  const surface = document.createElement('canvas');
  surface.width = surface.height = 1024;
  const ink = surface.getContext('2d');
  ink.fillStyle = '#7e304a';
  ink.fillRect(0, 0, 1024, 1024);
  for (let row = 0; row < 1024; row += 3) {
    ink.fillStyle = row % 9 === 0 ? '#fff3d91c' : '#3c152416';
    ink.fillRect(0, row, 1024, 1);
  }
  ink.fillStyle = '#5e20311b';
  for (let col = 0; col < 1024; col += 4) ink.fillRect(col, 0, 1, 1024);
  // Fine double selvedge gives the drape a legible edge as it turns.
  for (const inset of [8, 14]) {
    ink.strokeStyle = '#dfbd9f';
    ink.lineWidth = inset === 8 ? 3 : 1.25;
    ink.strokeRect(inset, inset, 1024 - 2 * inset, 1024 - 2 * inset);
  }
  const texture = new CanvasTexture(surface);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function mount(figure) {
  const frame = figure.querySelector('[data-textile-frame]');
  const turn = figure.querySelector('[data-textile-turn]');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  if (!frame || !turn || reduce.matches) return;
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  let renderer;
  try {
    renderer = new WebGLRenderer({canvas, antialias: true, alpha: true, powerPreference: 'low-power'});
  } catch {
    return; // The figure already contains a rendered still and description.
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
  const scene = new Scene();
  const camera = new OrthographicCamera(-3, 3, 2.2, -2.2, 0.1, 30);
  camera.position.set(0, 0, 8);
  const textile = new Group();
  scene.add(textile);
  const texture = makeWeave();
  texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 4);
  const material = new MeshPhysicalMaterial({
    map: texture, side: DoubleSide, roughness: 0.64, metalness: 0,
    sheen: 0.83, sheenRoughness: 0.55, sheenColor: new Color('#e4bbc5')
  });
  const mesh = new Mesh(makeCloth(), material);
  mesh.rotation.set(-0.15, -0.2, -0.19);
  mesh.position.y = 0.21;
  textile.add(mesh);
  scene.add(new AmbientLight(0xffede4, 0.5));
  for (const [color, intensity, x, y, z] of [
    [0xfff4ea, 3.3, -5, 4, 2.8], [0xffdfdf, 0.48, 3, 1, 3], [0xffe6c6, 2.4, 3, 4, -3]
  ]) {
    const light = new DirectionalLight(color, intensity);
    light.position.set(x, y, z);
    scene.add(light);
  }

  let target = 0;
  let frameId = 0;
  let lastTime = 0;
  let visible = true;
  let lost = false;
  const usable = () => visible && !document.hidden && !reduce.matches && !lost;
  const render = now => {
    frameId = 0;
    if (!usable()) return;
    const seconds = Math.min((now - lastTime) / 1000, 0.06);
    lastTime = now;
    textile.rotation.y += (target - textile.rotation.y) * (1 - Math.exp(-seconds * 11));
    renderer.render(scene, camera);
    frame.classList.add('textile-ready');
    turn.hidden = false;
    if (Math.abs(target - textile.rotation.y) > 0.001) frameId = requestAnimationFrame(render);
  };
  function draw() {
    if (usable() && !frameId) frameId = requestAnimationFrame(render);
  }
  function resize() {
    const {width, height} = frame.getBoundingClientRect();
    if (!width || !height) return;
    const aspect = width / height;
    const halfHeight = Math.max(2.24, 2.45 / aspect);
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.left = -halfHeight * aspect;
    camera.right = -camera.left;
    camera.updateProjectionMatrix();
    renderer.setSize(Math.round(width), Math.round(height), false);
    draw();
  }
  const resetView = () => {
    if (reduce.matches || lost) {
      frame.classList.remove('textile-ready');
      turn.hidden = true;
    } else draw();
  };
  let drag = null;
  frame.addEventListener('pointerdown', event => {
    if (!usable() || !event.isPrimary || event.button !== 0) return;
    drag = {id: event.pointerId, x: event.clientX, start: target};
    frame.setPointerCapture(event.pointerId);
  });
  frame.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId || !usable()) return;
    target = drag.start + (event.clientX - drag.x) * Math.PI * 1.6 / frame.clientWidth;
    draw();
  });
  frame.addEventListener('lostpointercapture', () => { drag = null; });
  turn.addEventListener('click', () => { target += Math.PI / 3; draw(); });
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    lost = true;
    resetView();
  });
  canvas.addEventListener('webglcontextrestored', () => { lost = false; resetView(); });
  reduce.addEventListener('change', resetView);
  document.addEventListener('visibilitychange', draw);
  new ResizeObserver(resize).observe(frame);
  new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    draw();
  }).observe(frame);
  frame.append(canvas);
  resize();
}

document.querySelectorAll('[data-textile-study]').forEach(mount);
