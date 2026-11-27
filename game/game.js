// Merapi Dawn Run — a chase-view flight game, written for the make.fun flight-game bounty.
// Fly a little prop plane down the Merapi valley at dawn: take off, thread 14 glowing
// rings, then land on the far runway before the 150-second clock runs out.
// All art is drawn on canvas. No network, no downloaded assets, no images at runtime.

'use strict';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = 1280;
const H = 800;
const FOCAL = 620; // projection focal length, in pixels
const HORIZON = Math.round(H * 0.44);
const TRACK_LEN = 6300; // the valley run, in world units
const TIME_LIMIT = 150; // seconds on the clock
const RING_COUNT = 14;

// ---------------------------------------------------------------- the valley

/** Ground height at lateral x and distance z. A low valley floor with steep walls. */
function groundH(x, z) {
  const ax = Math.abs(x);
  let g = 5 + 3.2 * Math.sin(z * 0.011) + 2.1 * Math.sin(z * 0.023 + 1.7) + 1.4 * Math.sin(z * 0.041 + 4.0);
  if (ax > 78) g += (ax - 78) * (ax - 78) * 0.03; // valley walls rise past here
  // Merapi's cone, well left of the track around z 4350: a landmark, never
  // a hazard on the racing line (its foot stays clear of |x| < 60).
  const dx = x + 150, dz = z - 4350;
  const d2 = dx * dx + dz * dz;
  if (d2 < 190 * 190) g += 85 * Math.max(0, 1 - Math.sqrt(d2) / 190);
  // Both runways are flat, with a flat approach corridor before the far one.
  if (ax < 26 && ((z >= 0 && z <= 290) || (z >= 5800 && z <= TRACK_LEN))) g = 0;
  return g;
}

/** The river winding down the valley floor. */
function riverX(z) {
  return 42 * Math.sin(z * 0.0016 + 2.1) + 12 * Math.sin(z * 0.004 + 0.5);
}

/** Ring i: a glowing hoop on the course. Gold rings are worth more. */
function makeRings() {
  const rings = [];
  for (let i = 0; i < RING_COUNT; i++) {
    const z = 760 + i * 340;
    rings.push({
      x: 52 * Math.sin(i * 0.85),
      y: 36 + 16 * Math.sin(i * 0.7 + 1.2),
      z: z,
      r: 17,
      gold: i === 3 || i === 8 || i === 12,
      hit: false,
      missed: false,
    });
  }
  return rings;
}

// Deterministic pseudo-random from integers (stable scenery, no Math.random in layout).
function hash2(a, b) {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = (h ^ (h >> 13)) | 0;
  h = Math.imul(h, 1274126177);
  h = (h ^ (h >> 16)) >>> 0;
  return h / 4294967295;
}

// ---------------------------------------------------------------- state

function freshState() {
  return {
    phase: 'start', // start | fly | rollout | pause | crash | timeup | win
    prevPhase: 'fly',
    t: 0, // seconds since the flight began
    timeLeft: TIME_LIMIT,
    x: 0, y: 0, z: 0, // plane position; y is altitude above the valley floor
    heading: 0, // radians, 0 = straight down the valley, right turns positive
    bank: 0, // radians, positive = banked right
    pitch: 0, // radians, positive = nose up
    speed: 0,
    throttle: 0.55,
    boost: false,
    score: 0,
    combo: 0,
    comboTimer: 0,
    ringsHit: 0,
    ringsTotal: RING_COUNT,
    nextRing: 0,
    best: 0,
    crashReason: '',
    winBreakdown: null,
    message: '',
    messageT: 0,
    messageKind: '',
    keys: {},
    mouseX: W / 2, mouseY: H / 2,
    mouseSeen: -99, // last time the mouse moved over the canvas
    mouseDown: false,
    particles: [],
    clouds: [],
    time: 0, // wall-clock seconds for animation
    shake: 0,
    landed: false,
  };
}

const S = freshState();
let rings = makeRings();

// Clouds drift slowly above the valley; positions are fixed per index.
for (let i = 0; i < 26; i++) {
  S.clouds.push({
    x: -320 + hash2(i, 1) * 640,
    y: 62 + hash2(i, 2) * 70,
    z: 200 + hash2(i, 3) * 6200,
    s: 26 + hash2(i, 4) * 42,
  });
}

function showMessage(text, kind) {
  S.message = text;
  S.messageKind = kind || '';
  S.messageT = 2.2;
}

function burst(x, y, z, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const b = Math.random() * Math.PI * 2;
    S.particles.push({
      x: x, y: y, z: z,
      vx: Math.cos(a) * 14, vy: Math.sin(b) * 10, vz: Math.sin(a) * 10,
      life: 0.7 + Math.random() * 0.5, age: 0, color: color, size: 2 + Math.random() * 3,
    });
  }
}

// ---------------------------------------------------------------- sound

let audioCtx = null;
function tone(freq, dur, type, vol, when) {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const t0 = audioCtx.currentTime + (when || 0);
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(vol || 0.08, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(audioCtx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  } catch (e) { /* sound is optional */ }
}
function chime(perfect) {
  tone(880, 0.16, 'sine', 0.07);
  tone(1318, 0.22, 'sine', 0.06, 0.09);
  if (perfect) tone(1760, 0.3, 'sine', 0.06, 0.18);
}
function thud() { tone(110, 0.5, 'sawtooth', 0.1); tone(70, 0.6, 'sine', 0.12, 0.05); }
function fanfare() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.28, 'triangle', 0.08, i * 0.13)); }

// ---------------------------------------------------------------- input

const KEYMAP = {
  ArrowRight: 'right', KeyD: 'right',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ShiftLeft: 'thrUp', ShiftRight: 'thrUp',
  ControlLeft: 'thrDown', KeyC: 'thrDown',
  Space: 'boost',
};

window.addEventListener('keydown', (e) => {
  const k = KEYMAP[e.code];
  if (k) { S.keys[k] = true; e.preventDefault(); }
  if (e.code === 'Enter') {
    if (S.phase === 'start' || S.phase === 'crash' || S.phase === 'timeup' || S.phase === 'win') startFlight();
  }
  if (e.code === 'KeyP') {
    if (S.phase === 'fly' || S.phase === 'rollout') { S.prevPhase = S.phase; S.phase = 'pause'; }
    else if (S.phase === 'pause') { S.phase = S.prevPhase; }
  }
  if (e.code === 'KeyR') {
    if (S.phase !== 'start') startFlight();
  }
});
window.addEventListener('keyup', (e) => {
  const k = KEYMAP[e.code];
  if (k) S.keys[k] = false;
});
canvas.addEventListener('mousemove', (e) => {
  const r = canvas.getBoundingClientRect();
  S.mouseX = (e.clientX - r.left) * (W / r.width);
  S.mouseY = (e.clientY - r.top) * (H / r.height);
  S.mouseSeen = S.time;
});
canvas.addEventListener('mousedown', (e) => {
  S.mouseDown = true;
  if (S.phase === 'start' || S.phase === 'crash' || S.phase === 'timeup' || S.phase === 'win') startFlight();
  e.preventDefault();
});
window.addEventListener('mouseup', () => { S.mouseDown = false; });

function startFlight() {
  const best = S.best;
  const clouds = S.clouds;
  const fresh = freshState();
  fresh.best = best;
  fresh.clouds = clouds;
  Object.assign(S, fresh);
  rings = makeRings();
  S.phase = 'fly';
  showMessage('TAKE OFF — THREAD THE RINGS', '');
}

// ---------------------------------------------------------------- physics

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function ease(cur, target, rate, dt) {
  const d = target - cur;
  const step = rate * dt;
  if (Math.abs(d) <= step) return target;
  return cur + Math.sign(d) * step;
}

/** One simulation step. dt is seconds, already clamped. */
function step(dt) {
  S.t += dt;
  S.timeLeft = Math.max(0, TIME_LIMIT - S.t);
  if (S.timeLeft <= 0) { endTimeUp(); return; }
  if (S.comboTimer > 0) {
    S.comboTimer -= dt;
    if (S.comboTimer <= 0) S.combo = 0;
  }
  if (S.messageT > 0) S.messageT -= dt;
  if (S.shake > 0) S.shake = Math.max(0, S.shake - dt * 2.2);

  // Throttle and speed. Space boosts while the throttle is up.
  if (S.keys.thrUp) S.throttle = clamp(S.throttle + 0.5 * dt, 0, 1);
  if (S.keys.thrDown) S.throttle = clamp(S.throttle - 0.6 * dt, 0, 1);
  S.boost = !!S.keys.boost || S.mouseDown;
  let targetSpeed = 24 + S.throttle * 36;
  if (S.boost && S.throttle > 0.3) targetSpeed += 16;
  S.speed = ease(S.speed, targetSpeed, 7, dt);

  // Steering: keyboard wins while any steer key is held, else the mouse steers
  // when it moved recently over the canvas. No input means gentle auto-level.
  // On the runway past rotation speed, the nose comes up by itself.
  const keySteer = S.keys.right || S.keys.left || S.keys.up || S.keys.down;
  const mouseFresh = (S.time - S.mouseSeen) < 2.5;
  let bankTarget = 0;
  let pitchTarget = 0;
  if (keySteer) {
    if (S.keys.right) bankTarget = 0.6;
    else if (S.keys.left) bankTarget = -0.6;
    if (S.keys.up) pitchTarget = 0.34; // UP climbs, DOWN descends
    else if (S.keys.down) pitchTarget = -0.34;
  } else if (mouseFresh) {
    bankTarget = clamp((S.mouseX - W / 2) / (W / 2), -1, 1) * 0.62;
    pitchTarget = clamp((H / 2 - S.mouseY) / (H / 2), -1, 1) * 0.36;
  }
  // Hands off: the plane climbs gently to a safe height and holds it, so it
  // lifts off by itself and never settles onto the valley floor uncommanded.
  // Past the last ring the pilot owns the descent: no auto-climb on final.
  if (!keySteer && !mouseFresh && S.y < 30 && S.z < 5600) pitchTarget = Math.max(pitchTarget, 0.12);
  S.bank = ease(S.bank, bankTarget, 2.4, dt);
  S.pitch = ease(S.pitch, pitchTarget, 2.1, dt);

  // Coordinated turn: a right bank turns the nose right (heading grows, x grows).
  // Kept gentle on purpose: small taps steer, big banks do not whip the plane around.
  S.heading += S.bank * 0.62 * dt * (0.5 + S.speed / 90);

  const prevZ = S.z;
  S.x += Math.sin(S.heading) * S.speed * dt;
  S.z += Math.cos(S.heading) * S.speed * dt;
  S.y += Math.sin(S.pitch) * S.speed * dt;
  if (S.y > 155) S.y = 155;

  checkRings(prevZ);
  updateParticles(dt);
  checkGround();
}

function updateParticles(dt) {
  for (let i = S.particles.length - 1; i >= 0; i--) {
    const p = S.particles[i];
    p.age += dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    p.vy -= 6 * dt;
    if (p.age >= p.life) S.particles.splice(i, 1);
  }
}

// ---------------------------------------------------------------- rings, landing, crashes

function ringValue(ring) {
  const mult = 1 + 0.5 * Math.min(S.combo, 4);
  return Math.round((ring.gold ? 250 : 100) * mult);
}

function checkRings(prevZ) {
  for (let i = S.nextRing; i < rings.length; i++) {
    const ring = rings[i];
    if (prevZ < ring.z && S.z >= ring.z) {
      const dx = S.x - ring.x;
      const dy = S.y - ring.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= ring.r) {
        ring.hit = true;
        S.ringsHit++;
        const perfect = dist <= ring.r * 0.45;
        const value = ringValue(ring) + (perfect ? 50 : 0);
        S.score += value;
        S.combo++;
        S.comboTimer = 12;
        burst(ring.x, ring.y, ring.z, ring.gold ? '#ffd24a' : '#4ae3ff', perfect ? 42 : 26);
        chime(perfect);
        showMessage(
          (perfect ? 'PERFECT ' : '') + '+' + value + '  ·  RING ' + S.ringsHit + '/' + S.ringsTotal +
          (S.combo > 1 ? '  ·  COMBO x' + S.combo : ''),
          perfect ? 'good' : ''
        );
        S.nextRing = i + 1;
      } else {
        ring.missed = true;
        S.combo = 0;
        S.comboTimer = 0;
        S.nextRing = i + 1;
        showMessage('RING MISSED — COMBO LOST', 'bad');
      }
    } else if (ring.z > S.z) {
      break;
    }
  }
}

function onFinalRunway() {
  return S.z >= 5800 && S.z <= TRACK_LEN && Math.abs(S.x) < 26;
}

function checkGround() {
  const gh = groundH(S.x, S.z);
  if (S.y > gh + 1.2) return; // still airborne
  // Rolling on the start runway is normal: the takeoff roll, not a crash.
  // Once the plane is fast and rotating, let it lift instead of snapping it back.
  if (S.z >= 0 && S.z <= 290 && Math.abs(S.x) < 26) {
    if (S.speed > 32 && S.pitch > 0.02) return;
    S.y = 0; return;
  }
  // Touching the ground.
  if (onFinalRunway() && Math.abs(S.heading) < 0.3 && S.speed < 48) {
    S.y = 0;
    S.phase = 'rollout';
    S.landed = true;
    showMessage('TOUCHDOWN — ROLLING OUT', 'good');
    tone(660, 0.2, 'triangle', 0.07);
    return;
  }
  if (S.z > TRACK_LEN + 20) { endCrash('OVERSHOT THE RUNWAY'); return; }
  if (Math.abs(S.x) > 118) { endCrash('INTO THE MOUNTAINS'); return; }
  if (onFinalRunway()) { endCrash('BAD LANDING — TOO FAST OR CROOKED'); return; }
  endCrash('TERRAIN STRIKE');
}

function endCrash(reason) {
  S.phase = 'crash';
  S.crashReason = reason;
  S.shake = 1;
  burst(S.x, S.y + 2, S.z, '#ff7a3c', 40);
  burst(S.x, S.y + 2, S.z, '#8a8f9a', 30);
  thud();
  if (S.score > S.best) S.best = S.score;
}

function endTimeUp() {
  S.phase = 'timeup';
  S.timeLeft = 0;
  if (S.score > S.best) S.best = S.score;
}

/** Rollout after touchdown: the plane slows down the runway, then the win screen. */
function stepRollout(dt) {
  S.t += dt;
  S.timeLeft = Math.max(0, TIME_LIMIT - S.t);
  if (S.messageT > 0) S.messageT -= dt;
  S.speed = Math.max(0, S.speed - 14 * dt);
  S.z += S.speed * dt;
  S.y = 0;
  updateParticles(dt);
  if (S.speed < 5 || S.z >= 6260) {
    const timeBonus = Math.round(S.timeLeft) * 5;
    const landingBonus = 500;
    S.score += landingBonus + timeBonus;
    S.winBreakdown = {
      rings: S.ringsHit, total: S.ringsTotal,
      landing: landingBonus, timeBonus: timeBonus,
      totalScore: S.score,
    };
    S.phase = 'win';
    if (S.score > S.best) S.best = S.score;
    fanfare();
  }
}

// ---------------------------------------------------------------- projection

/** Camera behind and above the plane, looking down the heading. */
function camera() {
  const fx = Math.sin(S.heading), fz = Math.cos(S.heading);
  return {
    x: S.x - fx * 34, y: S.y + 11, z: S.z - fz * 34,
    fx: fx, fz: fz, rx: fz, rz: -fx, // right vector
  };
}

/** World point -> screen point, or null when behind the camera. */
function project(cam, px, py, pz) {
  const dx = px - cam.x, dy = py - cam.y, dz = pz - cam.z;
  const fwd = dx * cam.fx + dz * cam.fz;
  if (fwd < 4) return null;
  const right = dx * cam.rx + dz * cam.rz;
  return {
    x: W / 2 + (right * FOCAL) / fwd,
    y: HORIZON - ((dy) * FOCAL) / fwd,
    f: fwd,
  };
}

// ---------------------------------------------------------------- scenery

function drawSky(cam) {
  const g = ctx.createLinearGradient(0, 0, 0, HORIZON + 60);
  g.addColorStop(0, '#1b1445');
  g.addColorStop(0.45, '#5b2a6e');
  g.addColorStop(0.75, '#c65a3c');
  g.addColorStop(1, '#ffb347');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, HORIZON + 60);
  // Low sun, ahead and to the left, with a warm glow.
  const sun = project(cam, cam.x - 260, 70, cam.z + 900);
  const sx = sun ? sun.x : W * 0.3;
  const sy = sun ? sun.y : HORIZON - 130;
  const glow = ctx.createRadialGradient(sx, sy, 8, sx, sy, 220);
  glow.addColorStop(0, 'rgba(255, 236, 170, 0.95)');
  glow.addColorStop(0.25, 'rgba(255, 190, 90, 0.55)');
  glow.addColorStop(1, 'rgba(255, 150, 60, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(sx - 230, sy - 230, 460, 460);
  ctx.fillStyle = '#fff3c4';
  ctx.beginPath();
  ctx.arc(sx, sy, 34, 0, Math.PI * 2);
  ctx.fill();
  // A few high stars fading in the dawn.
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  for (let i = 0; i < 24; i++) {
    const sx2 = hash2(i, 11) * W;
    const sy2 = hash2(i, 12) * HORIZON * 0.5;
    ctx.fillRect(sx2, sy2, 2, 2);
  }
}

function drawClouds(cam) {
  for (const c of S.clouds) {
    const p = project(cam, c.x, c.y, c.z);
    if (!p || p.x < -120 || p.x > W + 120) continue;
    const s = (c.s * FOCAL) / p.f;
    if (s < 4) continue;
    ctx.fillStyle = 'rgba(255, 214, 180, 0.5)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, s, s * 0.32, 0, 0, Math.PI * 2);
    ctx.ellipse(p.x - s * 0.55, p.y + s * 0.08, s * 0.6, s * 0.24, 0, 0, Math.PI * 2);
    ctx.ellipse(p.x + s * 0.55, p.y + s * 0.06, s * 0.65, s * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** One mountain ridge across the screen, parallaxed by the camera.
 *  mode 'band': a distant range sitting on the horizon (fills wave line down
 *  to just below the horizon). mode 'walls': valley walls that rise at the
 *  screen edges and leave the centre open, filled down to the screen bottom. */
function drawRidge(cam, base, amp, color, parX, parZ, seed, mode) {
  ctx.fillStyle = color;
  ctx.beginPath();
  const top = [];
  for (let sx = 0; sx <= W; sx += 32) {
    const wx = (sx / W - 0.5) * 900 - cam.x * parX;
    const wave = Math.sin(wx * 0.011 + seed + cam.z * parZ) * 0.6
      + Math.sin(wx * 0.027 + seed * 2.3) * 0.3
      + Math.sin(wx * 0.052 + seed * 4.1) * 0.18;
    let edge = 1;
    if (mode === 'walls') {
      const off = Math.abs(sx / W - 0.5) * 2; // 0 centre, 1 edges
      edge = clamp((off - 0.22) / 0.55, 0, 1);
    }
    top.push([sx, HORIZON - base - wave * amp * edge]);
  }
  ctx.moveTo(0, mode === 'walls' ? H : HORIZON + 80);
  for (const p of top) ctx.lineTo(p[0], p[1]);
  ctx.lineTo(W, mode === 'walls' ? H : HORIZON + 80);
  ctx.closePath();
  ctx.fill();
}

function drawMerapi(cam) {
  const base = project(cam, -150, groundH(-150, 4350), 4350);
  if (!base || base.f > 2600 || base.x < -260 || base.x > W + 260) return;
  const scale = FOCAL / base.f;
  const hgt = 85 * scale;
  const wid = 190 * scale;
  if (hgt < 8) return;
  const bx = base.x, by = base.y;
  // Cone.
  ctx.fillStyle = '#4a3a52';
  ctx.beginPath();
  ctx.moveTo(bx - wid, by);
  ctx.lineTo(bx, by - hgt);
  ctx.lineTo(bx + wid, by);
  ctx.closePath();
  ctx.fill();
  // Snow cap catching the dawn.
  ctx.fillStyle = '#ffe9d6';
  ctx.beginPath();
  ctx.moveTo(bx - wid * 0.34, by - hgt * 0.66);
  ctx.lineTo(bx, by - hgt);
  ctx.lineTo(bx + wid * 0.34, by - hgt * 0.66);
  ctx.lineTo(bx + wid * 0.16, by - hgt * 0.52);
  ctx.lineTo(bx, by - hgt * 0.62);
  ctx.lineTo(bx - wid * 0.16, by - hgt * 0.52);
  ctx.closePath();
  ctx.fill();
  // Smoke plume drifting from the crater.
  for (let i = 0; i < 5; i++) {
    const pu = (S.time * 0.12 + i * 0.2) % 1;
    const px = bx + Math.sin(i * 2.4) * 8 * scale + pu * 34 * scale;
    const py = by - hgt - pu * 66 * scale;
    const pr = (6 + pu * 20) * scale;
    ctx.fillStyle = 'rgba(235, 225, 215,' + (0.5 * (1 - pu)).toFixed(2) + ')';
    ctx.beginPath();
    ctx.arc(px, py, Math.max(1.5, pr), 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawGround(cam) {
  // Valley floor as transverse strips, near to far.
  const z0 = Math.max(0, Math.floor((cam.z + 30) / 40) * 40);
  for (let zz = z0 + 520; zz >= z0; zz -= 40) {
    const a = project(cam, -120, groundH(-120, zz), zz);
    const b = project(cam, 120, groundH(120, zz), zz);
    const a2 = project(cam, -120, groundH(-120, zz + 40), zz + 40);
    const b2 = project(cam, 120, groundH(120, zz + 40), zz + 40);
    if (!a || !b || !a2 || !b2) continue;
    const band = Math.floor(zz / 40) % 2;
    const tone = hash2(Math.floor(zz / 40), 7);
    ctx.fillStyle = band === 0
      ? (tone < 0.5 ? '#3f7a34' : '#4c8a3a')
      : (tone < 0.5 ? '#6b8a3f' : '#7a9a45');
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    ctx.lineTo(b2.x, b2.y); ctx.lineTo(a2.x, a2.y);
    ctx.closePath();
    ctx.fill();
    // River ribbon on this strip.
    const rx = riverX(zz);
    const r1 = project(cam, rx - 7, groundH(rx - 7, zz) + 0.4, zz);
    const r2 = project(cam, rx + 7, groundH(rx + 7, zz) + 0.4, zz);
    const r3 = project(cam, riverX(zz + 40) + 7, groundH(riverX(zz + 40) + 7, zz + 40) + 0.4, zz + 40);
    const r4 = project(cam, riverX(zz + 40) - 7, groundH(riverX(zz + 40) - 7, zz + 40) + 0.4, zz + 40);
    if (r1 && r2 && r3 && r4) {
      ctx.fillStyle = '#7ec8e8';
      ctx.beginPath();
      ctx.moveTo(r1.x, r1.y); ctx.lineTo(r2.x, r2.y);
      ctx.lineTo(r3.x, r3.y); ctx.lineTo(r4.x, r4.y);
      ctx.closePath();
      ctx.fill();
    }
    // A few trees on the strip, placed by hash.
    for (let k = 0; k < 5; k++) {
      const tx = -110 + hash2(Math.floor(zz / 40), k * 3 + 1) * 220;
      if (Math.abs(tx) < 30 && zz < 300) continue; // keep the runways clear
      const tp = project(cam, tx, groundH(tx, zz) + 1, zz);
      if (!tp || tp.x < 0 || tp.x > W) continue;
      const ts = (7 * FOCAL) / tp.f;
      if (ts < 1.2 || ts > 26) continue;
      ctx.fillStyle = '#1e4d26';
      ctx.beginPath();
      ctx.moveTo(tp.x, tp.y - ts);
      ctx.lineTo(tp.x - ts * 0.45, tp.y);
      ctx.lineTo(tp.x + ts * 0.45, tp.y);
      ctx.closePath();
      ctx.fill();
    }
  }
}

/** Draw a runway as a projected strip with centre dashes. */
function drawRunway(cam, zStart, zEnd) {
  const steps = Math.ceil((zEnd - zStart) / 40);
  for (let i = 0; i < steps; i++) {
    const zA = zStart + (i * (zEnd - zStart)) / steps;
    const zB = zStart + ((i + 1) * (zEnd - zStart)) / steps;
    const a = project(cam, -24, 0.3, zA);
    const b = project(cam, 24, 0.3, zA);
    const c = project(cam, 24, 0.3, zB);
    const d = project(cam, -24, 0.3, zB);
    if (!a || !b || !c || !d) continue;
    ctx.fillStyle = i % 2 === 0 ? '#5a5f6b' : '#525763';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.fill();
    if (i % 2 === 0) {
      const m1 = project(cam, -1.2, 0.5, zA + 4);
      const m2 = project(cam, 1.2, 0.5, zA + 4);
      const m3 = project(cam, 1.2, 0.5, zB - 4);
      const m4 = project(cam, -1.2, 0.5, zB - 4);
      if (m1 && m2 && m3 && m4) {
        ctx.fillStyle = '#ffd24a';
        ctx.beginPath();
        ctx.moveTo(m1.x, m1.y); ctx.lineTo(m2.x, m2.y);
        ctx.lineTo(m3.x, m3.y); ctx.lineTo(m4.x, m4.y);
        ctx.closePath();
        ctx.fill();
      }
    }
  }
}

// ---------------------------------------------------------------- rings, plane, particles

function drawRings(cam) {
  for (let i = 0; i < rings.length; i++) {
    const ring = rings[i];
    const p = project(cam, ring.x, ring.y, ring.z);
    if (!p || p.f > 1500) continue;
    const rad = (ring.r * FOCAL) / p.f;
    if (rad < 2) continue;
    const isNext = i === S.nextRing && S.phase === 'fly';
    const pulse = isNext ? 1 + 0.07 * Math.sin(S.time * 6) : 1;
    let color = ring.gold ? '#ffd24a' : '#4ae3ff';
    if (ring.hit) color = '#7dff8a';
    else if (ring.missed) color = '#8a8f9a';
    ctx.save();
    ctx.globalAlpha = clamp(1.25 - p.f / 1200, 0.25, 1);
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, rad * 0.14 * pulse);
    ctx.shadowColor = color;
    ctx.shadowBlur = isNext ? 26 : 12;
    ctx.beginPath();
    ctx.arc(p.x, p.y, rad * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.lineWidth = Math.max(1, rad * 0.05);
    ctx.setLineDash([rad * 0.35, rad * 0.22]);
    ctx.beginPath();
    ctx.arc(p.x, p.y, rad * 0.72 * pulse, S.time * 0.8, S.time * 0.8 + Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    if (rad > 14) {
      ctx.fillStyle = color;
      ctx.font = 'bold ' + Math.round(Math.max(11, rad * 0.34)) + 'px Verdana, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), p.x, p.y - rad - 14);
    }
    ctx.restore();
  }
}

function drawPlane() {
  const px = W / 2;
  const py = Math.round(H * 0.60) - S.pitch * 46 + (S.shake > 0 ? (Math.random() - 0.5) * S.shake * 10 : 0);
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(S.bank * 0.85);
  // Propeller blur at the nose.
  ctx.fillStyle = 'rgba(220, 230, 255, 0.35)';
  ctx.beginPath();
  ctx.ellipse(0, -66, 26, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  // Wings.
  ctx.fillStyle = '#d63c2f';
  ctx.beginPath();
  ctx.moveTo(-118, 6); ctx.lineTo(-30, -14); ctx.lineTo(30, -14); ctx.lineTo(118, 6);
  ctx.lineTo(96, 20); ctx.lineTo(-96, 20);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffd24a';
  ctx.fillRect(-118, 2, 14, 12);
  ctx.fillRect(104, 2, 14, 12);
  // Fuselage, seen from behind and above: tail low, nose high.
  const body = ctx.createLinearGradient(0, -70, 0, 52);
  body.addColorStop(0, '#ff8a3c');
  body.addColorStop(0.5, '#e8442f');
  body.addColorStop(1, '#8f1d12');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(0, -72);
  ctx.quadraticCurveTo(20, -30, 16, 6);
  ctx.quadraticCurveTo(14, 40, 8, 52);
  ctx.lineTo(-8, 52);
  ctx.quadraticCurveTo(-14, 40, -16, 6);
  ctx.quadraticCurveTo(-20, -30, 0, -72);
  ctx.fill();
  // Cockpit hump and tail fin.
  ctx.fillStyle = '#ffe9c4';
  ctx.beginPath();
  ctx.ellipse(0, -34, 9, 15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#8f1d12';
  ctx.beginPath();
  ctx.moveTo(0, 52); ctx.lineTo(-16, 74); ctx.lineTo(16, 74);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffd24a';
  ctx.beginPath();
  ctx.moveTo(0, 52); ctx.lineTo(-5, 74); ctx.lineTo(5, 74);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawParticles(cam) {
  for (const p of S.particles) {
    const s = project(cam, p.x, p.y, p.z);
    if (!s) continue;
    ctx.globalAlpha = clamp(1 - p.age / p.life, 0, 1);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(s.x, s.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** Speed streaks at the screen edges when flying fast. */
function drawSpeedLines() {
  if (S.speed < 44 || S.phase !== 'fly') return;
  const n = Math.round((S.speed - 44) / 2);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = 2;
  for (let i = 0; i < n; i++) {
    const side = i % 2 === 0 ? 0 : 1;
    const x = side === 0 ? 20 + hash2(i, 21) * 130 : W - 150 + hash2(i, 22) * 130;
    const y = 60 + hash2(i, 23) * (H - 160);
    const len = 26 + hash2(i, 24) * 40;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (side === 0 ? -len : len) * 0.3, y + len);
    ctx.stroke();
  }
}

// ---------------------------------------------------------------- HUD and guide

function fmtTime(sec) {
  const s = Math.max(0, Math.ceil(sec));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

function drawHUD() {
  ctx.textBaseline = 'alphabetic';
  // Score, top left.
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fff3c4';
  ctx.font = 'bold 34px Verdana, sans-serif';
  ctx.fillText(String(S.score), 22, 46);
  ctx.font = 'bold 13px Verdana, sans-serif';
  ctx.fillStyle = '#ffd24a';
  ctx.fillText('SCORE', 22, 66);
  if (S.combo > 1) {
    ctx.fillStyle = '#ff9a3c';
    ctx.font = 'bold 20px Verdana, sans-serif';
    ctx.fillText('COMBO x' + S.combo, 22, 94);
  }
  ctx.fillStyle = '#ffe9c4';
  ctx.font = 'bold 15px Verdana, sans-serif';
  ctx.fillText('RINGS ' + S.ringsHit + '/' + S.ringsTotal, 22, 118);
  // Timer, top centre.
  ctx.textAlign = 'center';
  const low = S.timeLeft <= 20;
  ctx.fillStyle = low ? '#ff5a4a' : '#fff3c4';
  ctx.font = 'bold 34px Verdana, sans-serif';
  ctx.fillText(fmtTime(S.timeLeft), W / 2, 46);
  ctx.font = 'bold 12px Verdana, sans-serif';
  ctx.fillStyle = '#ffd24a';
  ctx.fillText('TIME LEFT', W / 2, 66);
  // Speed, altitude, heading, top right.
  ctx.textAlign = 'right';
  ctx.fillStyle = '#fff3c4';
  ctx.font = 'bold 22px Verdana, sans-serif';
  ctx.fillText(Math.round(S.speed * 6) + ' kn', W - 22, 40);
  ctx.fillText(Math.round(Math.max(0, S.y) * 4) + ' m', W - 22, 68);
  const deg = ((S.heading * 57.2958) % 360 + 360) % 360;
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  ctx.fillText(Math.round(deg) + '° ' + dirs[Math.round(deg / 45) % 8], W - 22, 96);
  // Throttle bar, bottom left.
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(10, 8, 24, 0.55)';
  ctx.fillRect(22, H - 44, 190, 16);
  ctx.fillStyle = S.boost ? '#ff9a3c' : '#4ae3ff';
  ctx.fillRect(22, H - 44, 190 * S.throttle, 16);
  ctx.fillStyle = '#ffe9c4';
  ctx.font = 'bold 12px Verdana, sans-serif';
  ctx.fillText('THROTTLE' + (S.boost ? ' · BOOST' : ''), 22, H - 50);
  // Next-ring guide, bottom centre.
  if (S.phase === 'fly' && S.nextRing < rings.length) {
    const ring = rings[S.nextRing];
    const dist = Math.max(0, Math.round(ring.z - S.z));
    ctx.textAlign = 'center';
    ctx.fillStyle = '#4ae3ff';
    ctx.font = 'bold 18px Verdana, sans-serif';
    const arrow = ring.x > S.x + 6 ? '▶' : ring.x < S.x - 6 ? '◀' : '▲';
    const vert = ring.y > S.y + 4 ? ' CLIMB' : ring.y < S.y - 4 ? ' DESCEND' : '';
    ctx.fillText('NEXT RING ' + (S.nextRing + 1) + ' · ' + dist + ' m  ' + arrow + vert, W / 2, H - 24);
  }
  // Low-altitude and mountain warnings.
  const gh = groundH(S.x, S.z);
  if (S.phase === 'fly' && S.y - gh < 12 && S.speed > 5) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff5a4a';
    ctx.font = 'bold 22px Verdana, sans-serif';
    ctx.fillText('⚠ PULL UP — TERRAIN', W / 2, 108);
  } else if (S.phase === 'fly' && Math.abs(S.x) > 70) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff9a3c';
    ctx.font = 'bold 22px Verdana, sans-serif';
    ctx.fillText('⚠ TURN BACK — MOUNTAINS', W / 2, 108);
  }
  // Centre message.
  if (S.messageT > 0 && S.message) {
    ctx.textAlign = 'center';
    ctx.globalAlpha = clamp(S.messageT, 0, 1);
    ctx.fillStyle = S.messageKind === 'bad' ? '#ff8a7a' : '#fff3c4';
    ctx.font = 'bold 26px Verdana, sans-serif';
    ctx.fillText(S.message, W / 2, 150);
    ctx.globalAlpha = 1;
  }
}

/** Final-approach helper once the last ring is behind the plane. */
function drawApproach() {
  if (S.phase !== 'fly' || S.nextRing < rings.length || S.z < 5200) return;
  const cx = W / 2;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(10, 8, 24, 0.6)';
  ctx.fillRect(cx - 210, 128, 420, 74);
  ctx.fillStyle = '#ffd24a';
  ctx.font = 'bold 15px Verdana, sans-serif';
  ctx.fillText('FINAL APPROACH — LINE UP WITH THE RUNWAY', cx, 150);
  const lined = Math.abs(S.x) < 14;
  const high = S.y > 26;
  const fast = S.speed > 44;
  ctx.font = 'bold 15px Verdana, sans-serif';
  ctx.fillStyle = lined ? '#7dff8a' : '#ff8a7a';
  ctx.fillText(lined ? '✓ LINED UP' : (S.x > 0 ? '◀ MOVE LEFT' : 'MOVE RIGHT ▶'), cx - 120, 182);
  ctx.fillStyle = high ? '#ff8a7a' : '#7dff8a';
  ctx.fillText(high ? 'TOO HIGH' : 'HEIGHT OK', cx + 8, 182);
  ctx.fillStyle = fast ? '#ff8a7a' : '#7dff8a';
  ctx.fillText(fast ? 'TOO FAST' : 'SPEED OK', cx + 128, 182);
}

// ---------------------------------------------------------------- screens

function panel(title, lines, prompt, accent) {
  ctx.fillStyle = 'rgba(12, 8, 26, 0.72)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = accent || '#ffd24a';
  ctx.font = 'bold 54px Verdana, sans-serif';
  ctx.fillText(title, W / 2, 250);
  ctx.fillStyle = '#ffe9c4';
  ctx.font = '20px Verdana, sans-serif';
  let y = 310;
  for (const line of lines) {
    ctx.fillText(line, W / 2, y);
    y += 32;
  }
  if (prompt) {
    ctx.fillStyle = '#4ae3ff';
    ctx.font = 'bold 22px Verdana, sans-serif';
    ctx.fillText(prompt, W / 2, y + 26);
  }
}

function drawStart() {
  panel('MERAPI DAWN RUN', [
    'Take off at dawn, thread all 14 glowing rings down the valley,',
    'then land on the far runway before the 150-second clock runs out.',
    '',
    '← → or A / D — bank and turn    ↑ ↓ or W / S — climb and descend',
    'Mouse — steer by pointing    Shift — throttle up    Ctrl — throttle down',
    'Space — boost    P — pause    R — restart',
    '',
    'Gold rings are worth 250. Centre a ring for PERFECT +50.',
    'Chain rings quickly to build your combo multiplier.',
  ], 'PRESS ENTER OR CLICK TO FLY', '#ffd24a');
}

function drawPause() {
  panel('PAUSED', ['Take a breath. The valley waits.'], 'PRESS P TO KEEP FLYING', '#4ae3ff');
}

function drawCrash() {
  panel('CRASHED', [
    S.crashReason,
    '',
    'Score: ' + S.score + '   ·   Rings: ' + S.ringsHit + '/' + S.ringsTotal,
    S.score >= S.best && S.score > 0 ? 'NEW BEST SCORE!' : 'Best: ' + S.best,
  ], 'PRESS R OR ENTER TO FLY AGAIN', '#ff5a4a');
}

function drawTimeUp() {
  panel('TIME UP', [
    'The clock ran out over the valley.',
    '',
    'Score: ' + S.score + '   ·   Rings: ' + S.ringsHit + '/' + S.ringsTotal,
    'Best: ' + S.best,
  ], 'PRESS R OR ENTER TO FLY AGAIN', '#ff5a4a');
}

function drawWin() {
  const b = S.winBreakdown || { rings: S.ringsHit, total: S.ringsTotal, landing: 500, timeBonus: 0, totalScore: S.score };
  panel('LANDED — MERAPI CONQUERED', [
    'Rings threaded: ' + b.rings + ' / ' + b.total,
    'Landing bonus: +' + b.landing + '    Time bonus: +' + b.timeBonus,
    '',
    'TOTAL SCORE: ' + b.totalScore,
    b.totalScore >= S.best && b.totalScore > 0 ? 'NEW BEST SCORE!' : 'Best: ' + S.best,
  ], 'PRESS R OR ENTER TO FLY AGAIN', '#7dff8a');
}

// ---------------------------------------------------------------- main loop

function render() {
  const cam = camera();
  drawSky(cam);
  drawRidge(cam, 26, 60, '#5b3a78', 0.12, 0.00004, 1.7, 'band');
  drawRidge(cam, 12, 90, '#3f5a52', 0.25, 0.00009, 4.3, 'band');
  drawClouds(cam);
  drawMerapi(cam);
  drawGround(cam);
  drawRidge(cam, 0, 46, '#22402c', 0.55, 0.00016, 7.9, 'walls');
  drawRunway(cam, 0, 290);
  drawRunway(cam, 5800, TRACK_LEN);
  drawRings(cam);
  drawParticles(cam);
  drawPlane();
  drawSpeedLines();
  drawHUD();
  drawApproach();
  if (S.phase === 'start') drawStart();
  else if (S.phase === 'pause') drawPause();
  else if (S.phase === 'crash') drawCrash();
  else if (S.phase === 'timeup') drawTimeUp();
  else if (S.phase === 'win') drawWin();
}

let lastT = 0;
function frame(now) {
  const dt = Math.min(0.05, Math.max(0.001, (now - lastT) / 1000 || 0.016));
  lastT = now;
  S.time += dt;
  if (S.phase === 'fly') step(dt);
  else if (S.phase === 'rollout') stepRollout(dt);
  else if (S.messageT > 0) S.messageT -= dt;
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Test and autopilot handle: state, rings, and the ground function, read-only use.
window.__dawnrun = {
  state: S,
  rings: rings,
  reset: startFlight,
  groundH: groundH,
  ringList: function () { return rings; },
};
