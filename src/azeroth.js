// azeroth.js: the moving backdrop behind a Guildhall site (first made for willhsu.dev).
// start(canvas, { zones: ['darkshore', 'teldrassil'] }) plays only those zones; leave zones out for all three.
// Three procedural Azeroth zones rendered with three.js on a fixed canvas behind the page.
// Loaded lazily by the inline script next to <canvas class="backdrop"> in each page.
// Events: dispatches "scenechange" {name, n, of, accent}; listens for "scenestep" to move on.
// Query ?scene=N (1-based) or ?scene=darkshore picks a zone; the order and position persist for the tab.
//
// Every texture here is painted on a canvas at load (hand-painted look, no downloads):
// bark, flagstones, grass, leaf clusters, planks, rock, sand, clouds, banners, cobwebs.

import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.170.0/three.module.min.js';

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const sstep = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// ---------- noise (periodic, so textures tile) ----------
const hash2 = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
function vnoise2(x, y, p) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const sm = t => t * t * (3 - 2 * t);
  const tx = sm(x - xi), ty = sm(y - yi);
  const w = v => p ? ((v % p) + p) % p : v;
  const a = hash2(w(xi), w(yi)), b = hash2(w(xi + 1), w(yi)), c = hash2(w(xi), w(yi + 1)), d = hash2(w(xi + 1), w(yi + 1));
  return lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
}
// fbm over a tile: x,y in 0..1, p = cells across the tile at the first octave
function fbm(x, y, p, oct = 4) {
  let v = 0, amp = 0.5, f = p, sum = 0;
  for (let i = 0; i < oct; i++) { v += amp * vnoise2(x * f, y * f, f); sum += amp; amp *= 0.5; f *= 2; }
  return v / sum;
}
function vnoise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const h = (a, b, c) => { const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return s - Math.floor(s); };
  const sm = t => t * t * (3 - 2 * t);
  const tx = sm(x - xi), ty = sm(y - yi), tz = sm(z - zi);
  return lerp(
    lerp(lerp(h(xi, yi, zi), h(xi + 1, yi, zi), tx), lerp(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), tx), ty),
    lerp(lerp(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), tx), lerp(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), tx), ty), tz) - 0.5;
}

// ---------- canvas textures ----------
const texCache = new Map();
function canvasTex(key, w, h, draw, { repeat, srgb = true } = {}) {
  let t = texCache.get(key);
  if (!t) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    texCache.set(key, t);
  }
  if (repeat) { t = t.clone(); t.repeat.set(repeat[0], repeat[1]); t.needsUpdate = true; }
  return t;
}
// paint a per-pixel field: fn(u, v) -> [r, g, b] or [r, g, b, a] in 0..255
function pixels(g, w, h, fn) {
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = fn((x + 0.5) / w, (y + 0.5) / h), p = (y * w + x) * 4;
    img.data[p] = c[0]; img.data[p + 1] = c[1]; img.data[p + 2] = c[2]; img.data[p + 3] = c.length > 3 ? c[3] : 255;
  }
  g.putImageData(img, 0, 0);
}
const hex = n => [(n >> 16) & 255, (n >> 8) & 255, n & 255];
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const scale3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

const glow = () => canvasTex('glow', 64, 64, g => {
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.3, 'rgba(255,255,255,0.5)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
});
const disc = () => canvasTex('disc', 128, 128, g => {
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.88, 'rgba(255,255,255,1)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
});
// a soft shaft of light: fades at both ends and at the sides
const shaftTex = () => canvasTex('shaft', 64, 256, g => pixels(g, 64, 256, (u, v) => {
  const side = Math.pow(Math.sin(u * Math.PI), 1.6), len = Math.sin(v * Math.PI) * (0.4 + 0.6 * (1 - v));
  return [255, 255, 255, Math.round(255 * side * len)];
}));
// a leaf cluster: hundreds of small leaves, lit from above, on a transparent field
function clusterTex(key, hue, sat, lightLo, lightHi, count = 900, leaf = [5, 11, 3, 6]) {
  return canvasTex(key, 256, 256, g => {
    g.clearRect(0, 0, 256, 256);
    for (let i = 0; i < count; i++) {
      const a = rand(0, TAU), r = Math.sqrt(Math.random()) * 112;
      const x = 128 + Math.cos(a) * r, y = 128 + Math.sin(a) * r * 0.86;
      const top = 1 - y / 256;
      const l = lerp(lightLo, lightHi, clamp01(top * 0.8 + rand(-0.2, 0.2) + 0.1));
      g.fillStyle = `hsl(${hue + rand(-12, 12)}, ${sat}%, ${l}%)`;
      g.beginPath(); g.ellipse(x, y, rand(leaf[0], leaf[1]), rand(leaf[2], leaf[3]), rand(0, TAU), 0, TAU); g.fill();
    }
  });
}
// a tuft of grass blades
function tuftTex(key, hue, sat, l0, l1) {
  return canvasTex(key, 128, 128, g => {
    g.clearRect(0, 0, 128, 128);
    for (let i = 0; i < 16; i++) {
      const bx = rand(34, 94), tipx = bx + rand(-34, 34), tipy = rand(4, 50), w = rand(3, 6);
      g.fillStyle = `hsl(${hue + rand(-10, 10)}, ${sat}%, ${rand(l0, l1)}%)`;
      g.beginPath(); g.moveTo(bx - w, 128); g.quadraticCurveTo(bx + (tipx - bx) * 0.3, 80, tipx, tipy); g.quadraticCurveTo(bx + (tipx - bx) * 0.5, 84, bx + w, 128); g.fill();
    }
  });
}
// a fern: arching fronds of paired leaflets fanning out from the base
function fernTex(key, hue, sat, l0, l1) {
  return canvasTex(key, 256, 128, g => {
    g.clearRect(0, 0, 256, 128);
    for (let f = 0; f < 9; f++) {
      const a = lerp(-1.25, 1.25, f / 8) + rand(-0.1, 0.1), len = rand(80, 112) * (1 - Math.abs(a) * 0.22);
      g.strokeStyle = g.fillStyle = `hsl(${hue + rand(-8, 8)}, ${sat}%, ${rand(l0, l1)}%)`;
      let px = 128, py = 128, dir = a;
      const steps = 16, sl = len / steps;
      for (let s = 0; s < steps; s++) {
        dir += a * 0.05 + (a < 0 ? -0.02 : 0.02); // fronds droop outward
        const nx = px + Math.sin(dir) * sl, ny = py - Math.cos(dir) * sl;
        g.lineWidth = 1.6; g.beginPath(); g.moveTo(px, py); g.lineTo(nx, ny); g.stroke();
        const lw = 14 * (0.35 + 0.65 * Math.sin(Math.PI * (s + 1) / (steps + 1))) * (1 - s / steps * 0.5);
        for (const side of [-1, 1]) {
          const la = dir + side * 1.1;
          g.beginPath(); g.ellipse(nx + Math.sin(la) * lw * 0.5, ny - Math.cos(la) * lw * 0.5, lw * 0.5, 2.2, la - Math.PI / 2, 0, TAU); g.fill();
        }
        px = nx; py = ny;
      }
    }
  });
}
// a plank texture: boards across, grain, seams and nails
function plankTex(key, hue = 28, sat = 34, l0 = 20, l1 = 30, boards = 6) {
  return canvasTex(key, 256, 256, g => {
    const bh = 256 / boards;
    for (let b = 0; b < boards; b++) {
      const l = rand(l0, l1), h = hue + rand(-4, 4);
      g.fillStyle = `hsl(${h}, ${sat}%, ${l}%)`; g.fillRect(0, b * bh, 256, bh);
      for (let k = 0; k < 14; k++) {
        const y = b * bh + rand(2, bh - 2);
        g.strokeStyle = `hsla(${h}, ${sat}%, ${l + rand(-9, 6)}%, 0.7)`; g.lineWidth = rand(0.6, 1.8);
        g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(80, y + rand(-3, 3), 170, y + rand(-3, 3), 256, y + rand(-2, 2)); g.stroke();
      }
      g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(0, b * bh, 256, 2);
      g.fillStyle = 'rgba(20,14,10,0.9)';
      for (const x of [14, 242]) { g.beginPath(); g.arc(x, b * bh + bh / 2, 2.2, 0, TAU); g.fill(); }
    }
  });
}

// ---------- geometry helpers ----------
// two crossed vertical quads (the classic game-foliage card); anchored at the base or the centre
function crossGeo(w, h, centered = false) {
  const geo = new THREE.BufferGeometry();
  const pos = [], nrm = [], uv = [], idx = [];
  const y0 = centered ? -h / 2 : 0, y1 = centered ? h / 2 : h, hw = w / 2;
  const quad = (ax, az) => {
    const b = pos.length / 3;
    pos.push(-hw * ax, y0, -hw * az, hw * ax, y0, hw * az, hw * ax, y1, hw * az, -hw * ax, y1, -hw * az);
    for (let k = 0; k < 4; k++) nrm.push(-az, 0, ax);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  quad(1, 0); quad(0, 1);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  return geo;
}
const cardMat = (map, extra = {}) => new THREE.MeshLambertMaterial({ map, alphaTest: 0.45, side: THREE.DoubleSide, ...extra });

// a gradient sky dome that follows the camera
function skyDome(horizon, zenith, radius = 520) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uHorizon: { value: new THREE.Color(horizon) }, uZenith: { value: new THREE.Color(zenith) }, uLift: { value: 0 } },
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uHorizon, uZenith; uniform float uLift; varying vec3 vP;
      void main(){ float h = normalize(vP).y; vec3 c = mix(uHorizon, uZenith, smoothstep(-0.02, 0.55, h)); gl_FragColor = vec4(c + uLift, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 14), mat);
  m.renderOrder = -10; m.frustumCulled = false;
  return m;
}

// ---------- glowing points (wisps, embers, stars, smoke) ----------
const POINT_VERT = `
  attribute float aSize; attribute float aPhase;
  uniform float uTime, uScale, uFlicker, uFar;
  varying float vA;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float dist = -mv.z;
    float pulse = 1.0 - uFlicker * (0.5 + 0.5 * sin(uTime * 2.0 + aPhase * 7.0));
    vA = pulse * (1.0 - smoothstep(uFar * 0.5, uFar, dist));
    gl_PointSize = clamp(aSize * uScale / max(dist, 0.5), 1.0, 160.0);
    gl_Position = projectionMatrix * mv;
  }`;
const POINT_FRAG = `
  uniform vec3 uColor; uniform sampler2D uMap; uniform float uOpacity;
  varying float vA;
  void main() {
    float a = texture2D(uMap, gl_PointCoord).a * vA * uOpacity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(uColor, a);
  }`;

class GlowPoints {
  constructor(n, { color = 0xffffff, size = [0.3, 0.8], flicker = 0.6, far = 80, opacity = 1, blending = THREE.AdditiveBlending } = {}) {
    const geo = new THREE.BufferGeometry();
    this.n = n;
    this.pos = new Float32Array(n * 3);
    const sizes = new Float32Array(n), phases = new Float32Array(n);
    for (let i = 0; i < n; i++) { sizes[i] = rand(size[0], size[1]); phases[i] = rand(0, TAU); }
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uScale: { value: 400 }, uFlicker: { value: flicker }, uFar: { value: far },
        uColor: { value: new THREE.Color(color) }, uMap: { value: glow() }, uOpacity: { value: opacity },
      },
      vertexShader: POINT_VERT, fragmentShader: POINT_FRAG,
      transparent: true, depthWrite: false, blending,
    });
    this.mesh = new THREE.Points(geo, this.mat);
    this.mesh.frustumCulled = false;
  }
  set(i, x, y, z) { const o = i * 3; this.pos[o] = x; this.pos[o + 1] = y; this.pos[o + 2] = z; }
  commit() { this.mesh.geometry.attributes.position.needsUpdate = true; }
  update(t, io) { this.mat.uniforms.uTime.value = t; this.mat.uniforms.uScale.value = io.height * 0.5; }
}

function makeStars(n, radius) {
  const s = new GlowPoints(n, { color: 0xd8e2ff, size: [0.7, 1.8], flicker: 0.75, far: 1e6, opacity: 0.9 });
  for (let i = 0; i < n; i++) {
    const th = rand(0, TAU), ph = Math.acos(rand(0.04, 1));
    s.set(i, radius * Math.sin(ph) * Math.cos(th), radius * Math.cos(ph), radius * Math.sin(ph) * Math.sin(th));
  }
  s.commit();
  return s;
}

function makeMoon({ color = 0xe6ecff, halo = 0x8fa4ff, size = 18, haloSize = 110, opacity = 0.45, discOpacity = 1 } = {}) {
  const g = new THREE.Group();
  const h = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: halo, fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending, opacity }));
  h.scale.setScalar(haloSize);
  const d = new THREE.Sprite(new THREE.SpriteMaterial({ map: disc(), color, fog: false, depthWrite: false, transparent: true, opacity: discOpacity }));
  d.scale.setScalar(size);
  g.add(h, d);
  return g;
}

function disposeScene(scene) {
  scene.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) m.dispose();
  });
}

// a pool of real point lights handed to the nearest emitters ahead of the camera each frame
function lightPool(scene, n, color, intensity, distance) {
  const lights = [];
  for (let i = 0; i < n; i++) { const l = new THREE.PointLight(color, 0, distance, 2); lights.push(l); scene.add(l); }
  return (emitters, cz, k = 1) => {
    const near = emitters.filter(e => e.position.z < cz + 6).sort((a, b) => b.position.z - a.position.z);
    for (let i = 0; i < n; i++) {
      const e = near[i], l = lights[i];
      if (!e) { l.intensity = 0; continue; }
      e.getWorldPosition(l.position); l.position.add(e.userData.lightOffset || ZERO);
      if (e.userData.lightColor) l.color.set(e.userData.lightColor);
      l.intensity = intensity * (e.userData.flicker ? e.userData.flicker(k) : 1);
    }
  };
}
const ZERO = new THREE.Vector3();

// =====================================================================
// zone 1: Teldrassil. The path between Dolanaar and Darnassus at night:
// violet haze, huge pale trunks, pink canopy, a flagstone road, moonwells,
// hooked lamp posts with blue lanterns, lilac stone houses with purple roofs.
// =====================================================================
function teldrassil({ mobile }) {
  const scene = new THREE.Scene();
  const FOG = 0x3b2e62;
  scene.fog = new THREE.FogExp2(FOG, mobile ? 0.022 : 0.0155);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 700);
  camera.position.set(0, 3.0, 0);
  scene.add(skyDome(FOG, 0x1c1640));
  scene.add(new THREE.HemisphereLight(0xb0a8e0, 0x24443a, 2.2));
  const fillLight = new THREE.DirectionalLight(0xb4a8e4, 0.7); // soft light from behind the camera so trunk faces read pale
  fillLight.position.set(25, 20, 60);
  scene.add(fillLight);
  const moonLight = new THREE.DirectionalLight(0xd8d4ff, 1.4);
  moonLight.position.set(-30, 60, -70);
  scene.add(moonLight);

  // textures
  const barkTex = canvasTex('bark', 128, 256, (g, w, h) => pixels(g, w, h, (u, v) => {
    const n = fbm(u, v * 0.25, 6, 4), groove = fbm(u, v * 0.06, 24, 2);
    const ridge = Math.pow(1 - Math.abs(Math.sin(u * TAU * 9 + n * 4)), 3);
    const t = clamp01(0.3 + n * 0.55 + ridge * 0.3 - (1 - groove) * 0.3);
    return mix3(hex(0x3a3050), hex(0xd4cce6), t);
  }), { repeat: [3, 5] });
  const grassTex = canvasTex('grass', 256, 256, (g, w, h) => pixels(g, w, h, (u, v) => {
    const n = fbm(u, v, 5, 4), s = fbm(u + 0.3, v + 0.7, 40, 1);
    let c = mix3(hex(0x1a3a3a), hex(0x4a8a72), clamp01(n * 1.3 - 0.1));
    if (s > 0.9) c = mix3(c, hex(0xd467c8), 0.7); // a scatter of pink flowers
    return c;
  }), { repeat: [60, 60] });
  const stoneTex = canvasTex('flagstone', 256, 512, (g, w, h) => {
    g.fillStyle = '#34304a'; g.fillRect(0, 0, w, h);
    const ROWS = 14, ch = h / ROWS;
    for (let r = 0; r < ROWS; r++) {
      let x = r % 2 ? -rand(14, 30) : -rand(0, 8);
      while (x < w) {
        const sw = rand(36, 72), x0 = x + 2.5, x1 = x + sw - 2.5, y0 = r * ch + 2.5, y1 = (r + 1) * ch - 2.5;
        const l = rand(44, 58), hue = rand(248, 266);
        const pts = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([px, py]) => [px + rand(-3, 3), py + rand(-3, 3)]);
        const path = () => { g.beginPath(); pts.forEach(([px, py], i) => i ? g.lineTo(px, py) : g.moveTo(px, py)); g.closePath(); };
        const grad = g.createLinearGradient(x0, y0, x1, y1);
        grad.addColorStop(0, `hsl(${hue}, 14%, ${l + 6}%)`); grad.addColorStop(1, `hsl(${hue}, 12%, ${l - 8}%)`);
        g.fillStyle = grad; path(); g.fill();
        g.strokeStyle = `hsla(${hue}, 16%, ${l + 16}%, 0.45)`; g.lineWidth = 1.2; g.stroke();
        for (let k = 0; k < 4; k++) { g.fillStyle = `hsla(${hue}, 10%, ${l + rand(-10, 8)}%, 0.35)`; g.beginPath(); g.arc(rand(x0, x1), rand(y0, y1), rand(2, 7), 0, TAU); g.fill(); }
        x += sw;
      }
    }
    // moss in the joints, and pink leaves fallen on the stone
    g.strokeStyle = 'rgba(60, 130, 100, 0.4)'; g.lineWidth = 2.4;
    for (let i = 0; i < 26; i++) { g.beginPath(); const x = rand(0, w), y = Math.round(rand(0, ROWS)) * ch; g.moveTo(x, y); g.lineTo(x + rand(-26, 26), y + rand(-3, 3)); g.stroke(); }
    for (let i = 0; i < 70; i++) { g.fillStyle = `hsla(${rand(305, 330)}, 50%, ${rand(40, 62)}%, ${rand(0.5, 0.85)})`; g.beginPath(); g.ellipse(rand(0, w), rand(0, h), rand(2.5, 4.5), rand(1.2, 2), rand(0, TAU), 0, TAU); g.fill(); }
  }, { repeat: [1, 30] });
  const canopyTexA = clusterTex('leafA', 322, 50, 32, 68);
  const canopyTexB = clusterTex('leafB', 300, 44, 30, 64, 900, [6, 13, 3, 7]);
  const bushTex = clusterTex('bush', 168, 34, 14, 36, 700, [3, 7, 2, 4]);
  const tuft = tuftTex('tuft', 168, 32, 18, 36);
  const fern = fernTex('fern', 162, 36, 16, 34);

  const SPAN = 200;
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const look = new THREE.Vector3();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ map: grassTex, color: 0x8a94b0, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(7.5, 600), new THREE.MeshStandardMaterial({ map: stoneTex, color: 0xc8c2e0, roughness: 0.9 }));
  road.rotation.x = -Math.PI / 2; road.position.y = 0.03;
  scene.add(road);

  // trees: huge pale trunks with root flares and canopies made of leaf cards
  const N = mobile ? 44 : 72, CL = 7, RT = 4;
  const trunkGeo = new THREE.CylinderGeometry(1.0, 1.9, 36, 10, 1); trunkGeo.translate(0, 18, 0);
  const rootGeo = new THREE.ConeGeometry(0.8, 5.2, 6, 1); rootGeo.translate(0, 2.6, 0); rootGeo.rotateX(Math.PI / 2); // axis along +z: base at the origin, tip ahead
  const barkMat = new THREE.MeshStandardMaterial({ map: barkTex, color: 0xc4bcd8, roughness: 1 });
  const trunks = new THREE.InstancedMesh(trunkGeo, barkMat, N);
  const roots = new THREE.InstancedMesh(rootGeo, barkMat, N * RT);
  const cardGeo = crossGeo(1, 1, true);
  const canopiesA = new THREE.InstancedMesh(cardGeo, cardMat(canopyTexA, { emissive: 0x2a1040 }), N * CL);
  const canopiesB = new THREE.InstancedMesh(cardGeo, cardMat(canopyTexB, { emissive: 0x24103a }), N * CL);
  for (const m of [trunks, roots, canopiesA, canopiesB]) m.frustumCulled = false;
  const pickX = () => { let x; do { x = rand(-90, 90); } while (Math.abs(x) < 10 || (Math.abs(x) > 13 && Math.abs(x) < 20)); return x; };
  const newTree = z => ({
    x: pickX(), z, s: rand(0.75, 1.5), r: rand(0, TAU),
    blobs: Array.from({ length: CL }, (_, k) => {
      const a = rand(0, TAU), rr = k === 0 ? 0 : rand(3, 10);
      return { dx: Math.cos(a) * rr, dz: Math.sin(a) * rr, dy: k === 0 ? 3 : k < 5 ? rand(-4, 3) : rand(-13, -8), s: k === 0 ? rand(20, 26) : rand(13, 20), ry: rand(0, TAU), tint: k >= 5 ? rand(0.5, 0.68) : rand(0.85, 1.1), useA: Math.random() < 0.6 };
    }),
  });
  const trees = [];
  const setTree = i => {
    const tr = trees[i];
    dummy.position.set(tr.x, 0, tr.z); dummy.rotation.set(0, tr.r, 0); dummy.scale.setScalar(tr.s); dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    for (let k = 0; k < RT; k++) {
      const a = tr.r + k * TAU / RT + 0.4;
      dummy.position.set(tr.x + Math.cos(a) * 3.0 * tr.s, -0.4, tr.z + Math.sin(a) * 3.0 * tr.s);
      look.set(tr.x, 3.4 * tr.s, tr.z); dummy.lookAt(look); dummy.scale.setScalar(tr.s); dummy.updateMatrix();
      roots.setMatrixAt(i * RT + k, dummy.matrix);
    }
    const top = 36 * tr.s;
    tr.blobs.forEach((b, k) => {
      const j = i * CL + k;
      dummy.position.set(tr.x + b.dx * tr.s, top + b.dy * tr.s, tr.z + b.dz * tr.s);
      dummy.rotation.set(0, b.ry, 0); dummy.scale.set(b.s * tr.s, b.s * tr.s * 0.75, b.s * tr.s); dummy.updateMatrix();
      const on = b.useA ? canopiesA : canopiesB, off = b.useA ? canopiesB : canopiesA;
      on.setMatrixAt(j, dummy.matrix); on.setColorAt(j, color.setScalar(b.tint));
      dummy.scale.setScalar(0); dummy.updateMatrix(); off.setMatrixAt(j, dummy.matrix); off.setColorAt(j, color.setScalar(1));
    });
  };
  for (let i = 0; i < N; i++) { trees.push(newTree(rand(-SPAN, 14))); setTree(i); }
  const treesDirty = () => { trunks.instanceMatrix.needsUpdate = roots.instanceMatrix.needsUpdate = canopiesA.instanceMatrix.needsUpdate = canopiesB.instanceMatrix.needsUpdate = true; canopiesA.instanceColor.needsUpdate = canopiesB.instanceColor.needsUpdate = true; };
  treesDirty();
  scene.add(trunks, roots, canopiesA, canopiesB);

  // undergrowth: grass tufts, bushes, glowing mushrooms, pink flowers
  const GN = mobile ? 260 : 700;
  const tufts = new THREE.InstancedMesh(crossGeo(1.4, 1.0), cardMat(tuft, { emissive: 0x081a18 }), GN);
  const blades = [];
  const sideX = (lo, hi) => (Math.random() < 0.5 ? -1 : 1) * rand(lo, hi);
  const newBlade = z => ({ x: sideX(3.6, 40), z, s: rand(0.7, 1.5), r: rand(0, TAU), t: rand(0.7, 1.1) });
  const setBlade = i => { const b = blades[i]; dummy.position.set(b.x, 0, b.z); dummy.rotation.set(0, b.r, 0); dummy.scale.setScalar(b.s); dummy.updateMatrix(); tufts.setMatrixAt(i, dummy.matrix); tufts.setColorAt(i, color.setRGB(b.t * 0.9, b.t, b.t * 0.95)); };
  for (let i = 0; i < GN; i++) { blades.push(newBlade(rand(-SPAN, 12))); setBlade(i); }
  tufts.instanceMatrix.needsUpdate = tufts.instanceColor.needsUpdate = true;
  tufts.frustumCulled = false;
  scene.add(tufts);
  const FRN = mobile ? 70 : 180;
  const ferns = new THREE.InstancedMesh(crossGeo(2.6, 1.3), cardMat(fern, { emissive: 0x081a16 }), FRN);
  const fernAt = [];
  const newFern = z => ({ x: sideX(4.2, 34), z, s: rand(0.8, 1.9), r: rand(0, TAU) });
  const setFern = i => { const f = fernAt[i]; dummy.position.set(f.x, -0.05, f.z); dummy.rotation.set(0, f.r, 0); dummy.scale.setScalar(f.s); dummy.updateMatrix(); ferns.setMatrixAt(i, dummy.matrix); };
  for (let i = 0; i < FRN; i++) { fernAt.push(newFern(rand(-SPAN, 12))); setFern(i); }
  ferns.instanceMatrix.needsUpdate = true; ferns.frustumCulled = false;
  scene.add(ferns);
  const BN = mobile ? 24 : 60;
  const bushes = new THREE.InstancedMesh(crossGeo(1, 1), cardMat(bushTex, { emissive: 0x0c2a1c }), BN);
  const bush = [];
  const newBush = z => ({ x: sideX(4.6, 36), z, s: rand(2.2, 4.6), r: rand(0, TAU) });
  const setBush = i => { const b = bush[i]; dummy.position.set(b.x, -0.1, b.z); dummy.rotation.set(0, b.r, 0); dummy.scale.set(b.s, b.s * 0.7, b.s); dummy.updateMatrix(); bushes.setMatrixAt(i, dummy.matrix); };
  for (let i = 0; i < BN; i++) { bush.push(newBush(rand(-SPAN, 12))); setBush(i); }
  bushes.instanceMatrix.needsUpdate = true; bushes.frustumCulled = false;
  scene.add(bushes);
  const MN = mobile ? 14 : 30;
  const capGeo = new THREE.SphereGeometry(1, 10, 6, 0, TAU, 0, Math.PI / 2); capGeo.scale(1, 0.55, 1);
  const caps = new THREE.InstancedMesh(capGeo, new THREE.MeshStandardMaterial({ color: 0x4a3698, emissive: 0x3a20a0, emissiveIntensity: 0.6, roughness: 0.6 }), MN);
  const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.3, 1, 7), new THREE.MeshStandardMaterial({ color: 0x9a90b8, roughness: 1 }), MN);
  caps.frustumCulled = stems.frustumCulled = false;
  const shroom = [];
  const newShroom = z => ({ x: sideX(7, 30), z, s: rand(0.4, 1.2), h: rand(0.8, 1.6) });
  const setShroom = i => {
    const m = shroom[i];
    dummy.position.set(m.x, m.h * m.s / 2, m.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(m.s, m.h * m.s, m.s); dummy.updateMatrix(); stems.setMatrixAt(i, dummy.matrix);
    dummy.position.set(m.x, m.h * m.s - 0.05, m.z); dummy.scale.setScalar(m.s * 0.9); dummy.updateMatrix(); caps.setMatrixAt(i, dummy.matrix);
  };
  for (let i = 0; i < MN; i++) { shroom.push(newShroom(rand(-SPAN, 12))); setShroom(i); }
  caps.instanceMatrix.needsUpdate = stems.instanceMatrix.needsUpdate = true;
  scene.add(caps, stems);
  const shroomGlow = new GlowPoints(MN, { color: 0x8f6fff, size: [1.6, 2.6], flicker: 0.25, far: 70, opacity: 0.35 });
  scene.add(shroomGlow.mesh);
  const FN = mobile ? 100 : 260;
  const flowers = new GlowPoints(FN, { color: 0xff8ae0, size: [0.08, 0.16], flicker: 0.2, far: 50, opacity: 0.9 });
  const flower = [];
  for (let i = 0; i < FN; i++) flower.push({ x: sideX(3.8, 30), z: rand(-SPAN, 12) });
  scene.add(flowers.mesh);

  // moonlight through the canopy
  const SN = mobile ? 0 : 7;
  const shaftMat = new THREE.MeshBasicMaterial({ map: shaftTex(), color: 0xd8c4ff, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const shafts = [];
  for (let i = 0; i < SN; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(rand(6, 14), 70), shaftMat);
    m.userData = { x: sideX(4, 40), z: rand(-SPAN, 0) };
    m.rotation.set(0, rand(0, TAU), 0.22); m.position.set(m.userData.x, 30, m.userData.z);
    shafts.push(m); scene.add(m);
  }

  // hooked lamp posts with blue lanterns along the road
  const LN = 8, LGAP = 26;
  const postMat = new THREE.MeshStandardMaterial({ color: 0x8e82a8, roughness: 0.9 });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x2a2440, roughness: 0.7, metalness: 0.4 });
  const cageMat = new THREE.MeshBasicMaterial({ color: 0x1a1630, wireframe: true });
  const glassMat = new THREE.MeshBasicMaterial({ color: 0xbfeaff });
  const haloMat = new THREE.SpriteMaterial({ map: glow(), color: 0x7fc8ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 });
  const lamps = [];
  for (let i = 0; i < LN; i++) {
    const side = i % 2 ? 1 : -1, s = -side; // hooks lean over the road
    const g = new THREE.Group();
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 2.8, 0), new THREE.Vector3(s * 0.3, 4.4, 0), new THREE.Vector3(s * 1.2, 5.2, 0), new THREE.Vector3(s * 1.9, 4.9, 0), new THREE.Vector3(s * 1.9, 4.3, 0), new THREE.Vector3(s * 1.5, 4.1, 0)]);
    const post = new THREE.Mesh(new THREE.TubeGeometry(curve, 28, 0.14, 7), postMat);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 0.5, 8), postMat); foot.position.y = 0.25;
    const lx = s * 1.8, ly = 3.5;
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 4), frameMat); chain.position.set(lx, ly + 0.55, 0);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.54, 0.44), cageMat); frame.position.set(lx, ly, 0);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.2, 4), frameMat); cap.position.set(lx, ly + 0.36, 0); cap.rotation.y = Math.PI / 4;
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.44, 0.36), glassMat); glass.position.set(lx, ly - 0.02, 0);
    const halo = new THREE.Sprite(haloMat); halo.scale.setScalar(4); halo.position.set(lx, ly, 0);
    g.add(post, foot, chain, frame, cap, glass, halo);
    g.position.set(side * 5.6, 0, -(12 + i * LGAP));
    g.userData.lightOffset = new THREE.Vector3(lx, ly, 0);
    lamps.push(g); scene.add(g);
  }
  const lampLights = lightPool(scene, 3, 0x86c6ff, 18, 16);

  // moonwells beside the road: a lilac stone basin, silver water, a column of light and sparks
  const MW = 2, MWGAP = 110;
  const wells = [];
  const stone = new THREE.MeshStandardMaterial({ color: 0xa79fc6, roughness: 0.85 });
  const wellHalo = new THREE.SpriteMaterial({ map: glow(), color: 0x9fe8ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.4 });
  const basinGeo = new THREE.LatheGeometry([new THREE.Vector2(0, 0.2), new THREE.Vector2(3.0, 0.2), new THREE.Vector2(4.0, 0.5), new THREE.Vector2(4.5, 1.3), new THREE.Vector2(4.1, 1.6), new THREE.Vector2(3.4, 1.5), new THREE.Vector2(3.3, 1.0)], 28);
  for (let i = 0; i < MW; i++) {
    const g = new THREE.Group();
    const basin = new THREE.Mesh(basinGeo, stone);
    const step = new THREE.Mesh(new THREE.CylinderGeometry(5.6, 5.9, 0.3, 28), stone); step.position.y = 0.15;
    const water = new THREE.Mesh(new THREE.CircleGeometry(3.3, 28), new THREE.MeshBasicMaterial({ color: 0xd9f6ff })); water.rotation.x = -Math.PI / 2; water.position.y = 1.25;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.1, 22, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0x9feaff, map: shaftTex(), transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })); beam.position.y = 11.8;
    const light = new THREE.PointLight(0x8fe4ff, 110, 40, 2); light.position.y = 3;
    const halo = new THREE.Sprite(wellHalo); halo.scale.setScalar(14); halo.position.y = 1.8;
    g.add(step, basin, water, beam, light, halo);
    g.position.set(i % 2 ? 17 : -17, 0, -(50 + i * MWGAP));
    wells.push(g); scene.add(g);
  }
  const SKN = 90;
  const sparks = new GlowPoints(SKN, { color: 0xbff4ff, size: [0.15, 0.4], flicker: 0.7, far: 90 });
  const spark = [];
  for (let i = 0; i < SKN; i++) spark.push({ a: rand(0, TAU), r: rand(0.3, 2.8), y: rand(1, 14), v: rand(0.6, 1.6) });
  scene.add(sparks.mesh);

  // night elf houses back among the trees: lilac walls, swooping purple roofs, a warm doorway
  const HN = 2, HGAP = 130;
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xb8aacf, roughness: 0.9 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x5b3f9c, roughness: 0.8, side: THREE.DoubleSide });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x3fb3a8, roughness: 0.6, metalness: 0.3 });
  const doorMat = new THREE.MeshBasicMaterial({ color: 0xffc98a });
  const roofGeo = new THREE.LatheGeometry([new THREE.Vector2(4.6, 3.0), new THREE.Vector2(4.1, 3.3), new THREE.Vector2(3.0, 4.2), new THREE.Vector2(2.0, 5.4), new THREE.Vector2(1.1, 6.6), new THREE.Vector2(0.4, 7.6), new THREE.Vector2(0, 8.0)], 14);
  const houses = [];
  for (let i = 0; i < HN; i++) {
    const g = new THREE.Group();
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.6, 3.4, 12), wallMat); wall.position.y = 1.7;
    const roof = new THREE.Mesh(roofGeo, roofMat);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4.3, 0.12, 6, 24), trimMat); ring.rotation.x = Math.PI / 2; ring.position.y = 3.1;
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), trimMat); finial.position.y = 8.1;
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.2), doorMat); door.position.set(0, 1.1, 3.62);
    const dhalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: 0xffb070, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.45 })); dhalo.scale.setScalar(5); dhalo.position.set(0, 1.4, 3.9);
    const dlight = new THREE.PointLight(0xffb070, 30, 18, 2); dlight.position.set(0, 1.6, 4.5);
    g.add(wall, roof, ring, finial, door, dhalo, dlight);
    const side = i % 2 ? 1 : -1;
    g.position.set(side * rand(26, 34), 0, -(90 + i * HGAP)); g.rotation.y = side > 0 ? Math.PI / 2 + 0.3 : -Math.PI / 2 - 0.3;
    g.scale.setScalar(rand(1.1, 1.5));
    houses.push(g); scene.add(g);
  }

  // wisps drifting between the trees, petals falling
  const WN = mobile ? 50 : 110;
  const wisps = new GlowPoints(WN, { color: 0xbfe6ff, size: [0.5, 1.2], flicker: 0.85, far: 90 });
  const wbase = [];
  for (let i = 0; i < WN; i++) wbase.push({ x: rand(-40, 40), y: rand(0.8, 10), z: rand(-SPAN, 10), p: rand(0, TAU) });
  scene.add(wisps.mesh);
  const PN = mobile ? 80 : 220;
  const petals = new GlowPoints(PN, { color: 0xff9fdc, size: [0.1, 0.26], flicker: 0.3, far: 60, opacity: 0.8 });
  const petal = [];
  for (let i = 0; i < PN; i++) petal.push({ x: rand(-30, 30), y: rand(0, 30), z: rand(-SPAN, 10), v: rand(0.4, 0.9), p: rand(0, TAU) });
  scene.add(petals.mesh);

  const stars = makeStars(mobile ? 80 : 160, 420);
  stars.mat.uniforms.uOpacity.value = 0.35;
  scene.add(stars.mesh);
  const moon = makeMoon({ color: 0xf2ecff, size: 24, haloSize: 260, opacity: 0.5, halo: 0xb08cff });
  scene.add(moon);

  let dist = 0;
  function update(t, dt, io) {
    dist += dt * 1.5;
    const cz = -dist;
    const sway = Math.sin(t * 0.22) * 1.2;
    camera.position.set(sway + io.pointer.x * 1.4, 3.0 + Math.sin(t * 0.9) * 0.07 - io.pointer.y * 0.5, cz);
    look.set(sway * 0.4 + io.pointer.x * 3.5, 7.4 - io.pointer.y * 1.8 - io.scroll * 2.4, cz - 22);
    camera.lookAt(look);
    ground.position.z = road.position.z = cz;
    stars.mesh.position.copy(camera.position);
    moon.position.set(camera.position.x - 70, 110, cz - 240);
    scene.children[0].position.copy(camera.position);

    let dirty = false;
    for (let i = 0; i < N; i++) if (trees[i].z > cz + 16) { trees[i] = newTree(trees[i].z - SPAN - 30); setTree(i); dirty = true; }
    if (dirty) treesDirty();
    dirty = false;
    for (let i = 0; i < GN; i++) if (blades[i].z > cz + 6) { blades[i] = newBlade(blades[i].z - SPAN - 18); setBlade(i); dirty = true; }
    if (dirty) tufts.instanceMatrix.needsUpdate = tufts.instanceColor.needsUpdate = true;
    dirty = false;
    for (let i = 0; i < BN; i++) if (bush[i].z > cz + 8) { bush[i] = newBush(bush[i].z - SPAN - 20); setBush(i); dirty = true; }
    if (dirty) bushes.instanceMatrix.needsUpdate = true;
    dirty = false;
    for (let i = 0; i < FRN; i++) if (fernAt[i].z > cz + 6) { fernAt[i] = newFern(fernAt[i].z - SPAN - 18); setFern(i); dirty = true; }
    if (dirty) ferns.instanceMatrix.needsUpdate = true;
    dirty = false;
    for (let i = 0; i < MN; i++) if (shroom[i].z > cz + 6) { shroom[i] = newShroom(shroom[i].z - SPAN - 18); setShroom(i); dirty = true; }
    if (dirty) caps.instanceMatrix.needsUpdate = stems.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < MN; i++) shroomGlow.set(i, shroom[i].x, shroom[i].h * shroom[i].s + 0.2, shroom[i].z);
    shroomGlow.commit(); shroomGlow.update(t, io);
    for (let i = 0; i < FN; i++) { const f = flower[i]; if (f.z > cz + 4) { f.z -= SPAN + 16; f.x = sideX(3.8, 30); } flowers.set(i, f.x, 0.25, f.z); }
    flowers.commit(); flowers.update(t, io);
    for (const m of shafts) { if (m.userData.z > cz + 4) { m.userData.z -= SPAN + 10; m.userData.x = sideX(4, 40); } m.position.set(m.userData.x, 30, m.userData.z); }

    for (const g of lamps) if (g.position.z > cz + 6) g.position.z -= LN * LGAP;
    lampLights(lamps, cz);

    for (const g of wells) if (g.position.z > cz + 14) { g.position.z -= MW * MWGAP; g.position.x = Math.random() < 0.5 ? -17 : 17; }
    for (const g of houses) if (g.position.z > cz + 10) { g.position.z -= HN * HGAP; const side = Math.random() < 0.5 ? -1 : 1; g.position.x = side * rand(26, 34); g.rotation.y = side > 0 ? Math.PI / 2 + 0.3 : -Math.PI / 2 - 0.3; }
    for (let i = 0; i < SKN; i++) {
      const s = spark[i], w = wells[i % MW];
      s.y += s.v * dt; s.a += dt * 0.4;
      if (s.y > 15) s.y = 1;
      sparks.set(i, w.position.x + Math.cos(s.a) * s.r, s.y, w.position.z + Math.sin(s.a) * s.r);
    }
    sparks.commit(); sparks.update(t, io);

    for (let i = 0; i < WN; i++) {
      const w = wbase[i];
      if (w.z > cz + 6) { w.z -= SPAN + 10; w.x = rand(-40, 40); }
      wisps.set(i, w.x + Math.sin(t * 0.6 + w.p) * 1.4, w.y + Math.sin(t * 0.8 + w.p * 1.3) * 0.7, w.z);
    }
    wisps.commit(); wisps.update(t, io);
    for (let i = 0; i < PN; i++) {
      const p = petal[i];
      p.y -= p.v * dt; p.x += Math.sin(t * 0.9 + p.p) * 0.6 * dt;
      if (p.y < 0) { p.y = 30; p.x = rand(-30, 30); }
      if (p.z > cz + 4) p.z -= SPAN;
      petals.set(i, p.x, p.y, p.z);
    }
    petals.commit(); petals.update(t, io); stars.update(t, io);
  }
  return { name: 'teldrassil.lua', accent: '#a78bfa', scene, camera, update };
}

// =====================================================================
// zone 2: Darkshore. The coast below Auberdine on a wet night: grey-blue
// overcast, a moon behind the cloud, grey sand, pale Highborne ruins,
// a dark treeline, a pier with one lantern, a wreck in the shallows, rain.
// =====================================================================
function darkshore({ mobile }) {
  const scene = new THREE.Scene();
  const FOGC = 0x2a3446;
  scene.fog = new THREE.Fog(FOGC, 30, 240);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 900);
  camera.position.set(0, 6, 0);
  const sky = skyDome(0x3e4a62, 0x141a28, 560);
  scene.add(sky);

  const hemi = new THREE.HemisphereLight(0x6a7a9a, 0x141a1e, 1.1);
  scene.add(hemi);
  const moonDir = new THREE.Vector3(-175, 88, -260).normalize();
  const moonLight = new THREE.DirectionalLight(0xaebcdc, 1.1);
  moonLight.position.copy(moonDir).multiplyScalar(100);
  scene.add(moonLight);
  const seaFill = new THREE.DirectionalLight(0x7a8cb4, 0.7);
  seaFill.position.set(-40, 30, 80);
  scene.add(seaFill);

  // textures
  const sandTex = canvasTex('sand', 256, 256, (g, w, h) => pixels(g, w, h, (u, v) => {
    const n = fbm(u, v, 6, 3), s = fbm(u + 0.5, v, 64, 1);
    return mix3(hex(0x6a6c72), hex(0xa4a6ac), clamp01(n * 0.9 + (s > 0.7 ? 0.25 : 0)));
  }), { repeat: [6, 70] });
  const cloudTex = canvasTex('cloud', 256, 256, (g, w, h) => pixels(g, w, h, (u, v) => {
    const n = fbm(u, v, 3, 5);
    return [255, 255, 255, Math.round(255 * sstep(0.38, 0.72, n))];
  }));
  const darkBark = canvasTex('darkbark', 128, 256, (g, w, h) => pixels(g, w, h, (u, v) => {
    const n = fbm(u, v * 0.25, 6, 4);
    return mix3(hex(0x14121a), hex(0x4a4650), clamp01(n * 1.1 - 0.1));
  }), { repeat: [2, 4] });
  const pineTex = clusterTex('pine', 168, 26, 11, 28, 1100, [4, 9, 2, 5]);
  const wreckWood = plankTex('wreckplank', 30, 8, 20, 32, 8);
  const marbleTex = canvasTex('marble', 128, 128, (g, w, h) => pixels(g, w, h, (u, v) => {
    const n = fbm(u, v, 4, 4);
    return mix3(hex(0x7a7890), hex(0xc4c2d4), clamp01(n * 1.2 - 0.1));
  }), { repeat: [1, 1] });

  // sea: sines in the vertex shader, moon glitter and shore foam in the fragment
  const segs = mobile ? 80 : 160;
  const seaGeo = new THREE.PlaneGeometry(700, 700, segs, segs); seaGeo.rotateX(-Math.PI / 2);
  const seaMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uMoonDir: { value: moonDir }, uCam: { value: camera.position },
      uDeep: { value: new THREE.Color(0x0e1a24) }, uShallow: { value: new THREE.Color(0x22383f) }, uSky: { value: new THREE.Color(0x3e4a62) },
      uFogColor: { value: scene.fog.color }, uFogNear: { value: 30 }, uFogFar: { value: 240 }, uFlash: { value: 0 },
    },
    vertexShader: `
      uniform float uTime; varying vec3 vWorld; varying vec3 vNormal; varying float vCrest;
      void wave(vec2 p, vec2 d, float w, float a, float s, inout float h, inout vec2 g) {
        float ph = dot(d, p) * w + uTime * s; h += a * sin(ph); g += d * (w * a * cos(ph));
      }
      void main() {
        vec3 pos = position; vec2 p = pos.xz; float h = 0.0; vec2 g = vec2(0.0);
        wave(p, normalize(vec2(0.3, 1.0)), 0.16, 0.5, 1.0, h, g);
        wave(p, normalize(vec2(-0.6, 1.0)), 0.3, 0.3, 1.5, h, g);
        wave(p, normalize(vec2(1.0, 0.4)), 0.55, 0.14, 2.2, h, g);
        wave(p, normalize(vec2(-0.2, -1.0)), 0.95, 0.07, 3.0, h, g);
        wave(p, normalize(vec2(1.0, 0.1)), 0.09, 0.35, 0.6, h, g);
        pos.y += h; vCrest = h;
        vNormal = normalize(vec3(-g.x, 1.0, -g.y));
        vec4 w = modelMatrix * vec4(pos, 1.0); vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `
      uniform vec3 uMoonDir, uCam, uDeep, uShallow, uSky, uFogColor; uniform float uFogNear, uFogFar, uTime, uFlash;
      varying vec3 vWorld; varying vec3 vNormal; varying float vCrest;
      void main() {
        vec2 q = vWorld.xz;
        vec2 rip = vec2(sin(q.x * 2.3 + q.y * 0.7 + uTime * 1.9) + 0.6 * sin(q.x * 5.1 - q.y * 3.3 + uTime * 3.1),
                        cos(q.y * 2.9 - q.x * 0.9 - uTime * 1.6) + 0.6 * sin(q.y * 6.3 + q.x * 2.2 + uTime * 2.7));
        float dCam = distance(uCam, vWorld);
        vec3 N = normalize(normalize(vNormal) + vec3(rip.x, 0.0, rip.y) * 0.06 * (1.0 - smoothstep(60.0, 240.0, dCam) * 0.7));
        vec3 V = normalize(uCam - vWorld);
        float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
        vec3 col = mix(uDeep, uShallow, smoothstep(-0.7, 1.0, vCrest));
        col = mix(col, uSky, fres * 0.3);
        vec3 H = normalize(uMoonDir + V);
        float nh = max(dot(N, H), 0.0);
        col += vec3(0.8, 0.86, 1.0) * (pow(nh, 700.0) * 1.5 + pow(nh, 60.0) * 0.1 + pow(nh, 12.0) * 0.03);
        // foam where the swell meets the sand (the beach begins at x = 14)
        float edge = vWorld.x + sin(vWorld.z * 0.21 + uTime * 0.9) * 1.6 + sin(vWorld.z * 0.07 - uTime * 0.4) * 2.4 + vCrest * 2.0;
        float shore = smoothstep(16.0, 24.0, edge);
        float lines = smoothstep(0.8, 1.0, 0.5 + 0.5 * sin(edge * 2.2 - uTime * 1.6)); // bands parallel to the beach, rolling in
        float breakup = 0.55 + 0.45 * sin(vWorld.z * 0.9 + sin(vWorld.z * 0.31) * 2.0 + uTime * 0.3);
        float foam = shore * (0.3 + lines * 0.4) * breakup;
        foam += smoothstep(0.75, 1.0, vCrest) * 0.05;
        col = mix(col, vec3(0.34, 0.38, 0.42), clamp(foam, 0.0, 0.42));
        col += uFlash * 0.25;
        float f = smoothstep(uFogNear, uFogFar, distance(uCam, vWorld));
        gl_FragColor = vec4(mix(col, uFogColor, f), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sea = new THREE.Mesh(seaGeo, seaMat);
  sea.position.set(-60, 0, -150);
  scene.add(sea);

  // the beach: a strip of grey sand sloping up from the water, then dark turf
  const beachGeo = new THREE.PlaneGeometry(36, 600, 4, 1); beachGeo.rotateX(-Math.PI / 2);
  { const p = beachGeo.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, lerp(-0.9, 1.6, (p.getX(i) + 18) / 36)); beachGeo.computeVertexNormals(); }
  const beach = new THREE.Mesh(beachGeo, new THREE.MeshStandardMaterial({ map: sandTex, color: 0x9a9aa4, roughness: 1 }));
  beach.position.set(30, 0, -150);
  scene.add(beach);
  const turf = new THREE.MeshStandardMaterial({ color: 0x222c28, roughness: 1 });
  const land = new THREE.Mesh(new THREE.BoxGeometry(260, 6, 600), turf);
  land.position.set(170, -1.4, -150);
  scene.add(land);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const RN = 60;
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1.4, 0), new THREE.MeshStandardMaterial({ color: 0x5c5e68, roughness: 1, flatShading: true }), RN);
  rocks.frustumCulled = false;
  for (let i = 0; i < RN; i++) {
    dummy.position.set(rand(16, 46), rand(-0.2, 1.0), rand(-230, 10));
    dummy.scale.set(rand(0.5, 2.6), rand(0.4, 1.5), rand(0.5, 2.6));
    dummy.rotation.set(rand(0, TAU), rand(0, TAU), 0);
    dummy.updateMatrix(); rocks.setMatrixAt(i, dummy.matrix);
  }
  scene.add(rocks);
  // driftwood
  const DW = 14;
  const drift = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.3, 6, 6), new THREE.MeshStandardMaterial({ color: 0x3a3028, roughness: 1 }), DW);
  drift.frustumCulled = false;
  for (let i = 0; i < DW; i++) { dummy.position.set(rand(22, 36), 0.9, rand(-200, 5)); dummy.rotation.set(Math.PI / 2 + rand(-0.1, 0.1), 0, rand(0, TAU)); dummy.scale.setScalar(rand(0.6, 1.4)); dummy.updateMatrix(); drift.setMatrixAt(i, dummy.matrix); }
  scene.add(drift);

  // Highborne ruins up the beach: pale fluted columns, some broken, some fallen, one arch
  const marble = new THREE.MeshStandardMaterial({ map: marbleTex, color: 0xb0aab4, roughness: 0.85 });
  const CN = 14;
  const colGeo = new THREE.CylinderGeometry(1.0, 1.15, 1, 12); colGeo.translate(0, 0.5, 0);
  const cols = new THREE.InstancedMesh(colGeo, marble, CN);
  const capGeo = new THREE.BoxGeometry(2.8, 0.6, 2.8); capGeo.translate(0, 0.3, 0);
  const capitals = new THREE.InstancedMesh(capGeo, marble, CN);
  const baseGeo = new THREE.CylinderGeometry(1.5, 1.7, 0.5, 12); baseGeo.translate(0, 0.25, 0);
  const bases = new THREE.InstancedMesh(baseGeo, marble, CN);
  cols.frustumCulled = capitals.frustumCulled = bases.frustumCulled = false;
  for (let i = 0; i < CN; i++) {
    const whole = Math.random() < 0.4, h = whole ? rand(12, 16) : rand(3, 9), x = rand(36, 72), z = Math.random() < 0.5 ? rand(-215, -150) : rand(-85, -40), y = 1.5;
    dummy.position.set(x, y, z); dummy.rotation.set(0, rand(0, TAU), 0); dummy.scale.set(1, h, 1); dummy.updateMatrix(); cols.setMatrixAt(i, dummy.matrix);
    dummy.scale.setScalar(1); dummy.position.set(x, y, z); dummy.updateMatrix(); bases.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, y + h, z); dummy.scale.setScalar(whole ? 1 : 0); dummy.updateMatrix(); capitals.setMatrixAt(i, dummy.matrix);
  }
  scene.add(cols, capitals, bases);
  const FC = 6;
  const fallen = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.0, 1.0, 7, 12), marble, FC);
  fallen.frustumCulled = false;
  for (let i = 0; i < FC; i++) { dummy.position.set(rand(34, 70), 2.2, rand(-190, -40)); dummy.rotation.set(Math.PI / 2, 0, rand(0, TAU)); dummy.scale.setScalar(rand(0.7, 1.3)); dummy.updateMatrix(); fallen.setMatrixAt(i, dummy.matrix); }
  scene.add(fallen);
  const arch = new THREE.Group();
  const archRing = new THREE.Mesh(new THREE.TorusGeometry(5.5, 0.9, 8, 20, Math.PI), marble); archRing.position.y = 12;
  const archL = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.15, 12, 12), marble); archL.position.set(-5.5, 6, 0);
  const archR = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.15, 10.5, 12), marble); archR.position.set(5.5, 5.25, 0); archR.rotation.z = 0.04;
  arch.add(archRing, archL, archR);
  arch.position.set(50, 1.5, -168); arch.rotation.y = -0.6;
  scene.add(arch);
  // ghosts of the Highborne drifting among the columns
  const GN = 24;
  const ghosts = new GlowPoints(GN, { color: 0x8fe8ff, size: [0.8, 1.6], flicker: 0.9, far: 260, opacity: 0.5 });
  const ghost = [];
  for (let i = 0; i < GN; i++) ghost.push({ x: rand(36, 72), y: rand(2.5, 6), z: Math.random() < 0.5 ? rand(-215, -150) : rand(-85, -40), p: rand(0, TAU) });
  scene.add(ghosts.mesh);

  // the treeline: tall dark trunks with dark green canopies, a few dead and bare
  const TN = mobile ? 30 : 56, CL = 5;
  const trunkGeo = new THREE.CylinderGeometry(0.9, 1.7, 40, 8, 1); trunkGeo.translate(0, 20, 0);
  const darkBarkMat = new THREE.MeshStandardMaterial({ map: darkBark, color: 0x5a5664, roughness: 1 });
  const trunks = new THREE.InstancedMesh(trunkGeo, darkBarkMat, TN);
  const pines = new THREE.InstancedMesh(crossGeo(1, 1, true), cardMat(pineTex, { emissive: 0x0a1410 }), TN * CL);
  trunks.frustumCulled = pines.frustumCulled = false;
  for (let i = 0; i < TN; i++) {
    const x = rand(50, 130), z = rand(-240, 20), s = rand(0.7, 1.3), dead = Math.random() < 0.2;
    dummy.position.set(x, 1.5, z); dummy.rotation.set(0, rand(0, TAU), rand(-0.05, 0.05)); dummy.scale.set(s, s * (dead ? 0.6 : 1), s); dummy.updateMatrix(); trunks.setMatrixAt(i, dummy.matrix);
    for (let k = 0; k < CL; k++) {
      const a = rand(0, TAU), rr = k ? rand(3, 11) : 0;
      dummy.position.set(x + Math.cos(a) * rr * s, 1.5 + 40 * s + (k ? rand(-10, 1) : 0) * s, z + Math.sin(a) * rr * s);
      dummy.rotation.set(0, rand(0, TAU), 0); dummy.scale.setScalar(dead ? 0 : rand(15, 23) * s); dummy.updateMatrix();
      pines.setMatrixAt(i * CL + k, dummy.matrix); pines.setColorAt(i * CL + k, color.setScalar(rand(0.7, 1.05)));
    }
  }
  scene.add(trunks, pines);
  const DT = 20;
  const dark = new THREE.MeshStandardMaterial({ color: 0x15131a, roughness: 1 });
  const deadTrunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.6, 10, 6), dark, DT);
  const deadBranch = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.2, 4.5, 5), dark, DT * 3);
  deadTrunk.frustumCulled = deadBranch.frustumCulled = false;
  for (let i = 0; i < DT; i++) {
    const x = rand(30, 60), z = rand(-215, 5), h = rand(0.6, 1.3);
    dummy.position.set(x, 5 * h + 0.5, z); dummy.rotation.set(0, rand(0, TAU), rand(-0.18, 0.18)); dummy.scale.setScalar(h); dummy.updateMatrix(); deadTrunk.setMatrixAt(i, dummy.matrix);
    for (let k = 0; k < 3; k++) {
      dummy.position.set(x + rand(-1, 1), (6 + k * 1.6) * h, z + rand(-1, 1));
      dummy.rotation.set(rand(-0.9, 0.9), rand(0, TAU), rand(0.5, 1.2) * (k % 2 ? -1 : 1)); dummy.scale.setScalar(h); dummy.updateMatrix();
      deadBranch.setMatrixAt(i * 3 + k, dummy.matrix);
    }
  }
  scene.add(deadTrunk, deadBranch);

  // Auberdine's pier reaching out into the bay, one lantern burning at the end
  const pier = new THREE.Group();
  const timber = new THREE.MeshStandardMaterial({ color: 0x2e2620, roughness: 1 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(70, 0.5, 5), timber); deck.position.set(0, 3.2, 0); pier.add(deck);
  for (let i = 0; i <= 7; i++) for (const z of [-2, 2]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 7, 6), timber); p.position.set(-35 + i * 10, 0.5, z); pier.add(p); }
  const rail = new THREE.Mesh(new THREE.BoxGeometry(70, 0.12, 0.12), timber); rail.position.set(0, 4.3, 2.4); pier.add(rail);
  const lpost = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 4, 6), timber); lpost.position.set(-34, 5.4, -2.2); pier.add(lpost);
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.5), new THREE.MeshBasicMaterial({ color: 0xffc070 })); lamp.position.set(-34, 7.2, -2.2); pier.add(lamp);
  const lhalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: 0xffa050, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.7 })); lhalo.scale.setScalar(9); lhalo.position.copy(lamp.position); pier.add(lhalo);
  const llight = new THREE.PointLight(0xffa050, 160, 60, 2); llight.position.copy(lamp.position); pier.add(llight);
  pier.position.set(2, 0, -112); pier.rotation.y = 0.08;
  scene.add(pier);

  // Auberdine: night elf houses where the pier meets the land, lilac walls, dark purple roofs, lit windows
  const ahWall = new THREE.MeshStandardMaterial({ color: 0x8e889e, roughness: 0.9 });
  const ahRoof = new THREE.MeshStandardMaterial({ color: 0x3e2c66, roughness: 0.8, side: THREE.DoubleSide });
  const ahTrim = new THREE.MeshStandardMaterial({ color: 0x3a8a88, roughness: 0.6, metalness: 0.3 });
  const ahWin = new THREE.MeshBasicMaterial({ color: 0xd8c4ff });
  const ahRoofGeo = new THREE.LatheGeometry([new THREE.Vector2(5.0, 3.6), new THREE.Vector2(4.4, 3.9), new THREE.Vector2(3.2, 5.0), new THREE.Vector2(2.1, 6.5), new THREE.Vector2(1.1, 8.0), new THREE.Vector2(0.4, 9.2), new THREE.Vector2(0, 9.7)], 14);
  const ahHalo = new THREE.SpriteMaterial({ map: glow(), color: 0xb89cff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.4 });
  for (const [x, z, s, ry] of [[47, -128, 1.25, -0.4], [44, -97, 1.0, 0.5], [66, -114, 1.5, 0.1]]) {
    const g = new THREE.Group();
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(3.8, 4.0, 4.0, 12), ahWall); wall.position.y = 2.0;
    const roof = new THREE.Mesh(ahRoofGeo, ahRoof);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4.7, 0.13, 6, 24), ahTrim); ring.rotation.x = Math.PI / 2; ring.position.y = 3.7;
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), ahTrim); finial.position.y = 9.8;
    g.add(wall, roof, ring, finial);
    for (const a of [-1.9, -1.2, -0.5]) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.4), ahWin); win.position.set(Math.cos(a) * 4.02, 2.4, -Math.sin(a) * 4.02); win.rotation.y = a + Math.PI / 2;
      const h = new THREE.Sprite(ahHalo); h.scale.setScalar(3.4); h.position.set(Math.cos(a) * 4.4, 2.4, -Math.sin(a) * 4.4);
      g.add(win, h);
    }
    const l = new THREE.PointLight(0xb89cff, 40, 20, 2); l.position.set(-6, 3, 0); g.add(l);
    g.position.set(x, 1.4, z); g.rotation.y = ry; g.scale.setScalar(s);
    scene.add(g);
  }
  // hooked night elf lamps along the sand
  const lampPost = new THREE.MeshStandardMaterial({ color: 0x7a7490, roughness: 0.9 });
  const lampHalo = new THREE.SpriteMaterial({ map: glow(), color: 0x8fd0ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 });
  for (const [x, z] of [[30, -60], [33, -88], [36, -140], [31, -38]]) {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 3.2, 0), new THREE.Vector3(-0.4, 5.0, 0), new THREE.Vector3(-1.3, 5.8, 0), new THREE.Vector3(-2.0, 5.4, 0), new THREE.Vector3(-1.9, 4.8, 0)]);
    const post = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.15, 6), lampPost);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.42), new THREE.MeshBasicMaterial({ color: 0xc4ecff })); glass.position.set(-1.9, 4.2, 0);
    const h = new THREE.Sprite(lampHalo); h.scale.setScalar(5); h.position.copy(glass.position);
    const l = new THREE.PointLight(0x7ab8ff, 8, 14, 2); l.position.copy(glass.position);
    const g = new THREE.Group(); g.add(post, glass, h, l);
    g.position.set(x, lerp(-0.9, 1.6, (x - 12) / 36), z); g.rotation.y = rand(-0.4, 0.4);
    scene.add(g);
  }
  // hills: the ridge behind the forest and a far headland across the bay, fog-grey silhouettes against the sky
  const hillMat = new THREE.MeshStandardMaterial({ color: 0x1c2230, roughness: 1, flatShading: true });
  const hills = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), hillMat, 16);
  for (let i = 0; i < 16; i++) {
    const far = i < 10;
    dummy.position.set(far ? rand(170, 300) : rand(-280, -60), -6, far ? rand(-430, -260) : rand(-420, -360));
    dummy.rotation.set(0, rand(0, TAU), 0); dummy.scale.set(rand(50, 90), far ? rand(45, 80) : rand(14, 26), rand(50, 90)); dummy.updateMatrix();
    hills.setMatrixAt(i, dummy.matrix);
  }
  hills.instanceMatrix.needsUpdate = true;
  scene.add(hills);

  // a wreck beached in the shallows: a split hull, a leaning mast, a torn yard
  const wreck = new THREE.Group();
  const hullGeo = new THREE.SphereGeometry(1, 18, 10, 0, TAU, Math.PI / 2, Math.PI / 2); hullGeo.scale(3.2, 3.6, 11); hullGeo.rotateX(Math.PI);
  const hullTex = wreckWood.clone(); hullTex.repeat.set(4, 2); hullTex.needsUpdate = true;
  const hullMat = new THREE.MeshStandardMaterial({ map: hullTex, color: 0x9a948c, roughness: 1, side: THREE.DoubleSide });
  const hull = new THREE.Mesh(hullGeo, hullMat); hull.position.y = 3.4; wreck.add(hull);
  const gunwale = new THREE.Mesh(new THREE.TorusGeometry(1, 0.22, 6, 24), hullMat); gunwale.scale.set(3.2, 11, 1); gunwale.rotation.x = Math.PI / 2; gunwale.position.y = 3.4; wreck.add(gunwale);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 22, 7), hullMat); mast.position.set(0, 13, -1); mast.rotation.z = 0.2; wreck.add(mast);
  const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 10, 5), hullMat); yard.rotation.z = Math.PI / 2 + 0.35; yard.position.set(-1.6, 18, -1); wreck.add(yard);
  const sail = new THREE.Mesh(new THREE.PlaneGeometry(6, 7), new THREE.MeshStandardMaterial({ color: 0x5a5650, roughness: 1, side: THREE.DoubleSide })); sail.position.set(-2.4, 14, -0.8); sail.rotation.set(0, 0.3, 0.3); wreck.add(sail);
  wreck.position.set(14, -2.4, -82); wreck.rotation.set(0.1, 0.6, 0.38);
  scene.add(wreck);
  const mast2 = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 16, 7), hullMat); mast2.position.set(-90, 3, -175); mast2.rotation.set(0.2, 0, -0.5);
  scene.add(mast2);

  // the cloud deck, scudding; the moon glows through it
  const cloudMat = new THREE.MeshBasicMaterial({ map: cloudTex, color: 0x1a2232, transparent: true, opacity: 0.92, depthWrite: false, fog: true });
  const clouds = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), cloudMat);
  clouds.rotation.x = Math.PI / 2; clouds.position.y = 95;
  cloudTex.repeat.set(5, 5);
  scene.add(clouds);
  const cloud2Tex = cloudTex.clone(); cloud2Tex.repeat.set(3, 3); cloud2Tex.needsUpdate = true;
  const clouds2 = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshBasicMaterial({ map: cloud2Tex, color: 0x2a3448, transparent: true, opacity: 0.6, depthWrite: false, fog: true }));
  clouds2.rotation.x = Math.PI / 2; clouds2.position.y = 130;
  scene.add(clouds2);
  const moon = makeMoon({ size: 30, haloSize: 340, opacity: 0.5, halo: 0x9fb2e0, color: 0xdfe6f4, discOpacity: 0.4 });
  scene.add(moon);

  // sea mist low over the water and the sand
  const MN = mobile ? 10 : 22;
  const mistMat = new THREE.SpriteMaterial({ map: glow(), color: 0x6a7890, transparent: true, opacity: 0.16, depthWrite: false });
  const mists = [];
  for (let i = 0; i < MN; i++) {
    const s = new THREE.Sprite(mistMat); const w = rand(20, 50); s.scale.set(w, w * 0.35, 1);
    s.userData = { x: rand(-80, 60), y: rand(1, 5), z: rand(-200, -20), v: rand(0.8, 2) };
    mists.push(s); scene.add(s);
  }

  // rain, slanting in from the sea
  const DN = mobile ? 300 : 900;
  const rainPos = new Float32Array(DN * 6);
  const drops = [];
  for (let i = 0; i < DN; i++) drops.push({ x: rand(-50, 50), y: rand(0, 45), z: rand(-80, 6), v: rand(18, 26) });
  const setDrop = i => { const d = drops[i], o = i * 6; rainPos[o] = d.x; rainPos[o + 1] = d.y; rainPos[o + 2] = d.z; rainPos[o + 3] = d.x - 0.18; rainPos[o + 4] = d.y + 1.1; rainPos[o + 5] = d.z; };
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0xaab8d0, transparent: true, opacity: 0.22 }));
  rain.frustumCulled = false;
  scene.add(rain);

  let flashAt = 5 + rand(0, 14);
  const look = new THREE.Vector3();
  const CLOUD = new THREE.Color(0x1a2232), CLOUD2 = new THREE.Color(0x2a3448), WHITE = new THREE.Color(0xe8eefc);
  function update(t, dt, io) {
    camera.position.set(8 + io.pointer.x * 1.6, 4.6 + Math.sin(t * 0.7) * 0.12 - io.pointer.y * 0.8, 0);
    look.set(-8 + Math.sin(t * 0.06) * 10 + io.pointer.x * 10, 5 - io.pointer.y * 4 - io.scroll * 4, -120);
    camera.lookAt(look);
    moon.position.copy(moonDir).multiplyScalar(330).add(camera.position);
    sky.position.copy(camera.position);
    seaMat.uniforms.uTime.value = t;
    cloudTex.offset.set(t * 0.004, t * 0.0015);
    cloud2Tex.offset.set(-t * 0.0025, t * 0.001);
    clouds.position.set(camera.position.x, 95, camera.position.z - 100);
    clouds2.position.set(camera.position.x, 130, camera.position.z - 100);

    // lightning far out over the sea
    let k = 0;
    const f = t - flashAt;
    if (f > 0) {
      if (f < 0.7) k = Math.max(0, Math.sin(f * 22) * Math.exp(-f * 5));
      else flashAt = t + rand(12, 36);
    }
    sky.material.uniforms.uLift.value = k * 0.35;
    hemi.intensity = 1.1 + k * 3;
    cloudMat.color.copy(CLOUD).lerp(WHITE, k * 0.6);
    clouds2.material.color.copy(CLOUD2).lerp(WHITE, k * 0.5);
    seaMat.uniforms.uFlash.value = k;

    for (const m of mists) { const u = m.userData; u.x += u.v * dt; if (u.x > 70) u.x = -90; m.position.set(u.x, u.y + Math.sin(t * 0.3 + u.z) * 0.4, u.z); }
    for (let i = 0; i < GN; i++) { const g = ghost[i]; ghosts.set(i, g.x + Math.sin(t * 0.25 + g.p) * 2.5, g.y + Math.sin(t * 0.5 + g.p * 2) * 0.6, g.z + Math.cos(t * 0.2 + g.p) * 2.5); }
    ghosts.commit(); ghosts.update(t, io);
    llight.intensity = 160 * (0.9 + 0.1 * Math.sin(t * 9) * Math.sin(t * 4.3));

    for (let i = 0; i < DN; i++) {
      const d = drops[i];
      d.y -= d.v * dt; d.x -= 3.2 * dt;
      if (d.y < -1) { d.y += 46; d.x = rand(-50, 50); }
      setDrop(i);
    }
    rainGeo.attributes.position.needsUpdate = true;
  }
  return { name: 'darkshore.lua', accent: '#4aa3ff', scene, camera, update };
}

// =====================================================================
// zone 3: the Deadmines. The Defias tunnels under Moonbrook: ochre rock,
// plank-lined walls, timber frames, cage lanterns on chains, torches,
// red banners, cobwebs, drips, an ore cart on rusted rails.
// =====================================================================
function deadmines({ mobile }) {
  const scene = new THREE.Scene();
  const FOGC = 0x0a0604;
  scene.background = new THREE.Color(FOGC);
  scene.fog = new THREE.FogExp2(FOGC, mobile ? 0.065 : 0.046);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.05, 300);
  camera.position.set(0, 0.9, 0);
  scene.add(new THREE.AmbientLight(0x3a2c24, 0.7));
  scene.add(new THREE.HemisphereLight(0x2a3a5a, 0x1a0e08, 1.2));
  const fill = new THREE.PointLight(0xc08a5a, 14, 18, 2);
  scene.add(fill);
  const deep = new THREE.PointLight(0x2a5a9a, 120, 90, 2);
  scene.add(deep);

  // textures
  const rockCol = (u, v) => {
    const n = fbm(u, v, 5, 5), c = fbm(u + 0.37, v + 0.11, 16, 3);
    const strata = 0.5 + 0.5 * Math.sin(u * TAU * 7 + n * 5);
    const crack = sstep(0.955, 1.0, 1 - Math.abs(c * 2 - 1)) * 0.5;
    return { n, crack, strata };
  };
  const rockTex = canvasTex('rock', 256, 256, (g, w, h) => pixels(g, w, h, (u, v) => {
    const { n, crack, strata } = rockCol(u, v);
    return scale3(mix3(hex(0x3a2a1e), hex(0x8a7056), clamp01(n * 1.25 - 0.15 + strata * 0.14)), 1 - crack * 0.6);
  }));
  const rockBump = canvasTex('rockbump', 256, 256, (g, w, h) => pixels(g, w, h, (u, v) => {
    const { n, crack, strata } = rockCol(u, v); const k = Math.round(255 * clamp01(n + strata * 0.1 - crack * 0.5));
    return [k, k, k];
  }), { srgb: false });
  const dirtTex = canvasTex('dirt', 256, 256, (g, w, h) => pixels(g, w, h, (u, v) => {
    const n = fbm(u, v, 6, 4), s = fbm(u + 0.2, v + 0.6, 50, 1);
    return mix3(hex(0x2e2219), hex(0x6a5340), clamp01(n * 1.2 - 0.1 + (s > 0.78 ? 0.2 : 0)));
  }));
  const rep = (t, x, y) => { const c = t.clone(); c.repeat.set(x, y); c.needsUpdate = true; return c; };
  const planks = plankTex('plank', 28, 30, 13, 21);
  const planksV = planks.clone(); planksV.rotation = Math.PI / 2; planksV.center.set(0.5, 0.5); planksV.needsUpdate = true;
  const barrelTex = canvasTex('barrel', 128, 128, g => {
    for (let i = 0; i < 8; i++) { g.fillStyle = `hsl(${rand(24, 32)}, 36%, ${rand(16, 24)}%)`; g.fillRect(i * 16, 0, 16, 128); g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(i * 16, 0, 1.5, 128); }
    g.fillStyle = '#2a2622'; g.fillRect(0, 18, 128, 10); g.fillRect(0, 100, 128, 10);
  });
  const webTex = canvasTex('web', 128, 128, g => {
    g.clearRect(0, 0, 128, 128); g.strokeStyle = 'rgba(230,230,240,0.5)'; g.lineWidth = 0.7;
    for (let i = 0; i <= 6; i++) { const a = i / 6 * Math.PI / 2; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * 128, Math.sin(a) * 128); g.stroke(); }
    for (let r = 14; r < 128; r += 13) { g.beginPath(); for (let i = 0; i <= 6; i++) { const a = i / 6 * Math.PI / 2, rr = r + rand(-3, 3); i ? g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.stroke(); }
  });
  const bannerTex = canvasTex('banner', 64, 128, g => {
    g.fillStyle = '#8a1a1a'; g.fillRect(0, 0, 64, 128);
    g.fillStyle = '#5a0e0e'; g.fillRect(0, 0, 64, 7); g.fillStyle = '#c9a24a'; g.fillRect(0, 7, 64, 2); g.fillRect(0, 100, 64, 2);
    // the Defias mask: a pale bandana shape with two dark eyes
    g.fillStyle = '#e8ded0'; g.beginPath(); g.moveTo(14, 40); g.quadraticCurveTo(32, 30, 50, 40); g.lineTo(46, 68); g.quadraticCurveTo(32, 80, 18, 68); g.closePath(); g.fill();
    g.fillStyle = '#3a0a0a'; g.beginPath(); g.ellipse(25, 52, 5, 3, -0.2, 0, TAU); g.fill(); g.beginPath(); g.ellipse(39, 52, 5, 3, 0.2, 0, TAU); g.fill();
    g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.moveTo(0, 128); g.lineTo(11, 110); g.lineTo(22, 128); g.lineTo(33, 106); g.lineTo(44, 128); g.lineTo(54, 112); g.lineTo(64, 128); g.closePath(); g.fill();
  });

  // the tunnel: two rock segments carved with value noise, seamless at the joins, leapfrogging ahead
  const SEG = 120, R = 6, AXIS = 1.5, RINGS = mobile ? 60 : 110, SIDES = mobile ? 18 : 28;
  const carve = (cx, sy, zz) => {
    const at = z => 1.5 * vnoise3(cx * 1.3, sy * 1.3, z * 0.045) + 0.7 * vnoise3(cx * 3.2, sy * 3.2, z * 0.16) + 0.4 * vnoise3(cx * 9, sy * 9, z * 0.55);
    const w = Math.min(1, zz / 14, (SEG - zz) / 14);
    const ws = w * w * (3 - 2 * w);
    return at(0) * (1 - ws) + at(zz) * ws;
  };
  const wallRadius = (a, z) => { const zz = (((z - 10) % SEG) + SEG) % SEG; return R + carve(Math.cos(a), Math.sin(a), zz); };
  const rockMat = new THREE.MeshStandardMaterial({ map: rep(rockTex, 6, 20), bumpMap: rep(rockBump, 6, 20), bumpScale: 0.8, roughness: 1, flatShading: true, side: THREE.BackSide });
  const makeTube = () => {
    const geo = new THREE.CylinderGeometry(R, R, SEG, SIDES, RINGS, true); geo.rotateX(Math.PI / 2);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const a = Math.atan2(y, x), cx = Math.cos(a), sy = Math.sin(a);
      const r = R + carve(cx, sy, z + SEG / 2);
      p.setXYZ(i, cx * r, sy * r + AXIS, z);
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, rockMat); m.frustumCulled = false; return m;
  };
  const tubes = [makeTube(), makeTube()];
  tubes[0].position.z = 10 - SEG / 2;
  tubes[1].position.z = tubes[0].position.z - SEG;
  scene.add(tubes[0], tubes[1]);

  const floorMat = new THREE.MeshStandardMaterial({ map: rep(dirtTex, 3, 50), bumpMap: rep(rockBump, 3, 50), bumpScale: 0.25, roughness: 1 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 300), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.position.y = -2.2;
  scene.add(floor);
  const railMat = new THREE.MeshStandardMaterial({ color: 0x6a4a36, roughness: 0.55, metalness: 0.6 });
  const rails = [-0.9, 0.9].map(x => { const r = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 300), railMat); r.position.set(x, -2.1, 0); return r; });
  scene.add(...rails);

  // ties, timber frames, plank walls, stalactites and rubble: all recycled as the camera passes them
  const dummy = new THREE.Object3D();
  const wood = new THREE.MeshStandardMaterial({ map: planksV, roughness: 1 });
  const woodH = new THREE.MeshStandardMaterial({ map: rep(planks, 3, 1), roughness: 1 });
  const TN = 150, TIE = 1.6;
  const ties = new THREE.InstancedMesh(new THREE.BoxGeometry(2.4, 0.14, 0.32), new THREE.MeshStandardMaterial({ color: 0x2e2015, roughness: 1 }), TN);
  const FN = 26, FRAME = 9;
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 4.8, 0.42), wood, FN * 2);
  const beams = new THREE.InstancedMesh(new THREE.BoxGeometry(9.2, 0.48, 0.48), woodH, FN);
  const braces = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 1.8, 0.3), wood, FN * 2);
  const wallMat = new THREE.MeshStandardMaterial({ map: rep(planks, 2, 1), roughness: 1 });
  const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 3.0, FRAME - 0.5), wallMat, FN * 2);
  const SN = mobile ? 30 : 70;
  const stalGeo = new THREE.ConeGeometry(0.32, 2.2, 6); stalGeo.rotateX(Math.PI); stalGeo.translate(0, -1.0, 0);
  const rubbleMat = new THREE.MeshStandardMaterial({ map: rep(rockTex, 1, 1), roughness: 1, flatShading: true });
  const stals = new THREE.InstancedMesh(stalGeo, rubbleMat, SN);
  const BN = mobile ? 30 : 64;
  const rubble = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.5, 0), rubbleMat, BN);
  for (const m of [ties, posts, beams, braces, walls, stals, rubble]) m.frustumCulled = false;
  const tieZ = [], frameZ = [], frameWall = [], stal = [], rub = [];
  const setTie = i => { dummy.position.set(0, -2.18, tieZ[i]); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); ties.setMatrixAt(i, dummy.matrix); };
  const setFrame = i => {
    dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1);
    dummy.position.set(-4.1, 0.1, frameZ[i]); dummy.updateMatrix(); posts.setMatrixAt(i * 2, dummy.matrix);
    dummy.position.set(4.1, 0.1, frameZ[i]); dummy.updateMatrix(); posts.setMatrixAt(i * 2 + 1, dummy.matrix);
    dummy.position.set(0, 2.5, frameZ[i]); dummy.updateMatrix(); beams.setMatrixAt(i, dummy.matrix);
    dummy.position.set(-3.5, 1.9, frameZ[i]); dummy.rotation.set(0, 0, -0.75); dummy.updateMatrix(); braces.setMatrixAt(i * 2, dummy.matrix);
    dummy.position.set(3.5, 1.9, frameZ[i]); dummy.rotation.set(0, 0, 0.75); dummy.updateMatrix(); braces.setMatrixAt(i * 2 + 1, dummy.matrix);
    dummy.rotation.set(0, 0, 0);
    for (const s of [0, 1]) {
      const on = frameWall[i][s];
      dummy.position.set((s ? 1 : -1) * 4.35, -0.7, frameZ[i] - FRAME / 2); dummy.scale.setScalar(on ? 1 : 0); dummy.updateMatrix(); walls.setMatrixAt(i * 2 + s, dummy.matrix);
    }
    dummy.scale.setScalar(1);
  };
  const newStal = z => { const a = rand(-0.95, 0.95); const r = wallRadius(Math.PI / 2 - a, z) - 0.3; return { z, x: Math.sin(a) * r, y: AXIS + Math.cos(a) * r, s: rand(0.4, 1.2), rx: rand(-0.15, 0.15), rz: rand(-0.15, 0.15) }; };
  const setStal = i => { const s = stal[i]; dummy.position.set(s.x, s.y, s.z); dummy.rotation.set(s.rx, 0, s.rz); dummy.scale.set(s.s, s.s, s.s); dummy.updateMatrix(); stals.setMatrixAt(i, dummy.matrix); };
  const newRub = z => { const s = rand(0.35, 1.3); return { z, x: (Math.random() < 0.5 ? -1 : 1) * rand(2.4, 4.8), s, ry: rand(0, TAU) }; };
  const setRub = i => { const r = rub[i]; dummy.position.set(r.x, -2.2 + r.s * 0.3, r.z); dummy.rotation.set(0, r.ry, 0); dummy.scale.set(r.s, r.s * 0.7, r.s); dummy.updateMatrix(); rubble.setMatrixAt(i, dummy.matrix); };
  for (let i = 0; i < TN; i++) { tieZ.push(6 - i * TIE); setTie(i); }
  for (let i = 0; i < FN; i++) { frameZ.push(4 - i * FRAME); frameWall.push([Math.random() < 0.4, Math.random() < 0.4]); setFrame(i); }
  for (let i = 0; i < SN; i++) { stal.push(newStal(rand(-2 * SEG, 6))); setStal(i); }
  for (let i = 0; i < BN; i++) { rub.push(newRub(rand(-2 * SEG, 6))); setRub(i); }
  for (const m of [ties, posts, beams, braces, walls, stals, rubble]) m.instanceMatrix.needsUpdate = true;
  scene.add(ties, posts, beams, braces, walls, stals, rubble);

  // Defias clutter: crates and barrels along the walls, banners hanging from every third frame
  const KN = mobile ? 14 : 30;
  const crates = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ map: rep(planks, 1, 0.5), roughness: 1 }), KN);
  const RBN = mobile ? 10 : 20;
  const barrels = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.42, 0.42, 1.1, 12), new THREE.MeshStandardMaterial({ map: rep(barrelTex, 3, 1), roughness: 0.9 }), RBN);
  crates.frustumCulled = barrels.frustumCulled = false;
  const crate = [], barrel = [];
  const eul = new THREE.Euler();
  const newCrate = z => { const sc = rand(0.6, 1.15); return { z, x: (Math.random() < 0.5 ? -1 : 1) * rand(2.9, 4.0), sc, ry: rand(-0.4, 0.4) + (Math.random() < 0.5 ? 0 : Math.PI / 2) }; };
  const setCrate = i => { const k = crate[i]; dummy.position.set(k.x, -2.2 + k.sc / 2, k.z); dummy.rotation.set(0, k.ry, 0); dummy.scale.setScalar(k.sc); dummy.updateMatrix(); crates.setMatrixAt(i, dummy.matrix); };
  const newBarrel = z => ({ z, x: (Math.random() < 0.5 ? -1 : 1) * rand(2.8, 4.1), lying: Math.random() < 0.4, ry: rand(0, TAU) });
  const setBarrel = i => {
    const b = barrel[i]; dummy.scale.setScalar(1);
    if (b.lying) { dummy.position.set(b.x, -2.2 + 0.42, b.z); dummy.setRotationFromEuler(eul.set(Math.PI / 2, b.ry, 0, 'YXZ')); }
    else { dummy.position.set(b.x, -2.2 + 0.55, b.z); dummy.setRotationFromEuler(eul.set(0, b.ry, 0, 'YXZ')); }
    dummy.updateMatrix(); barrels.setMatrixAt(i, dummy.matrix); dummy.rotation.order = 'XYZ';
  };
  for (let i = 0; i < KN; i++) { crate.push(newCrate(rand(-2 * SEG, 6))); setCrate(i); }
  for (let i = 0; i < RBN; i++) { barrel.push(newBarrel(rand(-2 * SEG, 6))); setBarrel(i); }
  crates.instanceMatrix.needsUpdate = barrels.instanceMatrix.needsUpdate = true;
  scene.add(crates, barrels);
  const bannerGeo = new THREE.PlaneGeometry(1.1, 2.4, 1, 6); bannerGeo.translate(0, -1.2, 0);
  const bannerMat = new THREE.MeshStandardMaterial({ map: bannerTex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1 });
  const banners = [];
  for (let i = 0; i < FN; i += 3) { const b = new THREE.Mesh(bannerGeo, bannerMat); b.userData.frame = i; b.userData.x = (i / 3) % 2 ? 2.6 : -2.6; banners.push(b); scene.add(b); }
  const placeBanner = b => b.position.set(b.userData.x, 2.26, frameZ[b.userData.frame] - 0.3);
  banners.forEach(placeBanner);
  const webMat = new THREE.MeshBasicMaterial({ map: webTex, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
  const webs = [];
  for (let i = 1; i < FN; i += 4) { const w = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), webMat); w.userData.frame = i; w.userData.side = (i / 4) % 2 < 1 ? -1 : 1; webs.push(w); scene.add(w); }
  const placeWeb = w => { const s = w.userData.side; w.position.set(s * 3.35, 1.7, frameZ[w.userData.frame] - 0.3); w.scale.x = -s; };
  webs.forEach(placeWeb);

  // light: torches on even frames (alternating sides), cage lanterns on chains on odd frames
  const emitters = [];
  const flameMat = new THREE.SpriteMaterial({ map: glow(), color: 0xffa040, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.95 });
  const flameCore = new THREE.SpriteMaterial({ map: glow(), color: 0xfff0b0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9 });
  const hazeMat = new THREE.SpriteMaterial({ map: glow(), color: 0xff7a22, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.14 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x3a322c, roughness: 0.7, metalness: 0.6 });
  let tnow = 0;
  const flick = (seed, k) => () => 0.8 + 0.2 * (0.5 * Math.sin(tnow * 13 + seed * 1.7) + 0.5 * Math.sin(tnow * 7.3 + seed * 4.1)) + (Math.random() - 0.5) * 0.08 * k;
  for (let i = 0; i < FN; i++) {
    const g = new THREE.Group();
    if (i % 2 === 0) {
      const side = (i / 2) % 2 ? 1 : -1;
      const flame = new THREE.Sprite(flameMat); flame.scale.set(1.5, 2.4, 1); flame.position.y = 0.45;
      const core = new THREE.Sprite(flameCore); core.scale.set(0.5, 0.9, 1); core.position.y = 0.25;
      const haze = new THREE.Sprite(hazeMat); haze.scale.setScalar(10);
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.08, 0.3, 7), iron); cup.position.y = -0.05;
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 5), wood); stick.position.y = -0.55;
      const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.06), iron); bracket.position.set(side * 0.25, -0.8, 0);
      g.add(haze, flame, core, cup, stick, bracket);
      g.userData = { kind: 'torch', frame: i, side, flame, core, lightColor: 0xff8c38, lightOffset: new THREE.Vector3(side * -0.5, 0.4, 0), flicker: flick(i, 1) };
    } else {
      const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.7, 4), iron); chain.position.y = 0.6;
      const cage = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.38, 0.3, 2, 2, 2), new THREE.MeshBasicMaterial({ color: 0x0c0a08, wireframe: true }));
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.14, 6), iron); cap.position.y = 0.26;
      const core = new THREE.Sprite(flameCore); core.scale.setScalar(0.7);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: 0xffc060, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 })); halo.scale.setScalar(3);
      g.add(chain, cage, cap, core, halo);
      g.userData = { kind: 'lantern', frame: i, x: rand(-2, 2), lightColor: 0xffb860, lightOffset: new THREE.Vector3(0, -0.2, 0), flicker: flick(i, 0.3) };
    }
    emitters.push(g); scene.add(g);
  }
  const placeEmitter = g => {
    const u = g.userData;
    if (u.kind === 'torch') g.position.set(u.side * 3.74, 1.1, frameZ[u.frame] - 0.35);
    else g.position.set(u.x, 1.3, frameZ[u.frame] - 0.4);
  };
  emitters.forEach(placeEmitter);
  const pool = lightPool(scene, 7, 0xff8c38, 48, 28);

  // carts: one rolling ahead with glowing ore, two wrecked beside the rails
  const makeCart = ore => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.95, 2.3), iron); body.position.y = 0.75; g.add(body);
    const rim = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.12, 2.45), iron); rim.position.y = 1.2; g.add(rim);
    for (const [x, z] of [[-0.95, -0.7], [0.95, -0.7], [-0.95, 0.7], [0.95, 0.7]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.12, 10), iron); w.rotation.z = Math.PI / 2; w.position.set(x, 0.24, z); g.add(w);
    }
    if (ore) {
      const om = new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: 0xff8c1a, emissiveIntensity: 1.2, roughness: 0.5 });
      for (let i = 0; i < 8; i++) { const o = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 0), om); o.position.set(rand(-0.5, 0.5), 1.25 + rand(0, 0.3), rand(-0.8, 0.8)); o.rotation.set(rand(0, TAU), rand(0, TAU), 0); g.add(o); }
      const l = new THREE.PointLight(0xffa040, 8, 7, 2); l.position.y = 1.7; g.add(l);
    }
    return g;
  };
  const rolling = makeCart(true); rolling.position.set(0, -2.03, -18); scene.add(rolling);
  const wrecks = [makeCart(false), makeCart(false)];
  wrecks[0].position.set(2.9, -2.0, -48); wrecks[0].rotation.set(0.1, 0.5, 1.45);
  wrecks[1].position.set(-3.0, -2.1, -118); wrecks[1].rotation.set(-0.05, -0.8, -1.3);
  scene.add(...wrecks);

  // embers, smoke, hanging dust, and water dripping from the roof
  const EN = mobile ? 90 : 220;
  const embers = new GlowPoints(EN, { color: 0xff8a3a, size: [0.08, 0.26], flicker: 0.9, far: 45 });
  const eb = [];
  for (let i = 0; i < EN; i++) eb.push({ x: rand(-3.2, 3.2), y: rand(-2, 2.8), z: rand(-110, 4), p: rand(0, TAU) });
  scene.add(embers.mesh);
  const HN = mobile ? 20 : 50;
  const dust = new GlowPoints(HN, { color: 0xa07858, size: [2.2, 4.5], flicker: 0.3, far: 40, opacity: 0.07 });
  const db = [];
  for (let i = 0; i < HN; i++) db.push({ x: rand(-4, 4), y: rand(-1.5, 3), z: rand(-60, 4), p: rand(0, TAU) });
  scene.add(dust.mesh);
  const SMN = mobile ? 0 : 60;
  const smoke = new GlowPoints(SMN, { color: 0x100c0a, size: [0.6, 1.6], flicker: 0.2, far: 30, opacity: 0.35, blending: THREE.NormalBlending });
  const sm = [];
  for (let i = 0; i < SMN; i++) sm.push({ t: rand(0, 1), v: rand(0.3, 0.6), dx: rand(-0.2, 0.2) });
  scene.add(smoke.mesh);
  const DRN = mobile ? 20 : 50;
  const dripPos = new Float32Array(DRN * 6);
  const drip = [];
  for (let i = 0; i < DRN; i++) drip.push({ x: rand(-3, 3), y: rand(-2, 5), z: rand(-90, 4), v: rand(4, 7) });
  const dripGeo = new THREE.BufferGeometry(); dripGeo.setAttribute('position', new THREE.BufferAttribute(dripPos, 3));
  const drips = new THREE.LineSegments(dripGeo, new THREE.LineBasicMaterial({ color: 0x9ab0c0, transparent: true, opacity: 0.35 }));
  drips.frustumCulled = false; scene.add(drips);

  let dist = 0;
  const SPEED = 1.1;
  const look = new THREE.Vector3();
  function update(t, dt, io) {
    tnow = t;
    dist += dt * SPEED;
    const cz = -dist;
    camera.position.set(Math.sin(t * 0.3) * 0.35 + io.pointer.x * 0.5, 0.9 + Math.sin(t * 1.3) * 0.05 - io.pointer.y * 0.3, cz);
    look.set(io.pointer.x * 2, 0.5 - io.pointer.y * 1.2 - io.scroll * 1.4, cz - 12);
    camera.lookAt(look);
    fill.position.set(camera.position.x, camera.position.y + 0.5, cz - 1);
    deep.position.set(0, 0.5, cz - 52);
    floor.position.z = cz - 100; rails[0].position.z = rails[1].position.z = cz - 100;

    for (const tube of tubes) if (tube.position.z - SEG / 2 > cz + 8) tube.position.z -= 2 * SEG;

    let dirty = false;
    for (let i = 0; i < TN; i++) if (tieZ[i] > cz + 4) { tieZ[i] -= TN * TIE; setTie(i); dirty = true; }
    if (dirty) ties.instanceMatrix.needsUpdate = true;
    dirty = false;
    for (let i = 0; i < FN; i++) if (frameZ[i] > cz + 4) { frameZ[i] -= FN * FRAME; frameWall[i] = [Math.random() < 0.4, Math.random() < 0.4]; setFrame(i); dirty = true; }
    if (dirty) { posts.instanceMatrix.needsUpdate = beams.instanceMatrix.needsUpdate = braces.instanceMatrix.needsUpdate = walls.instanceMatrix.needsUpdate = true; emitters.forEach(placeEmitter); banners.forEach(placeBanner); webs.forEach(placeWeb); }
    banners.forEach((b, i) => { b.rotation.x = Math.sin(t * 1.3 + i * 1.9) * 0.07; });
    for (const g of emitters) if (g.userData.kind === 'lantern') g.rotation.set(Math.sin(t * 0.9 + g.userData.frame) * 0.05, 0, Math.cos(t * 0.7 + g.userData.frame) * 0.05);
    dirty = false;
    for (let i = 0; i < KN; i++) if (crate[i].z > cz + 4) { crate[i] = newCrate(crate[i].z - 2 * SEG - 6); setCrate(i); dirty = true; }
    if (dirty) crates.instanceMatrix.needsUpdate = true;
    dirty = false;
    for (let i = 0; i < RBN; i++) if (barrel[i].z > cz + 4) { barrel[i] = newBarrel(barrel[i].z - 2 * SEG - 6); setBarrel(i); dirty = true; }
    if (dirty) barrels.instanceMatrix.needsUpdate = true;
    dirty = false;
    for (let i = 0; i < SN; i++) if (stal[i].z > cz + 4) { stal[i] = newStal(stal[i].z - 2 * SEG - 6); setStal(i); dirty = true; }
    if (dirty) stals.instanceMatrix.needsUpdate = true;
    dirty = false;
    for (let i = 0; i < BN; i++) if (rub[i].z > cz + 4) { rub[i] = newRub(rub[i].z - 2 * SEG - 6); setRub(i); dirty = true; }
    if (dirty) rubble.instanceMatrix.needsUpdate = true;

    // flicker the flames, and hand the real lights to the nearest emitters ahead
    for (const g of emitters) {
      const u = g.userData;
      if (u.kind === 'torch') { const n = u.flicker(); u.flame.scale.set(1.5 * (0.85 + n * 0.25), 2.4 * (0.8 + n * 0.3), 1); u.core.scale.set(0.5 * n, 0.9 * n, 1); }
    }
    pool(emitters, cz);

    rolling.position.z -= dt * (SPEED - 0.3);
    if (rolling.position.z > cz + 3) rolling.position.z = cz - 70;
    rolling.rotation.x = Math.sin(t * 9) * 0.004;
    for (const w of wrecks) if (w.position.z > cz + 4) w.position.z -= 2 * SEG + rand(0, 40);

    for (let i = 0; i < EN; i++) {
      const e = eb[i];
      e.y += 0.55 * dt; e.x += Math.sin(t * 1.3 + e.p) * 0.25 * dt;
      if (e.y > 2.9) { e.y = rand(-2, -1); e.x = rand(-3.2, 3.2); }
      if (e.z > cz + 2) e.z -= 112;
      embers.set(i, e.x, e.y, e.z);
    }
    embers.commit(); embers.update(t, io);
    for (let i = 0; i < HN; i++) {
      const d = db[i];
      if (d.z > cz + 3) d.z -= 62;
      dust.set(i, d.x + Math.sin(t * 0.2 + d.p) * 0.8, d.y + Math.sin(t * 0.17 + d.p * 2) * 0.5, d.z);
    }
    dust.commit(); dust.update(t, io);
    // smoke rises from the nearest torches
    const torches = emitters.filter(g => g.userData.kind === 'torch' && g.position.z < cz + 4 && g.position.z > cz - 40);
    for (let i = 0; i < SMN; i++) {
      const s = sm[i]; s.t += s.v * dt; if (s.t > 1) { s.t = 0; s.dx = rand(-0.2, 0.2); }
      const g = torches[i % Math.max(1, torches.length)];
      if (g) smoke.set(i, g.position.x + s.dx * s.t * 4 + Math.sin(t + i) * 0.1, g.position.y + 0.7 + s.t * 1.6, g.position.z); else smoke.set(i, 0, -50, 0);
    }
    smoke.commit(); smoke.update(t, io);
    for (let i = 0; i < DRN; i++) {
      const d = drip[i]; d.y -= d.v * dt;
      if (d.y < -2.2) { d.y = rand(3, 5.5); d.x = rand(-3, 3); }
      if (d.z > cz + 2) d.z -= 94;
      const o = i * 6; dripPos[o] = d.x; dripPos[o + 1] = d.y; dripPos[o + 2] = d.z; dripPos[o + 3] = d.x; dripPos[o + 4] = d.y + 0.25; dripPos[o + 5] = d.z;
    }
    dripGeo.attributes.position.needsUpdate = true;
  }
  return { name: 'deadmines.lua', accent: '#ff8000', scene, camera, update };
}

const ZONES = [teldrassil, darkshore, deadmines];

// ---------- the loop ----------
export function start(canvas, opts = {}) {
  const wanted = (opts.zones ?? []).map((z) => String(z).toLowerCase().replace(/\.lua$/, ''));
  const pool = wanted.length ? ZONES.filter((z) => wanted.includes(z.name)) : ZONES;
  if (!pool.length) return null;
  const mobile = !matchMedia('(hover: hover) and (pointer: fine)').matches || innerWidth < 700;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, alpha: false, powerPreference: 'low-power' });
  } catch { return null; }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1 : 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;

  const io = { pointer: { x: 0, y: 0 }, scroll: 0, height: 800 };
  const target = { x: 0, y: 0 };
  if (!mobile) addEventListener('pointermove', e => { target.x = e.clientX / innerWidth * 2 - 1; target.y = e.clientY / innerHeight * 2 - 1; }, { passive: true });

  let order = pool.map((_, i) => i), pos = 0;
  try {
    const s = JSON.parse(sessionStorage.getItem('guildhall-zones') || 'null');
    if (s && Array.isArray(s.order) && s.order.length === pool.length) { order = s.order; pos = Math.min(pool.length - 1, Math.max(0, s.pos | 0)); }
    else shuffle(order);
  } catch { shuffle(order); }
  const q = new URLSearchParams(location.search);
  if (q.has('scene')) {
    const v = q.get('scene');
    const byName = pool.findIndex(z => z.name === v);
    const n = byName >= 0 ? byName : Math.min(pool.length, Math.max(1, Number(v) || 1)) - 1;
    pos = order.indexOf(n);
  }

  const ctx = { mobile, renderer };
  let zone = null;
  function load() {
    zone = pool[order[pos]](ctx);
    zone.camera.aspect = innerWidth / innerHeight; zone.camera.updateProjectionMatrix();
    try { sessionStorage.setItem('guildhall-zones', JSON.stringify({ order, pos })); } catch {}
    dispatchEvent(new CustomEvent('scenechange', { detail: { name: zone.name, n: pos + 1, of: order.length, accent: zone.accent } }));
  }
  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    if (zone) { zone.camera.aspect = innerWidth / innerHeight; zone.camera.updateProjectionMatrix(); }
  }
  addEventListener('resize', resize);
  load(); resize();

  const HOLD = 80000, FADE = 650;
  let next = performance.now() + HOLD, fading = null, shown = false, last = performance.now();
  function step(d) {
    if (fading) return;
    fading = { at: performance.now(), d };
    canvas.style.transitionDuration = FADE + 'ms';
    canvas.classList.remove('on');
  }
  addEventListener('scenestep', () => step(1));

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    const t = now / 1000;
    if (fading && now - fading.at >= FADE) {
      disposeScene(zone.scene);
      pos = (pos + fading.d + order.length) % order.length;
      load();
      fading = null; next = now + HOLD;
      canvas.classList.add('on');
      setTimeout(() => { canvas.style.transitionDuration = ''; }, FADE + 50);
    } else if (!fading && now > next) step(1);
    io.pointer.x += (target.x - io.pointer.x) * 0.04;
    io.pointer.y += (target.y - io.pointer.y) * 0.04;
    io.scroll = Math.min(scrollY / innerHeight, 3);
    io.height = renderer.domElement.height;
    zone.update(t, dt, io);
    renderer.render(zone.scene, zone.camera);
    if (!shown) { shown = true; canvas.classList.add('on'); }
  }
  requestAnimationFrame(frame);
  return { step };
}
