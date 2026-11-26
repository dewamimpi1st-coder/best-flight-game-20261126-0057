/* Merapi Ring Run — an original chase-view flight game.
   Fly a little prop plane down the Merapi valley, through 12 glowing rings,
   and land on the far runway before the clock runs out. All art is drawn
   here on canvas; no images, no network, no downloaded assets.
   v2: controls fixed (bank right now really turns right), moving / bonus /
   shrinking rings, combo timer, speed streaks, trees, next-ring guide,
   final-approach helper, Merapi cone, landing rollout. */

(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = 1280, H = 800;
  const CX = W / 2;
  const FOCAL = 560;                 // perspective focal length
  const RUN_TIME = 150;              // seconds on the clock
  const RING_COUNT = 12;
  const TRACK_END = 12400;           // far runway starts near here
  const SHOT_T = 3.25;               // frozen clock for deterministic shots
  const COMBO_WINDOW = 8;            // seconds between rings before the combo dies

  // ---- seeded randomness: the same valley, rings and weather every run ----
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rng = mulberry32(20261126);
  const ridgePhase = [rng() * 6.28, rng() * 6.28, rng() * 6.28, rng() * 6.28];
  const cloudSeed = [];
  for (let i = 0; i < 14; i++) cloudSeed.push({ x: rng(), y: 0.06 + rng() * 0.2, s: 0.5 + rng() * 1.1, v: 4 + rng() * 9 });
  // Trees lining the valley floor: ground detail that rushes past at speed.
  const treeSeed = [];
  for (let i = 0; i < 260; i++) {
    const side = rng() < 0.5 ? -1 : 1;
    treeSeed.push({ x: side * (130 + rng() * 720), z: rng() * 12400, s: 0.7 + rng() * 0.9 });
  }

  // Rings down the valley: fixed, seeded positions, but each ring has a
  // personality — later rings bob, drift sideways, shrink, and two gold
  // bonus rings are worth more. The run ramps up as it goes on.
  // The course is a random walk, not independent jumps: consecutive rings
  // are never farther apart than the plane can actually fly between them.
  const rings = [];
  let walkX = 0, walkY = 220 + Math.round(rng() * 120);
  for (let i = 0; i < RING_COUNT; i++) {
    walkX = Math.max(-320, Math.min(320, walkX + Math.round((rng() * 2 - 1) * 200)));
    if (i > 0) walkY = Math.max(160, Math.min(800, walkY + Math.round((rng() * 2 - 1) * 120)));
    // The last two rings are the glide path into the runway: low, near the
    // centreline, so the run ends in a landing instead of a trap.
    if (i === 10) { walkX = Math.round(walkX * 0.5); walkY = Math.min(walkY, 200); }
    if (i === 11) { walkX = 0; walkY = 120; }
    const late = i / (RING_COUNT - 1);          // 0 at ring 1, 1 at ring 12
    const bonus = i === 5 || i === 9;           // gold bonus rings
    const mover = i >= 3;                       // rings 4+ move
    rings.push({
      z: 1600 + i * 920,
      x: walkX,
      y: walkY,
      r: bonus ? 70 : Math.round(95 - late * 17),   // 95 down to 78
      bob: mover ? 30 + late * 45 : 0,               // vertical bob amplitude
      bobFreq: 0.5 + rng() * 0.5 + late * 0.4,
      drift: i >= 6 ? 45 + late * 55 : 0,            // sideways drift amplitude
      driftFreq: 0.35 + rng() * 0.3,
      phase: rng() * 6.28,
      bonus,
      passed: false, missed: false,
    });
  }
  // Where a ring actually is right now (its bob/drift at flight time t).
  function ringPos(r, t) {
    return {
      x: r.x + r.drift * Math.sin(t * r.driftFreq + r.phase),
      y: r.y + r.bob * Math.sin(t * r.bobFreq + r.phase),
      r: r.r,
    };
  }
  function nextRing() {
    return rings.find((r) => !r.passed && !r.missed && r.z - S.dist > 4);
  }

  // ---- terrain: valley floor near the track, ridges rising to both sides ----
  function groundH(x, z) {
    const side = Math.abs(x);
    const ridge =
      260 * Math.sin(z * 0.00042 + ridgePhase[0]) * Math.sin(x * 0.0011 + ridgePhase[1]) +
      150 * Math.sin(z * 0.0011 + ridgePhase[2]) * Math.sin(x * 0.0023 + ridgePhase[3]) +
      90 * Math.sin(z * 0.0029 + x * 0.004);
    const carve = Math.max(0, 1 - side / 700);      // wide flat valley floor
    const rough = 40 + Math.max(0, ridge) * (1 - carve * 0.96) + side * side * 0.00045;
    // Both runways are flat, safe strips, blending out over 600 of track distance.
    let flat = 0;
    if (side < 90) {
      if (z < 1000) flat = 1;
      else if (z < 1600) flat = 1 - (z - 1000) / 600;
      if (z > 11400 && z < 12500) flat = 1;
      else if (z > 10800 && z <= 11400) flat = (z - 10800) / 600;
    }
    return 40 + (rough - 40) * (1 - flat);
  }
  function riverX(z) { return 210 * Math.sin(z * 0.00038 + 1.7) - 60 * Math.sin(z * 0.0011 + 0.4); }

  // ---- state ----
  const S = {
    mode: 'title',        // title | fly | pause | crash | rollout | land | done
    t: 0,                 // flight clock (s)
    timeLeft: RUN_TIME,
    dist: 0, px: 0, alt: 60,
    speed: 0, throttle: 0,
    bank: 0, pitch: 0, heading: 90,   // heading: 90 = east, down the valley
    score: 0, combo: 0, bestCombo: 0, lastRingT: -99,
    ringsHit: 0, bonusHit: 0, perfectHit: 0, boost: false,
    msg: '', msgT: 0, flash: 0,
    shake: 0, prop: 0, rolloutT: 0,
    keys: {}, mouseX: 0.5, mouseY: 0.5, mouseSeen: false,
    crashWhy: '', landBonus: 0,
  };

  function reset() {
    S.mode = 'fly'; S.t = 0; S.timeLeft = RUN_TIME;
    S.dist = 0; S.px = 0; S.alt = 46;
    S.speed = 0; S.throttle = 55;
    S.bank = 0; S.pitch = 0; S.heading = 90;
    S.score = 0; S.combo = 0; S.bestCombo = 0; S.lastRingT = -99;
    S.ringsHit = 0; S.bonusHit = 0; S.perfectHit = 0; S.boost = false;
    S.msg = 'TAKE OFF — FOLLOW THE RINGS'; S.msgT = 4; S.flash = 0; S.shake = 0;
    S.rolloutT = 0;
    for (const r of rings) { r.passed = false; r.missed = false; }
  }

  function beep(freq, dur, vol) {
    try {
      if (!S.audio) return;
      const o = S.audio.createOscillator(), g = S.audio.createGain();
      o.frequency.value = freq; o.type = 'sine';
      g.gain.setValueAtTime(vol, S.audio.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, S.audio.currentTime + dur);
      o.connect(g); g.connect(S.audio.destination);
      o.start(); o.stop(S.audio.currentTime + dur);
    } catch (e) { /* sound is optional */ }
  }
  function ensureAudio() {
    try {
      if (!S.audio) S.audio = new (window.AudioContext || window.webkitAudioContext)();
      if (S.audio.state === 'suspended') S.audio.resume();
    } catch (e) { /* no audio */ }
  }

  // ---- input ----
  const KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    ShiftLeft: 'thrUp', ShiftRight: 'thrUp', ControlLeft: 'thrDn', ControlRight: 'thrDn',
    Equal: 'thrUp', Minus: 'thrDn', Space: 'boost',
  };
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Enter') { ensureAudio(); if (S.mode === 'title' || S.mode === 'crash' || S.mode === 'land' || S.mode === 'done') reset(); }
    if (e.code === 'KeyP') { if (S.mode === 'fly') S.mode = 'pause'; else if (S.mode === 'pause') S.mode = 'fly'; }
    if (e.code === 'KeyR') { if (S.mode !== 'title') reset(); }
    const k = KEYMAP[e.code];
    if (k) { S.keys[k] = true; if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault(); }
  });
  window.addEventListener('keyup', (e) => { const k = KEYMAP[e.code]; if (k) S.keys[k] = false; });
  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    S.mouseX = (e.clientX - r.left) / r.width;
    S.mouseY = (e.clientY - r.top) / r.height;
    S.mouseSeen = true;
  });
  canvas.addEventListener('mousedown', (e) => {
    ensureAudio();
    if (S.mode === 'title' || S.mode === 'crash' || S.mode === 'land' || S.mode === 'done') { reset(); return; }
    S.boost = true;
  });
  window.addEventListener('mouseup', () => { S.boost = false; });

  // ---- flight model ----
  function update(dt) {
    if (S.mode === 'rollout') {
      // Touchdown rollout: the plane decelerates along the runway, then the
      // result screen appears. This is the landing sequence, not a freeze.
      S.rolloutT += dt;
      S.speed = Math.max(0, S.speed - 70 * dt);
      S.throttle = 0;
      S.dist += S.speed * 2.2 * dt;
      S.alt = groundH(0, S.dist) + 6;
      S.prop += dt * (6 + S.throttle * 0.35);
      S.bank *= Math.max(0, 1 - 4 * dt);
      if (S.rolloutT > 2.4) {
        S.mode = 'land';
        S.landBonus = 500 + Math.round(S.timeLeft) * 5;
        S.score += S.landBonus;
        beep(660, 0.2, 0.12); beep(990, 0.3, 0.1);
      }
      if (S.msgT > 0) S.msgT -= dt;
      return;
    }
    if (S.mode !== 'fly') return;
    S.t += dt;
    S.timeLeft -= dt;
    if (S.timeLeft <= 0) { S.timeLeft = 0; S.mode = 'done'; S.msg = 'TIME UP'; return; }

    // throttle -> speed (knots)
    if (S.keys.thrUp) S.throttle = Math.min(100, S.throttle + 26 * dt);
    if (S.keys.thrDn) S.throttle = Math.max(0, S.throttle - 30 * dt);
    const targetSpeed = 55 + S.throttle * 1.5 + (S.boost || S.keys.boost ? 55 : 0);
    S.speed += (targetSpeed - S.speed) * Math.min(1, 1.4 * dt);

    // bank -> heading and lateral drift; pitch -> climb / sink.
    // Banking right turns the nose right (heading rises from 90) and the
    // plane drifts right through the valley — a coordinated turn. Wings
    // level, the nose gently settles back onto the valley track, so the
    // plane never wanders off on its own.
    let bankTarget = 0, pitchTarget = 0;
    if (S.keys.left) bankTarget = -1;
    if (S.keys.right) bankTarget = 1;
    if (S.keys.up) pitchTarget = 1;
    if (S.keys.down) pitchTarget = -1;
    if (bankTarget === 0 && pitchTarget === 0 && S.mouseSeen) {
      bankTarget = Math.max(-1, Math.min(1, (S.mouseX - 0.5) * 2.4));
      pitchTarget = Math.max(-1, Math.min(1, (0.5 - S.mouseY) * 2.0));
    }
    S.bank += (bankTarget * 0.62 - S.bank) * Math.min(1, 5 * dt);
    S.pitch += (pitchTarget * 0.6 - S.pitch) * Math.min(1, 4 * dt);
    S.heading += S.bank * 34 * dt;
    // Wings level, the nose settles back onto the valley track quickly, so
    // the plane stops drifting sideways instead of wandering off course.
    if (Math.abs(bankTarget) < 0.05) S.heading += (90 - S.heading) * 0.55 * dt;
    S.heading = Math.max(20, Math.min(160, S.heading));

    // stall: slow flight sinks, but never while rolling on a runway strip
    const groundNow = groundH(S.px, S.dist);
    const onStrip = (S.dist < 950 || (S.dist > 11450 && S.dist < 12450)) && Math.abs(S.px) < 48;
    let vs = S.pitch * S.speed * 0.7;
    if (S.speed < 95 && S.alt > groundNow + 40) vs -= (95 - S.speed) * 1.6;
    S.alt += vs * dt;
    if (S.alt > 2000) { S.alt = 2000; if (S.msgT <= 0) { S.msg = 'CEILING 2000 FT'; S.msgT = 2; } }
    if (onStrip && S.alt <= groundNow + 8 && vs <= 0) S.alt = groundNow + 6;   // rolling on the strip
    if (S.alt < 5) S.alt = 5;

    // Coordinated turn: lateral speed follows the nose, plus a small direct
    // bank response so the plane answers the stick immediately.
    const dev = (S.heading - 90) * Math.PI / 180;
    S.px += S.speed * 2.2 * Math.sin(dev) * dt + S.bank * S.speed * 0.8 * dt;
    S.px = Math.max(-900, Math.min(900, S.px));
    S.dist += S.speed * 2.2 * dt;
    S.prop += dt * (6 + S.throttle * 0.35);

    // combo timer: dawdle more than COMBO_WINDOW seconds between rings and
    // the combo is gone.
    if (S.combo > 0 && S.t - S.lastRingT > COMBO_WINDOW) {
      S.combo = 0;
      S.msg = 'COMBO LOST — TOO SLOW'; S.msgT = 1.6;
    }

    // rings (moving: judged against where the ring is right now)
    for (const r of rings) {
      if (r.passed || r.missed) continue;
      if (S.dist >= r.z) {
        const pos = ringPos(r, S.t);
        const dx = Math.abs(S.px - pos.x), dy = Math.abs(S.alt - pos.y);
        if (dx < pos.r + 25 && dy < pos.r + 25) {
          r.passed = true; S.ringsHit++;
          S.combo++; S.bestCombo = Math.max(S.bestCombo, S.combo);
          S.lastRingT = S.t;
          const base = r.bonus ? 250 : 100;
          const pts = base + (S.combo - 1) * 25;
          let extra = '';
          if (dx < 45 && dy < 45) { S.score += 50; S.perfectHit++; extra = '  PERFECT +50'; beep(1568, 0.2, 0.09); }
          if (r.bonus) S.bonusHit++;
          S.score += pts;
          S.msg = (r.bonus ? 'GOLD RING +' : 'RING +') + pts + (S.combo > 1 ? '  COMBO x' + S.combo : '') + extra;
          S.msgT = 2.2; S.flash = 0.5; beep(880, 0.18, 0.12); beep(1320, 0.22, 0.08);
        } else {
          r.missed = true; S.combo = 0;
          S.msg = 'RING MISSED'; S.msgT = 1.6; beep(220, 0.25, 0.1);
        }
      }
    }

    // terrain collision (never on a runway strip: that is a roll, not a crash)
    const ground = groundH(S.px, S.dist);
    if (!onStrip && S.alt <= ground + 28) {
      S.mode = 'crash'; S.crashWhy = 'TERRAIN — YOU FLEW INTO THE MOUNTAIN';
      S.shake = 1; beep(140, 0.5, 0.2); return;
    }
    if (S.alt < ground + 90 && S.dist > 900 && S.msgT <= 0) { S.msg = 'PULL UP — TERRAIN'; S.msgT = 1.2; }

    // landing on the far runway: touchdown starts a rollout, not a freeze
    if (S.dist > 11500 && S.dist < 12400) {
      if (Math.abs(S.px) < 48 && S.alt < 85 && S.speed < 175) {
        S.mode = 'rollout'; S.rolloutT = 0;
        S.msg = 'TOUCHDOWN — ROLLING OUT'; S.msgT = 2.4;
        beep(660, 0.2, 0.12);
        return;
      }
      if (S.dist > 12300 && S.alt < 70 && Math.abs(S.px) >= 48) {
        S.mode = 'crash'; S.crashWhy = 'OVERSHOT — YOU MISSED THE RUNWAY'; S.shake = 1; return;
      }
    }
    if (S.dist >= 12400 && S.mode === 'fly') { S.mode = 'done'; S.msg = 'RUN OVER — VALLEY COMPLETE'; }

    if (S.msgT > 0) S.msgT -= dt;
    if (S.flash > 0) S.flash -= dt;
    if (S.shake > 0) S.shake -= dt * 2;
  }

  // ---- projection ----
  function project(x, y, z) {
    const dz = z - S.dist;
    if (dz < 4) return null;
    const s = FOCAL / dz;
    const horizonY = 330 + S.pitch * 60;
    return {
      x: CX + (x - S.px) * s * 0.9,
      y: horizonY - (y - S.alt) * s,
      s,
    };
  }

  // ---- drawing ----
  function drawSky(t) {
    const g = ctx.createLinearGradient(0, 0, 0, 420);
    g.addColorStop(0, '#16294d'); g.addColorStop(0.55, '#3d6a94');
    g.addColorStop(0.82, '#e8965a'); g.addColorStop(1, '#f7c873');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, 430);
    // sun
    const sx = W * 0.72, sy = 285;
    const sg = ctx.createRadialGradient(sx, sy, 8, sx, sy, 130);
    sg.addColorStop(0, 'rgba(255,236,180,0.95)'); sg.addColorStop(0.35, 'rgba(255,190,110,0.55)');
    sg.addColorStop(1, 'rgba(255,170,90,0)');
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sx, sy, 130, 0, 6.2832); ctx.fill();
    ctx.fillStyle = '#ffedbe'; ctx.beginPath(); ctx.arc(sx, sy, 34, 0, 6.2832); ctx.fill();
    // Merapi itself, far down the valley: a dark cone with a snow cap and a
    // slow smoke plume. It drifts a little with the heading, like the world.
    const horizonY = 330 + S.pitch * 60;
    const coneX = CX + (90 - S.heading) * 3.2;
    const apexY = horizonY - 252, baseY = horizonY + 30, halfW = 250;
    ctx.fillStyle = '#33465e';
    ctx.beginPath(); ctx.moveTo(coneX - halfW, baseY); ctx.lineTo(coneX, apexY); ctx.lineTo(coneX + halfW, baseY); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(240,244,250,0.9)';
    ctx.beginPath(); ctx.moveTo(coneX - 52, apexY + 52); ctx.lineTo(coneX, apexY); ctx.lineTo(coneX + 52, apexY + 52); ctx.lineTo(coneX + 26, apexY + 66); ctx.lineTo(coneX, apexY + 54); ctx.lineTo(coneX - 26, apexY + 66); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(235,238,244,0.5)';
    for (let i = 0; i < 3; i++) {
      const ph = (t * 0.12 + i / 3) % 1;
      ctx.beginPath();
      ctx.ellipse(coneX + 14 + ph * 46, apexY - 8 - ph * 52, 16 + ph * 22, 7 + ph * 9, 0, 0, 6.2832);
      ctx.fill();
    }
    // clouds drift slowly
    ctx.fillStyle = 'rgba(255,244,226,0.85)';
    for (const c of cloudSeed) {
      const cxp = ((c.x * W + t * c.v) % (W + 260)) - 130;
      const cy = c.y * H;
      ctx.beginPath();
      ctx.ellipse(cxp, cy, 74 * c.s, 15 * c.s, 0, 0, 6.2832);
      ctx.ellipse(cxp + 42 * c.s, cy + 6, 52 * c.s, 12 * c.s, 0, 0, 6.2832);
      ctx.fill();
    }
  }

  function ridgePath(baseY, amp, freq, phase, color) {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(0, 430);
    for (let x = 0; x <= W; x += 16) {
      const y = baseY - amp * (0.55 + 0.45 * Math.sin(x * freq + phase + Math.sin(x * 0.004 + phase) * 1.3));
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, 430); ctx.closePath(); ctx.fill();
  }

  function drawGround(t) {
    const horizonY = 330 + S.pitch * 60;
    // valley floor
    const g = ctx.createLinearGradient(0, horizonY, 0, H);
    g.addColorStop(0, '#7d9b58'); g.addColorStop(0.5, '#4e7a3c'); g.addColorStop(1, '#2c5226');
    ctx.fillStyle = g;
    ctx.fillRect(0, horizonY, W, H - horizonY);
    // far ridges
    ridgePath(horizonY + 6, 150, 0.004, ridgePhase[0], '#4a5f7e');
    ridgePath(horizonY + 26, 110, 0.006, ridgePhase[1], '#3a4f68');
    ridgePath(horizonY + 58, 74, 0.009, ridgePhase[2], '#2c4258');
    // snow caps only where the far ridge actually peaks, so none float mid-slope
    ctx.fillStyle = 'rgba(240,244,250,0.85)';
    for (let x = 40; x < W; x += 130) {
      const v = 0.55 + 0.45 * Math.sin(x * 0.004 + ridgePhase[0] + Math.sin(x * 0.004 + ridgePhase[0]) * 1.3);
      if (v < 0.86) continue;
      const y = horizonY + 6 - 150 * v;
      ctx.beginPath(); ctx.moveTo(x - 26, y + 16); ctx.lineTo(x, y - 6); ctx.lineTo(x + 26, y + 16); ctx.closePath(); ctx.fill();
    }
    // river: winding band rushing toward the viewer
    ctx.beginPath();
    let first = true;
    for (let dz = 60; dz <= 3200; dz += 140) {
      const p = project(riverX(S.dist + dz), groundH(riverX(S.dist + dz), S.dist + dz) + 4, S.dist + dz);
      if (!p) continue;
      const w = Math.max(1.5, Math.min(48, 46 * p.s));
      if (first) { ctx.moveTo(p.x - w, p.y); first = false; }
      else ctx.lineTo(p.x - w, p.y);
    }
    for (let dz = 3200; dz >= 60; dz -= 140) {
      const p = project(riverX(S.dist + dz), groundH(riverX(S.dist + dz), S.dist + dz) + 4, S.dist + dz);
      if (!p) continue;
      const w = Math.max(1.5, Math.min(48, 46 * p.s));
      ctx.lineTo(p.x + w, p.y);
    }
    ctx.closePath();
    ctx.fillStyle = '#3f8fbf'; ctx.fill();
    ctx.strokeStyle = 'rgba(210,240,255,0.7)'; ctx.lineWidth = 1.5; ctx.stroke();
    // trees: small dark triangles that rush past and sell the speed
    for (const tr of treeSeed) {
      const dz = tr.z - S.dist;
      if (dz < 40 || dz > 3000) continue;
      const p = project(tr.x, groundH(tr.x, tr.z) + 4, tr.z);
      if (!p || p.x < -20 || p.x > W + 20 || p.y < horizonY) continue;
      const h = Math.max(2, 26 * p.s * tr.s), w = h * 0.55;
      ctx.fillStyle = '#1d3d1e';
      ctx.beginPath(); ctx.moveTo(p.x, p.y - h); ctx.lineTo(p.x - w, p.y); ctx.lineTo(p.x + w, p.y); ctx.closePath(); ctx.fill();
    }
    // perspective field grid
    ctx.strokeStyle = 'rgba(20,40,20,0.35)'; ctx.lineWidth = 1;
    for (let gx = -800; gx <= 800; gx += 160) {
      const a = project(gx, groundH(gx, S.dist + 30) + 2, S.dist + 30);
      const b = project(gx, groundH(gx, S.dist + 3200) + 2, S.dist + 3200);
      if (!a || !b) continue;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    for (let dz = 120; dz <= 3200; dz *= 1.55) {
      const a = project(-900, groundH(-900, S.dist + dz) + 2, S.dist + dz);
      const b = project(900, groundH(900, S.dist + dz) + 2, S.dist + dz);
      if (!a || !b) continue;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
  }

  function drawRunway(z0, z1, label) {
    const a0 = Math.max(z0, S.dist + 8);   // the strip behind the plane is not drawn
    if (a0 >= z1) return;
    const pts = [];
    for (const [x, z] of [[-46, a0], [46, a0], [46, z1], [-46, z1]]) {
      const p = project(x, groundH(x, z) + 3, z);
      if (p) pts.push(p);
    }
    if (pts.length < 3) return;
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fillStyle = '#23262b'; ctx.fill();
    ctx.strokeStyle = '#e8e8e8'; ctx.lineWidth = 2; ctx.stroke();
    // centre dashes
    ctx.fillStyle = '#f5f5f5';
    for (let z = a0 + 60; z < z1; z += 130) {
      const a = project(0, groundH(0, z) + 4, z);
      const b = project(0, groundH(0, z + 55) + 4, z + 55);
      if (!a || !b) continue;
      ctx.beginPath(); ctx.moveTo(a.x - 2 * a.s, a.y); ctx.lineTo(a.x + 2 * a.s, a.y);
      ctx.lineTo(b.x + 2 * b.s, b.y); ctx.lineTo(b.x - 2 * b.s, b.y); ctx.closePath(); ctx.fill();
    }
    if (label) {
      const p = project(0, groundH(0, z1) + 6, z1);
      if (p) {
        ctx.fillStyle = '#ffe9a8'; ctx.font = 'bold 20px monospace'; ctx.textAlign = 'center';
        ctx.fillText(label, p.x, p.y - 14);
      }
    }
  }

  function drawRings() {
    const list = rings.filter((r) => r.z - S.dist > 4 && r.z - S.dist < 5200)
      .sort((a, b) => b.z - a.z);
    for (const r of list) {
      const pos = ringPos(r, S.t);
      const p = project(pos.x, pos.y, r.z);
      if (!p) continue;
      const rx = pos.r * p.s * 0.9, ry = pos.r * p.s;
      if (rx < 2) continue;
      const col = r.passed ? '#57e389' : r.missed ? '#8a94a6' : r.bonus ? '#ffd94a' : '#ffb02e';
      ctx.save();
      ctx.shadowColor = col; ctx.shadowBlur = 22;
      ctx.strokeStyle = col; ctx.lineWidth = Math.max(2, 7 * p.s);
      ctx.beginPath(); ctx.ellipse(p.x, p.y, rx, ry, 0, 0, 6.2832); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = Math.max(1, 2 * p.s);
      ctx.beginPath(); ctx.ellipse(p.x, p.y, rx, ry, 0, 0, 6.2832); ctx.stroke();
      ctx.restore();
      // (The next-ring label lives in drawRingGuide, with the distance.)
    }
  }

  // Wind streaks: radial lines that rush outward as speed rises, so fast
  // flight feels fast even when the valley below is far away.
  function drawSpeedStreaks() {
    if (S.speed < 130 || (S.mode !== 'fly' && S.mode !== 'rollout')) return;
    const k = Math.min(1, (S.speed - 130) / 120);
    const n = Math.round(10 + 22 * k);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.28 * k).toFixed(2) + ')';
    ctx.lineWidth = 2;
    for (let i = 0; i < n; i++) {
      const ang = (i * 2.39996 + 0.7) % 6.2832;   // golden-angle spread
      const rr = ((S.dist * 2.6 + i * 173) % 620) / 620;
      const r0 = 180 + rr * 420, r1 = r0 + 26 + 44 * k;
      const cxp = CX + Math.cos(ang) * r0, cyp = 420 + Math.sin(ang) * r0 * 0.75;
      const ex = CX + Math.cos(ang) * r1, ey = 420 + Math.sin(ang) * r1 * 0.75;
      ctx.beginPath(); ctx.moveTo(cxp, cyp); ctx.lineTo(ex, ey); ctx.stroke();
    }
    ctx.restore();
  }

  function drawPlane(t) {
    const px = CX, py = 560;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(S.bank * 0.55 + S.pitch * 0.12);
    // shadow on the ground below
    const g = groundH(S.px, S.dist + 60);
    const shScale = Math.max(0.25, 1 - (S.alt - g) / 900);
    ctx.save();
    ctx.translate(0, 150 * shScale + 40); ctx.scale(shScale, shScale * 0.32);
    ctx.fillStyle = 'rgba(10,20,12,0.35)';
    ctx.beginPath(); ctx.ellipse(0, 0, 74, 16, 0, 0, 6.2832); ctx.fill();
    ctx.restore();
    // tail + fuselage
    ctx.fillStyle = '#c8452c';
    ctx.beginPath(); ctx.moveTo(-14, 26); ctx.lineTo(-30, 66); ctx.lineTo(-6, 60); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(14, 26); ctx.lineTo(30, 66); ctx.lineTo(6, 60); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e8542f';
    ctx.beginPath(); ctx.ellipse(0, 0, 26, 92, 0, 0, 6.2832); ctx.fill();
    ctx.fillStyle = '#f4f6f8';
    ctx.beginPath(); ctx.ellipse(0, -18, 15, 30, 0, 0, 6.2832); ctx.fill();
    ctx.fillStyle = '#9fd8ef';
    ctx.beginPath(); ctx.ellipse(0, -34, 10, 18, 0, 0, 6.2832); ctx.fill();
    // wings
    ctx.fillStyle = '#f7c948';
    ctx.beginPath(); ctx.moveTo(-16, -6); ctx.lineTo(-138, 26); ctx.lineTo(-132, 46); ctx.lineTo(-12, 22); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(16, -6); ctx.lineTo(138, 26); ctx.lineTo(132, 46); ctx.lineTo(12, 22); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#c8452c';
    ctx.fillRect(-138, 26, 12, 18); ctx.fillRect(126, 26, 12, 18);
    // prop blur + hub
    ctx.save();
    ctx.translate(0, -96); ctx.rotate(S.prop);
    ctx.fillStyle = 'rgba(40,44,52,0.5)';
    ctx.fillRect(-4, -52, 8, 104);
    ctx.restore();
    ctx.fillStyle = '#2b2f36';
    ctx.beginPath(); ctx.arc(0, -96, 10, 0, 6.2832); ctx.fill();
    ctx.fillStyle = '#f7c948';
    ctx.beginPath(); ctx.arc(0, -96, 4, 0, 6.2832); ctx.fill();
    ctx.restore();
    // nav lights
    const blink = (t % 1) < 0.5;
    if (blink) {
      ctx.fillStyle = '#ff4040'; ctx.beginPath(); ctx.arc(px - 138, py + 34, 5, 0, 6.2832); ctx.fill();
      ctx.fillStyle = '#40ff70'; ctx.beginPath(); ctx.arc(px + 138, py + 34, 5, 0, 6.2832); ctx.fill();
    }
  }

  // ---- HUD + instruments ----
  function litText(txt, x, y, size, color, align) {
    ctx.save();
    ctx.font = 'bold ' + size + 'px monospace';
    ctx.textAlign = align || 'left'; ctx.textBaseline = 'alphabetic';
    ctx.shadowColor = color; ctx.shadowBlur = 10;
    ctx.fillStyle = color;
    ctx.fillText(txt, x, y);
    ctx.restore();
  }

  function drawCompass() {
    ctx.save();
    ctx.fillStyle = 'rgba(8,14,10,0.55)'; ctx.fillRect(CX - 190, 14, 380, 34);
    ctx.strokeStyle = '#57e389'; ctx.lineWidth = 1; ctx.strokeRect(CX - 190, 14, 380, 34);
    const names = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    for (let d = -60; d <= 60; d += 15) {
      let h = Math.round(S.heading + d);
      h = ((h % 360) + 360) % 360;
      const x = CX + d * 3;
      ctx.fillStyle = '#bfe9cd'; ctx.font = '12px monospace'; ctx.textAlign = 'center';
      ctx.fillText(names[h] || String(h), x, 36);
      ctx.fillRect(x - 0.5, 16, 1, 6);
    }
    ctx.fillStyle = '#ffb02e';
    ctx.beginPath(); ctx.moveTo(CX - 7, 14); ctx.lineTo(CX + 7, 14); ctx.lineTo(CX, 24); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function drawDial(cx, cy, r, label, valueText, frac, color) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = '#0b1410';
    ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.2832); ctx.fill();
    ctx.strokeStyle = '#2f6b4a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.2832); ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, 0, r - 9, -2.356, -2.356 + frac * 4.712); ctx.stroke();
    ctx.fillStyle = '#d9ffe9'; ctx.font = 'bold 15px monospace'; ctx.textAlign = 'center';
    ctx.fillText(valueText, 0, 5);
    ctx.fillStyle = '#8fb8a2'; ctx.font = '11px monospace';
    ctx.fillText(label, 0, r + 16);
    ctx.restore();
  }

  function drawHorizon(cx, cy, r) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.2832); ctx.clip();
    ctx.rotate(-S.bank * 0.55);
    const off = S.pitch * 46;
    ctx.fillStyle = '#2f6fb2'; ctx.fillRect(-r, -r + off, r * 2, r - off);
    ctx.fillStyle = '#7a5a34'; ctx.fillRect(-r, off, r * 2, r - off + 1);
    ctx.strokeStyle = '#f5f5f5'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-r, off); ctx.lineTo(r, off); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = '#2f6b4a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.stroke();
    ctx.fillStyle = '#f7c948';
    ctx.beginPath(); ctx.moveTo(cx - 16, cy); ctx.lineTo(cx - 4, cy); ctx.lineTo(cx, cy - 5);
    ctx.lineTo(cx + 4, cy); ctx.lineTo(cx + 16, cy); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#8fb8a2'; ctx.font = '11px monospace'; ctx.textAlign = 'center';
    ctx.fillText('ATTITUDE', cx, cy + r + 16);
  }

  function drawInstruments() {
    // glass panel
    ctx.fillStyle = 'rgba(6,12,9,0.72)';
    ctx.fillRect(0, H - 118, W, 118);
    ctx.strokeStyle = '#2f6b4a'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, H - 118); ctx.lineTo(W, H - 118); ctx.stroke();
    drawHorizon(120, H - 62, 42);
    drawDial(290, H - 62, 42, 'AIRSPEED KT', String(Math.round(S.speed)), S.speed / 320, '#57e389');
    drawDial(450, H - 62, 42, 'ALTITUDE FT', String(Math.round(S.alt)), S.alt / 2000, '#ffb02e');
    drawDial(610, H - 62, 42, 'HEADING', String(Math.round(S.heading)).padStart(3, '0') + '°', S.heading / 360, '#7cc7ff');
    // throttle
    ctx.save();
    ctx.translate(760, H - 62);
    ctx.fillStyle = '#0b1410'; ctx.fillRect(-70, -42, 140, 84);
    ctx.strokeStyle = '#2f6b4a'; ctx.strokeRect(-70, -42, 140, 84);
    ctx.fillStyle = '#57e389';
    const th = S.throttle / 100;
    ctx.fillRect(-58, 30 - th * 60, 26, th * 60);
    ctx.fillStyle = '#d9ffe9'; ctx.font = 'bold 14px monospace'; ctx.textAlign = 'left';
    ctx.fillText('THR ' + Math.round(S.throttle) + '%', -26, 4);
    ctx.fillStyle = '#8fb8a2'; ctx.font = '11px monospace';
    ctx.fillText('THROTTLE', -26, 22);
    ctx.restore();
    // score block
    ctx.save();
    ctx.translate(1050, H - 62);
    ctx.fillStyle = '#0b1410'; ctx.fillRect(-80, -42, 230, 84);
    ctx.strokeStyle = '#2f6b4a'; ctx.strokeRect(-80, -42, 230, 84);
    litText('SCORE ' + S.score, -68, -12, 20, '#ffe9a8', 'left');
    ctx.fillStyle = '#bfe9cd'; ctx.font = '13px monospace'; ctx.textAlign = 'left';
    ctx.fillText('RINGS ' + S.ringsHit + '/' + RING_COUNT + '   COMBO x' + Math.max(1, S.combo), -68, 14);
    ctx.fillText('BEST COMBO x' + S.bestCombo, -68, 32);
    ctx.restore();
  }

  // Next-ring guide: a marker (or an edge arrow when the ring is off-screen)
  // plus a dashed line from the nose and the distance, so the player always
  // knows where to fly next instead of hunting for the next glow.
  function drawRingGuide(t) {
    if (S.mode !== 'fly') return;
    const next = nextRing();
    if (!next) return;
    const pos = ringPos(next, S.t);
    const dz = Math.max(0, Math.round(next.z - S.dist));
    const p = project(pos.x, pos.y, next.z);
    const label = (next.bonus ? 'GOLD ' : '') + 'RING ' + (rings.indexOf(next) + 1) + ' · ' + dz + 'm';
    const col = next.bonus ? '#ffd94a' : '#ffb02e';
    const onScreen = p && p.x > 30 && p.x < W - 30 && p.y > 60 && p.y < H - 140;
    ctx.save();
    if (onScreen) {
      // dashed guide line from the nose to the ring
      ctx.strokeStyle = 'rgba(255,176,46,0.55)'; ctx.lineWidth = 2;
      ctx.setLineDash([10, 10]);
      ctx.beginPath(); ctx.moveTo(CX, 520); ctx.lineTo(p.x, p.y); ctx.stroke();
      ctx.setLineDash([]);
      // pulsing diamond marker on the ring
      const pulse = 10 + 3 * Math.sin(t * 6);
      ctx.strokeStyle = col; ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - pulse); ctx.lineTo(p.x + pulse, p.y);
      ctx.lineTo(p.x, p.y + pulse); ctx.lineTo(p.x - pulse, p.y);
      ctx.closePath(); ctx.stroke();
      ctx.fillStyle = col; ctx.font = 'bold 14px monospace'; ctx.textAlign = 'center';
      ctx.fillText(label, p.x, p.y - pos.r * p.s - 34);
    } else {
      // edge arrow: point from screen centre toward the ring's direction
      const tx = p ? p.x : CX + (pos.x - S.px) * 0.2;
      const ty = p ? p.y : 300;
      const ang = Math.atan2(ty - 400, tx - CX);
      const ax = CX + Math.cos(ang) * 330, ay = 400 + Math.sin(ang) * 250;
      ctx.translate(ax, ay); ctx.rotate(ang);
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-12, -13); ctx.lineTo(-12, 13); ctx.closePath(); ctx.fill();
      ctx.rotate(-ang); ctx.translate(-ax, -ay);
      ctx.fillStyle = col; ctx.font = 'bold 15px monospace'; ctx.textAlign = 'center';
      ctx.fillText(label, ax, ay + 34);
    }
    ctx.restore();
  }

  // Final-approach helper: line-up bar plus plain-language guidance, so the
  // landing reads as a landing instead of a guess.
  function drawApproach() {
    if (S.mode !== 'fly' || S.dist < 10200) return;
    const y = 64;
    ctx.save();
    ctx.fillStyle = 'rgba(8,14,10,0.6)'; ctx.fillRect(CX - 170, y, 340, 58);
    ctx.strokeStyle = '#57e389'; ctx.lineWidth = 1; ctx.strokeRect(CX - 170, y, 340, 58);
    // green centre zone = the runway, 96 wide in world units
    ctx.fillStyle = 'rgba(87,227,137,0.35)';
    ctx.fillRect(CX - 24, y + 8, 48, 22);
    ctx.fillStyle = '#bfe9cd'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center';
    ctx.fillText('FINAL APPROACH — LINE UP', CX, y + 46);
    // marker: where the plane is relative to the runway centreline
    const mx = CX + Math.max(-160, Math.min(160, S.px * 1.6));
    ctx.fillStyle = S.px > -48 && S.px < 48 ? '#57e389' : '#ffb02e';
    ctx.beginPath(); ctx.moveTo(mx, y + 10); ctx.lineTo(mx + 7, y + 20); ctx.lineTo(mx - 7, y + 20); ctx.closePath(); ctx.fill();
    let guide = 'ON GLIDE PATH — FLARE AND LAND';
    let col = '#7dffb0';
    if (S.alt > 160) { guide = 'TOO HIGH — DESCEND'; col = '#ffb02e'; }
    else if (S.speed > 175) { guide = 'TOO FAST — THROTTLE DOWN'; col = '#ffb02e'; }
    else if (Math.abs(S.px) >= 48) { guide = 'LINE UP — CENTRE THE RUNWAY'; col = '#ffb02e'; }
    else if (S.alt > 85) { guide = 'ON GLIDE PATH — EASE DOWN'; col = '#7dffb0'; }
    litText(guide, CX, y + 78, 17, col, 'center');
    ctx.restore();
  }

  function drawHUD(t) {
    drawCompass();
    litText('ALT ' + Math.round(S.alt) + ' FT', 24, 52, 22, '#7dffb0', 'left');
    litText('SPD ' + Math.round(S.speed) + ' KT', 24, 82, 22, '#7dffb0', 'left');
    litText('HDG ' + String(Math.round(S.heading)).padStart(3, '0') + '°', 24, 112, 22, '#7cc7ff', 'left');
    litText('TIME ' + Math.max(0, Math.ceil(S.timeLeft)) + 's', W - 24, 52, 22, '#ffe9a8', 'right');
    litText('SCORE ' + S.score, W - 24, 82, 22, '#ffe9a8', 'right');
    if (S.combo > 1) litText('COMBO x' + S.combo, W - 24, 112, 18, '#ffd94a', 'right');
    if (S.msgT > 0 && S.mode !== 'title') {
      ctx.save();
      ctx.globalAlpha = Math.min(1, S.msgT);
      // Low, over the ground: the sky band holds the rings and their labels.
      litText(S.msg, CX, H - 170, 26, S.flash > 0 ? '#ffe9a8' : '#bfe9cd', 'center');
      ctx.restore();
    }
    if (S.alt < groundH(S.px, S.dist) + 70 && S.dist > 900 && S.mode === 'fly') {
      litText('! PULL UP !', CX, 168, 24, '#ff5a4e', 'center');
    }
    // controls reminder, small
    ctx.fillStyle = 'rgba(210,235,220,0.75)'; ctx.font = '12px monospace'; ctx.textAlign = 'left';
    ctx.fillText('ARROWS / WASD fly   MOUSE steers   SHIFT throttle   SPACE boost   P pause   R restart', 24, H - 132);
  }

  function overlay(title, lines, color) {
    ctx.fillStyle = 'rgba(5,10,8,0.62)'; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.shadowColor = color; ctx.shadowBlur = 18;
    ctx.fillStyle = color; ctx.font = 'bold 54px monospace';
    ctx.fillText(title, CX, 300);
    ctx.restore();
    ctx.fillStyle = '#e8f5ec'; ctx.font = '20px monospace'; ctx.textAlign = 'center';
    lines.forEach((ln, i) => ctx.fillText(ln, CX, 350 + i * 32));
  }

  function draw(t) {
    ctx.save();
    if (S.shake > 0) ctx.translate((Math.random() - 0.5) * S.shake * 14, (Math.random() - 0.5) * S.shake * 14);
    ctx.save();
    ctx.translate(CX, 400); ctx.rotate(S.bank * 0.1); ctx.translate(-CX, -400);
    drawSky(t);
    drawGround(t);
    if (S.dist < 1400) drawRunway(0, 900, 'MERAPI FIELD');
    if (S.dist > 10200) drawRunway(11500, 12400, 'LAND HERE');
    drawRings();
    drawSpeedStreaks();
    ctx.restore();
    if (S.mode !== 'title') drawPlane(t);
    drawRingGuide(t);
    drawHUD(t);
    drawApproach();
    if (S.mode !== 'title') drawInstruments();
    ctx.restore();

    if (S.mode === 'title') {
      overlay('MERAPI RING RUN', [
        'Fly the valley. Thread all 12 glowing rings. Land before the clock runs out.',
        '',
        'ARROWS / WASD — pitch and bank      MOUSE — steer',
        'SHIFT — throttle up    CTRL — throttle down    SPACE — boost',
        'P — pause      R — restart',
        '',
        'Later rings bob and drift. GOLD rings are worth 250. Centre a ring for PERFECT +50.',
        'Chain rings within 8 seconds to build your combo.',
        '',
        'PRESS ENTER OR CLICK TO FLY',
      ], '#7dffb0');
    } else if (S.mode === 'pause') {
      overlay('PAUSED', ['Press P to keep flying', 'Score ' + S.score + '   Rings ' + S.ringsHit + '/' + RING_COUNT], '#ffe9a8');
    } else if (S.mode === 'crash') {
      overlay('CRASHED', [S.crashWhy, 'Score ' + S.score + '   Rings ' + S.ringsHit + '/' + RING_COUNT, '', 'PRESS R OR CLICK TO FLY AGAIN'], '#ff5a4e');
    } else if (S.mode === 'rollout') {
      // no overlay: the player watches the plane roll out on the runway
    } else if (S.mode === 'land') {
      overlay('TOUCHDOWN!', ['You landed on the far runway.', 'Landing bonus +' + S.landBonus, 'FINAL SCORE ' + S.score, 'Rings ' + S.ringsHit + '/' + RING_COUNT + '   Gold ' + S.bonusHit + '   Perfect ' + S.perfectHit + '   Best combo x' + S.bestCombo, '', 'PRESS R OR CLICK TO FLY AGAIN'], '#7dffb0');
    } else if (S.mode === 'done') {
      overlay('RUN OVER', [S.msg, 'Score ' + S.score + '   Rings ' + S.ringsHit + '/' + RING_COUNT + '   Best combo x' + S.bestCombo, '', 'PRESS R OR CLICK TO FLY AGAIN'], '#ffe9a8');
    }
  }

  // ---- screenshot states: fixed, deterministic renders of the game's own code ----
  function applyShot(name) {
    reset();
    if (name === 'takeoff') {
      S.dist = 120; S.alt = 62; S.speed = 96; S.throttle = 72; S.pitch = 0.08;
      S.timeLeft = 150;
      S.msg = 'TAKE OFF — FOLLOW THE RINGS'; S.msgT = 4;
    } else if (name === 'ring') {
      const pos = ringPos(rings[3], SHOT_T);
      S.dist = 1600 + 3 * 920 - 420; S.px = pos.x - 40; S.alt = pos.y + 30;
      S.speed = 210; S.throttle = 82; S.bank = -0.18; S.pitch = 0.05;
      S.timeLeft = 132;
      S.score = 300; S.ringsHit = 3; S.combo = 3; S.bestCombo = 3;
      S.msg = 'RING +100  COMBO x3'; S.msgT = 2.2;
    } else if (name === 'canyon') {
      S.dist = 6100; S.px = -140; S.alt = 520; S.speed = 235; S.throttle = 88;
      S.bank = 0.3; S.pitch = -0.06; S.score = 550; S.ringsHit = 6; S.combo = 2;
      S.timeLeft = 96;
      S.msg = ''; S.msgT = 0;
    } else if (name === 'land') {
      S.dist = 11050; S.px = 12; S.alt = 240; S.speed = 150; S.throttle = 42;
      S.pitch = -0.22; S.score = 1150; S.ringsHit = 11; S.combo = 4; S.bestCombo = 4;
      S.timeLeft = 24;
      S.msg = 'FINAL APPROACH — LAND ON THE RUNWAY'; S.msgT = 4;
    } else {
      S.mode = 'title';
    }
    // advance the world a fixed amount so clouds, prop and light settle
    for (let i = 0; i < 40; i++) { S.prop += 1 / 60 * 40; }
    S.t = SHOT_T;
    draw(SHOT_T);
  }

  // ---- boot ----
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  window.__mrr = { state: S, rings, reset, groundH, ringPos };
  if (shot) {
    applyShot(shot);
  } else {
    draw(0);
    let last = performance.now();
    const loop = (now) => {
      const dt = Math.min(1 / 30, Math.max(0.001, (now - last) / 1000));
      last = now;
      update(dt);
      draw(S.t);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
})();
