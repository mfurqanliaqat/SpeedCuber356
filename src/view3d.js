import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { SLOTS, MOVES, SOLVED, dot, formatMove } from './cube.js';
import logoUrl from './assets/gan-logo.png';

// GAN cubes report white on U, green on F, red on R. Bright stickerless plastic shades.
export const GAN_SCHEME = { U: '#eef0f4', F: '#00a84f', R: '#e0202e', D: '#ffd60a', L: '#ff7a12', B: '#1f5fe0' };

// Solve orientations: how the whole cube is turned for display.
export const ORIENTATIONS = {
  'white-top': new THREE.Quaternion(),
  'yellow-top': new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI), // z2, green front
};

/** White centre cap with the GAN logo (multiplied with the tile colour). */
function logoTexture(onReady) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, 512, 512);
  // Round centre cap: a faint ring around the logo.
  g.strokeStyle = '#d6d9df';
  g.lineWidth = 10;
  g.beginPath();
  g.arc(256, 256, 200, 0, Math.PI * 2);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  const img = new Image();
  img.onload = () => {
    g.drawImage(img, 256 - 170, 256 - 170, 340, 340); // logo has a white background
    t.needsUpdate = true;
    onReady();
  };
  img.src = logoUrl;
  return t;
}

// Tile corners in shape space, in the order roundedSquare takes their radii.
const CORNERS = [[1, -1], [1, 1], [-1, 1], [-1, -1]];
const ROUND = 0.34, SQUARE = 0.09;

function roundedSquare(size, [br, tr, tl, bl]) {
  const s = size / 2, shape = new THREE.Shape();
  shape.moveTo(-s + bl, -s);
  shape.lineTo(s - br, -s); shape.quadraticCurveTo(s, -s, s, -s + br);
  shape.lineTo(s, s - tr); shape.quadraticCurveTo(s, s, s - tr, s);
  shape.lineTo(-s + tl, s); shape.quadraticCurveTo(-s, s, -s, s - tl);
  shape.lineTo(-s, -s + bl); shape.quadraticCurveTo(-s, -s, -s + bl, -s);
  return shape;
}

/** A coloured face tile: slightly domed, soft edges, like stickerless plastic. */
const tileCache = new Map();
function tileGeometry(radii) {
  const key = radii.join();
  if (tileCache.has(key)) return tileCache.get(key);
  const g = new THREE.ExtrudeGeometry(roundedSquare(0.94, radii), {
    depth: 0.01, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.02, bevelSegments: 5, curveSegments: 10,
  });
  // Planar UVs across the face so the logo texture maps onto the centre cap.
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 0.98 + 0.5, pos.getY(i) / 0.98 + 0.5);
  tileCache.set(key, g);
  return g;
}

/**
 * GAN-style tile shapes: centres are rounded on all four corners, edges only
 * on the two corners next to the centre, corners stay square.
 */
function tileRadii(slot, quat) {
  const n = new THREE.Vector3(...slot.n);
  const off = new THREE.Vector3(...slot.pos).addScaledVector(n, -1); // position within the face
  const kind = [off.x, off.y, off.z].filter((v) => v !== 0).length; // 0 centre, 1 edge, 2 corner
  const ax = new THREE.Vector3(1, 0, 0).applyQuaternion(quat);
  const ay = new THREE.Vector3(0, 1, 0).applyQuaternion(quat);
  return CORNERS.map(([sx, sy]) => {
    if (kind === 0) return ROUND;
    if (kind === 2) return SQUARE;
    const toward = ax.clone().multiplyScalar(sx).addScaledVector(ay, sy).dot(off) < 0;
    return toward ? ROUND : SQUARE;
  });
}

/**
 * Flat arrow along +y, centred on the origin, for painting onto a strip of
 * three stickers. `pad` grows it evenly (for the outline); `heads` = 2 adds a
 * second chevron for half turns.
 */
function arrowShape(heads, pad = 0) {
  const L = 2.55, w = 0.13 + pad, hw = 0.4 + pad, hl = 0.55 + pad;
  const top = L / 2 + pad, base = -L / 2 - pad, s = new THREE.Shape();
  const back = top - hl * 0.95; // second head sits right behind the first
  s.moveTo(-w, base + w);
  s.quadraticCurveTo(-w, base, 0, base);
  s.quadraticCurveTo(w, base, w, base + w);
  if (heads === 2) { s.lineTo(w, back - hl); s.lineTo(hw, back - hl); s.lineTo(w, back); }
  s.lineTo(w, top - hl); s.lineTo(hw, top - hl); s.lineTo(0, top);
  s.lineTo(-hw, top - hl); s.lineTo(-w, top - hl);
  if (heads === 2) { s.lineTo(-w, back); s.lineTo(-hw, back - hl); s.lineTo(-w, back - hl); }
  s.lineTo(-w, base + w);
  return new THREE.ShapeGeometry(s, 8);
}

/**
 * Live 3D cube. Turns animate a pivot holding one layer; when the animation
 * ends the cubies snap home and every sticker is repainted from the model, so
 * the picture can never drift from the state.
 */
export class CubeView {
  constructor(container, { scheme = GAN_SCHEME, speed = 90, logo = scheme === GAN_SCHEME } = {}) {
    this.container = container;
    this.scheme = scheme;
    this.speed = speed; // ms per quarter turn
    this.state = SOLVED;
    this.anim = null;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 0.85;
    container.appendChild(this.renderer.domElement);
    this.flash = document.createElement('div');
    this.flash.className = 'move-flash';
    container.appendChild(this.flash);

    this.scene = new THREE.Scene();
    // Soft studio reflections give the frosted plastic its sheen.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    this.camera.position.set(5.3, 4.8, 7.6);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x30302c, 0.5));
    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(3, 6, 4);
    this.scene.add(sun);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enablePan = false;
    this.controls.enableZoom = false;
    this.controls.enableDamping = true;

    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.targetQuat = new THREE.Quaternion();
    this.hint = null;

    // Stickerless: tiles cover almost the whole piece; the light core only
    // shows in hairline gaps and inside a turning layer, like the real plastic.
    const body = new RoundedBoxGeometry(0.93, 0.93, 0.93, 4, 0.12);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xc4c7cd, roughness: 0.6 });
    const logoMap = logo ? logoTexture(() => { this.dirty = true; }) : null;
    this.cubies = new Map();
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
      if (!x && !y && !z) continue;
      const g = new THREE.Group();
      g.position.set(x, y, z);
      g.userData.home = [x, y, z];
      g.add(new THREE.Mesh(body, bodyMat));
      this.root.add(g);
      this.cubies.set(`${x},${y},${z}`, g);
    }
    this.stickers = SLOTS.map((s, i) => {
      // Frosted finish: fairly rough, a light clearcoat for the soft highlight.
      const mat = new THREE.MeshPhysicalMaterial({ roughness: 0.42, clearcoat: 0.25, clearcoatRoughness: 0.5, envMapIntensity: 0.35 });
      if (logoMap && i === 4) mat.map = logoMap; // white centre (U)
      const n = new THREE.Vector3(...s.n);
      const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
      const m = new THREE.Mesh(tileGeometry(tileRadii(s, quat)), mat);
      m.position.copy(n).multiplyScalar(0.452);
      m.quaternion.copy(quat);
      this.cubies.get(s.pos.join(',')).add(m);
      return mat;
    });

    this.paint();
    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.renderer.setAnimationLoop((t) => this.frame(t));
  }

  resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  paint() {
    this.stickers.forEach((mat, i) => mat.color.set(this.scheme[this.state[i]]));
    this.dirty = true;
  }

  /** Jump to a state without animation. */
  setState(facelets) {
    this.finish();
    this.state = facelets;
    this.paint();
  }

  /** Animate a turn; `facelets` is the model state after the turn. */
  turn(base, amount, facelets) {
    this.flashMove(base, amount);
    this.finish();
    const def = MOVES[base];
    const pivot = new THREE.Group();
    this.root.add(pivot);
    for (const g of this.cubies.values()) {
      if (def.inLayer(dot(g.userData.home, def.axis))) pivot.attach(g);
    }
    const angle = amount === 3 ? Math.PI / 2 : -Math.PI / 2 * amount;
    this.anim = {
      pivot, facelets, angle, start: performance.now(),
      duration: this.speed * (amount === 2 ? 1.5 : 1),
      axis: new THREE.Vector3(...def.axis),
    };
  }

  finish() {
    if (!this.anim) return;
    const { pivot, facelets } = this.anim;
    for (const g of [...pivot.children]) {
      this.root.add(g);
      g.position.set(...g.userData.home);
      g.quaternion.identity();
    }
    this.root.remove(pivot);
    this.anim = null;
    this.state = facelets;
    this.paint();
  }

  /**
   * Show the move just made over the cube for a moment. Quick repeats of the
   * same face merge (R, R → R2); `wrong()` recolours the current one.
   */
  flashMove(base, amount) {
    const t = performance.now(), prev = this.flashState;
    let total = amount;
    if (prev && prev.base === base && t - prev.at < 600) total = (prev.amount + amount) % 4;
    this.flashState = { base, amount: total, at: t };
    const el = this.flash;
    el.classList.remove('show', 'wrong');
    if (!total) return;
    el.textContent = formatMove({ base, amount: total });
    void el.offsetWidth; // restart the animation
    el.classList.add('show');
  }

  wrong() { this.flash.classList.add('wrong'); }

  /** Turn the whole cube for display (e.g. yellow on top while solving). */
  orient(name) {
    this.targetQuat.copy(ORIENTATIONS[name] || ORIENTATIONS['white-top']);
  }

  /**
   * Show animated arrows for the next move ("R", "U2", "F'"), or hide them
   * with null. One flat arrow lies on the layer's three stickers on each of
   * the four faces beside it; the cube hides the ones facing away.
   */
  setHint(move) {
    const key = move || '';
    if (this.hint?.key === key) return;
    if (this.hint) {
      this.root.remove(this.hint.group);
      this.hint.geos.forEach((g) => g.dispose());
    }
    this.hint = null;
    this.dirty = true;
    const base = move?.[0], def = MOVES[base];
    if (!def || !'URFDLB'.includes(base)) return;
    const amount = move.endsWith("'") ? 3 : move.endsWith('2') ? 2 : 1;
    const axis = new THREE.Vector3(...def.axis);
    // Drawn over the stickers: polygon offset wins the depth test against the tiles.
    const mat = (color) => new THREE.MeshBasicMaterial({ color, transparent: true, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const fill = mat(0x3c3c3c), edge = mat(0xffffff);
    const heads = amount === 2 ? 2 : 1;
    const fillGeo = arrowShape(heads), edgeGeo = arrowShape(heads, 0.07);
    const group = new THREE.Group(), arrows = [];
    for (const m of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      const n = new THREE.Vector3(...m);
      if (Math.abs(n.dot(axis)) > 0.5) continue; // only faces beside the layer
      // Stickers on this strip move along p × axis for a clockwise turn.
      const centre = axis.clone().add(n.clone().multiplyScalar(1.5));
      const dir = new THREE.Vector3().crossVectors(centre, axis).normalize();
      if (amount === 3) dir.negate();
      const x = new THREE.Vector3().crossVectors(dir, n);
      const a = new THREE.Group();
      a.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, dir, n));
      a.position.copy(centre).addScaledVector(n, 0.005);
      const outline = new THREE.Mesh(edgeGeo, edge);
      const body = new THREE.Mesh(fillGeo, fill);
      body.position.z = 0.004;
      body.renderOrder = 2;
      outline.renderOrder = 1;
      a.add(outline, body);
      a.userData = { centre: a.position.clone(), dir };
      group.add(a);
      arrows.push(a);
    }
    this.root.add(group);
    this.hint = { key, group, arrows, fill, edge, geos: [fillGeo, edgeGeo] };
  }

  // Only draws when something moved, so an idle cube costs almost nothing.
  frame(now) {
    let dirty = this.dirty;
    this.dirty = false;
    if (this.anim) {
      dirty = true;
      const a = this.anim, k = Math.min(1, (now - a.start) / a.duration);
      const ease = 1 - (1 - k) ** 3;
      a.pivot.quaternion.setFromAxisAngle(a.axis, a.angle * ease);
      if (k >= 1) this.finish();
    }
    if (!this.root.quaternion.equals(this.targetQuat)) {
      dirty = true;
      this.root.quaternion.slerp(this.targetQuat, 0.15);
      if (this.root.quaternion.angleTo(this.targetQuat) < 1e-3) this.root.quaternion.copy(this.targetQuat);
    }
    if (this.hint) {
      // Glide a little in the turn direction and ease back; hidden while a turn animates.
      const h = this.hint, t = (now % 1200) / 1200;
      const push = t < 0.6 ? 1 - (1 - t / 0.6) ** 3 : 1 - ((t - 0.6) / 0.4) ** 2;
      h.group.visible = !this.anim;
      for (const a of h.arrows) a.position.copy(a.userData.centre).addScaledVector(a.userData.dir, 0.22 * push - 0.11);
      h.fill.opacity = h.edge.opacity = 0.5 + 0.12 * push; // see-through so the stickers stay readable
      dirty = true;
    }
    if (this.controls.update()) dirty = true;
    if (dirty) this.renderer.render(this.scene, this.camera);
  }
}
