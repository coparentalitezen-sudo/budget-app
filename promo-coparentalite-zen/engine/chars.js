// Cast for « Coparentalité Zen »: two parents and a child, front view, drawn with the Mid-century engine.
// Limited animation: bodies are held drawings; only arms, hands, eyes and mouth move.
// Rig units: feet at (0,0), top of head ≈ -566. Arm angles: 0 = screen right, π/2 = down.
import { PAL, shape, ink, ellipse, spline, xform, move, rrect, rect, TAU, reg, path, lerp } from './toon.js';

export const C = {
  paper: '#F6EEE1', paperD: '#E8DCC6', ink: '#262A33',
  navy: '#4E6381', navyD: '#3D4F68', navyL: '#AEBACB', navyT: '#D2D9E3',
  coral: '#E4A196', coralD: '#C47E73', coralL: '#EFC2B9', coralT: '#F5DCD5',
  sage: '#9AA791', sageD: '#74826B', sageL: '#C6CFBE', sageT: '#DFE4D8',
  gold: '#E2B65C', goldD: '#BE9038', goldL: '#F0D69C', goldT: '#F6E9C9',
  white: '#FCF9F6', pink: '#F0B4A8',
};

const UA = 100, FA = 92;
export function armJoints(pose, which) {
  const sh = [which === 'F' ? 46 : -46, -384];
  const rest = which === 'F' ? { a1: 1.36, a2: 1.5 } : { a1: 1.78, a2: 1.64 };
  const arm = pose[which === 'F' ? 'armF' : 'armB'] || rest;
  const el = [sh[0] + Math.cos(arm.a1) * UA, sh[1] + Math.sin(arm.a1) * UA];
  const ha = [el[0] + Math.cos(arm.a2) * FA, el[1] + Math.sin(arm.a2) * FA];
  return { sh, el, ha, a2: arm.a2 };
}
// blend two arm poses (never switch inside an if)
export const armMix = (a, b, k) => ({ a1: lerp(a.a1, b.a1, k), a2: lerp(a.a2, b.a2, k) });

// four-finger glove hand (three fingers + thumb)
export function drawHand(ctx, x, y, a, kind = 'open', side = 1, k = 1, skin = '#E8B48F') {
  const parts = [], seps = [];
  const E = (cx, cy, rx, ry, rot = 0) => parts.push(ellipse(cx, cy, rx, ry, 18, 0, TAU, rot));
  E(12, 0, 15, 13.5);
  if (kind === 'open') { [-0.62, 0, 0.62].forEach(r => E(12 + Math.cos(r) * 25, Math.sin(r) * 25, 12, 5, r)); E(4, -15 * side, 10, 5, -1.35 * side); }
  else if (kind === 'point') { E(38, -5 * side, 19, 4.8); E(25, 5 * side, 7, 6); E(20, 11 * side, 6, 5.5); E(8, -14 * side, 8.5, 5, -1.0 * side); }
  else { E(26, -8, 6.5, 6.5); E(28, 1, 6.5, 6.5); E(25, 10, 6, 6); E(12, -14 * side, 9, 5.5, -0.4 * side); seps.push([[22, -3.5], [30, -3.5]], [[22, 5.5], [29, 5.5]]); }
  const P = parts.map(p => xform(p, x, y, a, k));
  ctx.save(); ctx.strokeStyle = C.ink; ctx.lineWidth = 6 * k; ctx.lineJoin = 'round';
  for (const p of P) { path(ctx, p); ctx.stroke(); }
  const o = reg(77, 0.6); ctx.fillStyle = skin;
  for (const p of P) { path(ctx, move(p, o[0] * 0.5, o[1] * 0.5)); ctx.fill(); }
  ctx.lineWidth = 2.4 * k; ctx.lineCap = 'round';
  for (const s2 of seps) { const q = xform(s2, x, y, a, k); ctx.beginPath(); ctx.moveTo(...q[0]); ctx.lineTo(...q[1]); ctx.stroke(); }
  ctx.restore();
}

function sleeve(ctx, J, seed, col, colD) {
  const P = spline([J.sh, [(J.sh[0] + J.el[0]) / 2, (J.sh[1] + J.el[1]) / 2], J.el, [(J.el[0] + J.ha[0]) / 2, (J.el[1] + J.ha[1]) / 2], J.ha], false, 6);
  ink(ctx, P, 26, { seed, taper: false, wob: 0.08, color: C.ink });
  const o = reg(seed, 1);
  ink(ctx, move(P, o[0] * 0.6, o[1] * 0.6), 17, { seed: seed + 1, taper: false, wob: 0.05, color: col });
  const a = J.a2, cx = J.ha[0] - Math.cos(a) * 8, cy = J.ha[1] - Math.sin(a) * 8;
  ink(ctx, [[cx + Math.cos(a + 1.57) * 12, cy + Math.sin(a + 1.57) * 12], [cx - Math.cos(a + 1.57) * 12, cy - Math.sin(a + 1.57) * 12]], 3, { seed: seed + 2, taper: false, color: colD });
}

// the product: the app on a phone, always sage
export function drawPhone(ctx, cx, cy, w, h, o = {}) {
  const r = w * 0.16;
  shape(ctx, rrect(cx - w / 2, cy - h / 2, w, h, r), { fill: C.sage, line: Math.max(2.5, w * 0.03), seed: 130, grain: 0.25,
    shade: [{ pts: rect(cx + w * 0.22, cy - h / 2 - 4, w * 0.4, h + 8), color: C.sageD, alpha: 0.35 }] });
  const m = w * 0.09, sx = cx - w / 2 + m, sy = cy - h / 2 + m * 1.5, sw = w - 2 * m, sh = h - m * 3.2;
  shape(ctx, rrect(sx, sy, sw, sh, r * 0.4), { fill: C.white, line: Math.max(1.5, w * 0.015), seed: 131, grain: 0.05, off: [0, 0], breaks: 0.05 });
  if (o.screen) { ctx.save(); path(ctx, rrect(sx, sy, sw, sh, r * 0.4)); ctx.clip(); o.screen(ctx, sx, sy, sw, sh); ctx.restore(); }
  shape(ctx, ellipse(cx, cy + h / 2 - m * 0.85, m * 0.42, m * 0.42, 14), { fill: C.sageD, line: 0, off: [0, 0], grain: 0 });
}
// tiny screen used when a phone is held: a week strip in the two homes' colours
export function miniWeek(ctx, sx, sy, sw, sh) {
  ctx.fillStyle = C.sage; ctx.fillRect(sx, sy, sw, sh * 0.22);
  const n = 7, g = sw * 0.04, cw = (sw - g * (n + 1)) / n;
  for (let i = 0; i < n; i++) { ctx.fillStyle = i < 4 ? C.navy : C.coral; ctx.fillRect(sx + g + i * (cw + g), sy + sh * 0.34, cw, sh * 0.2); }
  for (let i = 0; i < 2; i++) { ctx.fillStyle = C.paperD; ctx.fillRect(sx + g, sy + sh * (0.64 + i * 0.14), sw - 2 * g, sh * 0.07); }
}

function drawArm(ctx, P, which, seed) {
  const J = armJoints(P, which);
  sleeve(ctx, J, seed, P.top, P.topD);
  const hk = P[which === 'F' ? 'handF' : 'handB'] || 'open';
  drawHand(ctx, J.ha[0], J.ha[1], J.a2, hk, which === 'F' ? -1 : 1, 1, P.skin);
  if (P.phone && P.phone === which) {
    const [hx, hy] = J.ha;
    ctx.save(); ctx.translate(hx - (which === 'F' ? 6 : -6), hy - 22); ctx.rotate(which === 'F' ? -0.12 : 0.12);
    drawPhone(ctx, 0, 0, 60, 104, { screen: P.screen === 'question' ? qScreen : miniWeek });
    ctx.restore();
    drawHand(ctx, J.ha[0], J.ha[1], J.a2, 'grip', which === 'F' ? -1 : 1, 1, P.skin);
  }
  return J;
}
function qScreen(ctx, sx, sy, sw, sh) {
  ctx.fillStyle = C.paperD; for (let i = 0; i < 3; i++) ctx.fillRect(sx + sw * 0.12, sy + sh * (0.2 + i * 0.22), sw * (0.76 - (i % 2) * 0.25), sh * 0.11);
}

// P: { x, y, s, top, topD, bottom, bottomD, skin, skinD, hair, hairStyle, face, look, blink, armF, armB, handF, handB, phone, child, headK }
export function drawPerson(ctx, P) {
  ctx.save(); ctx.translate(P.x, P.y); ctx.scale(P.s ?? 1, P.s ?? 1);
  ctx.save(); ctx.globalAlpha = 0.16; ctx.fillStyle = C.ink; ctx.beginPath(); ctx.ellipse(6, 2, 90, 11, 0, 0, TAU); ctx.fill(); ctx.restore();
  if (P.phone !== 'B') drawArm(ctx, P, 'B', 70 + (P.seed || 0));
  const legs = P.child
    ? [[[-42, -286], [-2, -286], [-6, -150], [-36, -150]], [[2, -286], [42, -286], [36, -150], [6, -150]]]
    : [[[-44, -286], [-2, -286], [-8, -26], [-34, -26]], [[2, -286], [44, -286], [34, -26], [8, -26]]];
  legs.forEach((L, i) => {
    const ax = (L[2][0] + L[3][0]) / 2;
    if (P.child) shape(ctx, rect(ax - 9, -152, 18, 126), { fill: P.skin, line: 3, seed: 40 + i, grain: 0, breaks: 0.2 });
    else shape(ctx, rect(ax - 7, -30, 14, 18), { fill: P.skin, line: 0, seed: 40 + i, grain: 0 });
    shape(ctx, L, { fill: P.bottom, line: 3.8, seed: 42 + i, grain: 0.3, breaks: 0.15, shade: i === 1 ? [{ pts: [[22, -290], [60, -290], [60, 0], [22, 0]], color: P.bottomD, alpha: 0.6 }] : null });
    shape(ctx, ellipse(ax, -8, 19, 9, 16), { fill: C.ink, line: 0, off: [0, 0], grain: 0 });
  });
  const torso = spline([[-52, -380], [-40, -398], [40, -398], [52, -380], [44, -310], [46, -282], [-44, -282], [-46, -310]], true, 6);
  shape(ctx, torso, { fill: P.top, line: 4.2, seed: 50 + (P.seed || 0), grain: 0.35, breaks: 0.2, shade: [{ pts: [[22, -400], [70, -400], [70, -270], [26, -270]], color: P.topD, alpha: 0.45 }] });
  if (P.collar) shape(ctx, spline([[-24, -398], [0, -372], [24, -398], [0, -390]], true, 4), { fill: C.white, line: 3, seed: 51, grain: 0, breaks: 0.2 });
  shape(ctx, rrect(-15, -420, 30, 30, 8), { fill: P.skin, line: 3, seed: 52, grain: 0, breaks: 0.3 });   // neck
  const hk = P.headK || 1;
  ctx.save(); ctx.translate(0, -414); ctx.scale(hk, hk); ctx.translate(0, 414);
  drawHead(ctx, P);
  ctx.restore();
  if (P.phone === 'B') drawArm(ctx, P, 'B', 70 + (P.seed || 0));
  drawArm(ctx, P, 'F', 60 + (P.seed || 0));
  ctx.restore();
}

function drawHead(ctx, P) {
  const look = P.look || [0, 0], face = P.face || 'neutral', blink = P.blink ?? 0, hs = P.hairStyle;
  // hair volume behind the face
  if (hs === 'bun') {
    shape(ctx, ellipse(0, -580, 30, 26, 24), { fill: P.hair, line: 3.4, seed: 59, grain: 0.3, breaks: 0.3 });
    shape(ctx, spline([[-66, -520], [0, -566], [66, -520], [72, -452], [56, -430], [-56, -430], [-72, -452]], true, 6), { fill: P.hair, line: 0, seed: 60, grain: 0.3 });
  } else if (hs === 'puffs') {
    [-58, 58].forEach((x, i) => shape(ctx, ellipse(x, -540, 26, 24, 20), { fill: P.hair, line: 3.2, seed: 58 + i, grain: 0.3, breaks: 0.3 }));
  }
  shape(ctx, ellipse(0, -478, 54, 64, 36), { fill: P.skin, line: 4, seed: 61, grain: 0.15, breaks: 0.25 });
  if (hs === 'short') shape(ctx, spline([[-58, -484], [-56, -536], [-10, -566], [44, -556], [60, -510], [56, -486], [40, -518], [-6, -524], [-40, -514]], true, 6), { fill: P.hair, line: 0, seed: 62, grain: 0.3 });
  else if (hs === 'bun') shape(ctx, spline([[-58, -496], [-44, -548], [16, -562], [60, -508], [30, -522], [-6, -516], [-34, -520]], true, 6), { fill: P.hair, line: 0, seed: 62, grain: 0.3 });
  else shape(ctx, spline([[-54, -500], [-36, -546], [10, -556], [54, -506], [26, -526], [0, -516], [-26, -528]], true, 6), { fill: P.hair, line: 0, seed: 62, grain: 0.3 });
  [-21, 21].forEach((x, i) => eye(ctx, x + look[0], -484 + look[1], face, blink, i));
  ink(ctx, spline([[2, -482], [-7, -458], [5, -455]], false, 4), 3.4, { seed: 64, color: C.ink });
  mouth(ctx, look[0] * 0.3, -436, face);
  [[-34, -458], [34, -458]].forEach(([x, y], i) => shape(ctx, ellipse(x, y, 11, 7.5, 14), { fill: C.pink, line: 0, grain: 0, seed: 101 + i, alpha: 0.8 }));
  if (P.beard) ink(ctx, spline([[-30, -428], [0, -418], [30, -428]], false, 5), 5, { seed: 66, color: P.hair, taper: true });
}
function eye(ctx, x, y, face, blink, i) {
  if (face === 'happy' || blink > 0.5) {
    const up = face === 'happy';
    ink(ctx, up ? [[x - 8, y + 3], [x, y - 5], [x + 8, y + 3]] : [[x - 8, y], [x + 8, y]], 4, { seed: 80 + i, taper: false, color: C.ink });
  } else {
    const r = face === 'wow' ? 8.5 : 6.8;
    shape(ctx, ellipse(x, y, r * 0.8, r * 1.3, 14), { fill: C.ink, line: 0, grain: 0, off: [0, 0] });
    shape(ctx, ellipse(x + 1.5, y - 3.5, 2.2, 2.6, 8), { fill: C.white, line: 0, grain: 0, off: [0, 0] });
  }
  // worried brows tilt up toward the middle; happy ones arch
  const by = face === 'wow' ? y - 25 : y - 19, tw = face === 'worried' ? (i ? 4 : -4) : 0;
  ink(ctx, [[x - 9, by - tw], [x + 9, by + tw - 2]], 3.4, { seed: 90 + i, taper: true, color: C.ink });
}
function mouth(ctx, x, y, face) {
  if (face === 'happy') shape(ctx, spline([[x - 16, y - 6], [x + 14, y - 6], [x + 5, y + 11], [x - 8, y + 10]], true, 6), { fill: C.coralD, line: 3.2, seed: 95, grain: 0, breaks: 0 });
  else if (face === 'wow') shape(ctx, ellipse(x - 2, y + 2, 7, 10, 16), { fill: C.coralD, line: 3.2, seed: 96, grain: 0, breaks: 0 });
  else if (face === 'worried') ink(ctx, spline([[x - 11, y + 3], [x, y - 2], [x + 10, y + 3]], false, 5), 3.4, { seed: 99, color: C.ink });
  else ink(ctx, spline([[x - 12, y - 2], [x - 1, y + 4], [x + 9, y - 3]], false, 5), 3.4, { seed: 100, color: C.ink });
}

// the cast
export const KARIM = { top: C.navy, topD: C.navyD, bottom: '#5A5148', bottomD: '#463E36', skin: '#B97B55', hair: '#2B2120', hairStyle: 'short', beard: true, collar: true, seed: 0 };
export const JULIE = { top: C.coral, topD: C.coralD, bottom: '#6B7B8E', bottomD: '#56657A', skin: '#F0C7A4', hair: '#7A4A30', hairStyle: 'bun', seed: 5 };
export const KID = { top: C.sage, topD: C.sageD, bottom: C.navyD, bottomD: '#2F3E54', skin: '#D9A07A', hair: '#3B2A22', hairStyle: 'puffs', child: true, headK: 1.32, seed: 9 };
