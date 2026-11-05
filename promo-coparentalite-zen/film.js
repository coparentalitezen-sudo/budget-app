// « Coparentalité Zen » — promo, Mid-century Cartoon, 1080×1920.
// One split frame (two homes) that closes; three numbered features; a circle match-cut into the brand's logo.
import { setClock, shape, plane, ink, rays, ellipse, rect, rrect, spline, move, xform, star, sparkle, text, fit, measure, arrow, dashed,
  paperFinish, clamp, lerp, seg, ss, eo, eio, back, twos, TAU, hash } from './engine/toon.js';
import { C, drawPerson, drawPhone, miniWeek, drawHand, armMix, KARIM, JULIE, KID } from './engine/chars.js';

export const W = 1080, H = 1920, BPM = 120, BEAT = 60 / BPM;
const CAP_BOTTOM = 1560;             // caption card sits above the platforms' bottom UI
let LINES = {}, DURS = {}, LOGO = null, EVS = [];

// ------------------------------------------------------------------ timeline (bars of 2 s)
export const S = [
  { kind: 'hook', t0: 0, t1: 5 },
  { kind: 'title', t0: 5, t1: 10 },
  { kind: 'step', i: 0, t0: 10, t1: 16 },
  { kind: 'step', i: 1, t0: 16, t1: 22 },
  { kind: 'step', i: 2, t0: 22, t1: 28 },
  { kind: 'end', t0: 28, t1: 36 },
];
export const DUR = 36;
const V = [{ id: 'l1', t: 0.5 }, { id: 'l2', t: 5.4 }, { id: 'l3', t: 10.6 }, { id: 'l4', t: 16.7 }, { id: 'l5', t: 22.95 }, { id: 'l6', t: 30.3 }];
const STEPS = [
  { title: 'Le planning de garde', ground: C.goldT, floor: C.goldL },
  { title: 'Les dépenses partagées', ground: C.navyT, floor: C.navyL },
  { title: 'Vacances et changements', ground: C.coralT, floor: C.coralL },
];

export function setup(lines, durs, logo) {
  LINES = Object.fromEntries(lines.map(l => [l.id, l.text])); DURS = durs || {}; LOGO = logo;
  buildEvents();
}
export function section(t) { return S.find(s => t >= s.t0 && t < s.t1) || S[S.length - 1]; }
export function subs() {
  const out = [];
  V.forEach((v, i) => {
    const txt = LINES[v.id] || '', d = DURS[v.id] ?? 3;
    const need = Math.max(1.8, d + 0.6, txt.length / 12 + 1), next = V[i + 1] ? V[i + 1].t - 0.05 : DUR - 0.3;
    out.push({ t0: v.t, t1: Math.min(next, v.t + need), text: txt });
  });
  return out;
}
export function events() { return EVS; }
export function voices() { return V.map(v => ({ ...v, dur: DURS[v.id] })); }

// ------------------------------------------------------------------ helpers
const pop = (t, t0, d = 0.26) => back(seg(t, t0, t0 + d), 1.9);
function bg(ctx, col) { ctx.fillStyle = col; ctx.fillRect(-3000, -3000, W + 6000, H + 6000); }
function cam(ctx, cx, cy, z = 1, r = 0) { ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.rotate(r); ctx.translate(-cx, -cy); }
function heartPts(cx, cy, s) { const P = []; for (let i = 0; i < 40; i++) { const a = i / 40 * TAU; P.push([cx + 16 * Math.sin(a) ** 3 * s, cy - (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) * s]); } return P; }
function house(ctx, cx, by, w, h, col, colD, seed) {
  const rh = w * 0.42;
  shape(ctx, rect(cx - w / 2, by - h, w, h), { fill: col, line: 3.6, seed, grain: 0.3, breaks: 0.22, shade: [{ pts: rect(cx + w * 0.18, by - h - 4, w * 0.4, h + 8), color: colD, alpha: 0.35 }] });
  shape(ctx, [[cx - w / 2 - 26, by - h + 4], [cx, by - h - rh], [cx + w / 2 + 26, by - h + 4]], { fill: colD, line: 3.6, seed: seed + 1, grain: 0.3, breaks: 0.2 });
  shape(ctx, rect(cx - w * 0.12, by - h * 0.46, w * 0.24, h * 0.46), { fill: C.paper, line: 3, seed: seed + 2, grain: 0.1 });
  shape(ctx, rect(cx - w * 0.38, by - h * 0.8, w * 0.18, w * 0.16), { fill: C.goldL, line: 3, seed: seed + 3, grain: 0.1 });
  shape(ctx, rect(cx + w * 0.2, by - h * 0.8, w * 0.18, w * 0.16), { fill: C.goldL, line: 3, seed: seed + 4, grain: 0.1 });
}
// icons, designed in a 200-unit box
function icCalendar(ctx, s) {
  shape(ctx, rrect(-70, -60, 140, 130, 16), { fill: C.white, line: 6, seed: 301 });
  shape(ctx, rrect(-70, -60, 140, 38, 12), { fill: C.coral, line: 0, seed: 302, off: [0, 0], grain: 0.1 });
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) shape(ctx, rect(-50 + c * 27, -6 + r * 24, 17, 14), { fill: (r + c) % 3 ? C.navy : C.coral, line: 0, grain: 0, seed: 303 + r * 4 + c });
  [-36, 36].forEach((x, i) => ink(ctx, [[x, -78], [x, -50]], 7, { seed: 320 + i, taper: false, color: C.ink }));
}
function icEuro(ctx) {
  shape(ctx, ellipse(0, 0, 66, 66, 40), { fill: C.gold, line: 6, seed: 330, shade: [{ pts: ellipse(14, 14, 66, 66, 40), color: C.goldD, alpha: 0.4 }] });
  text(ctx, '€', 0, 32, { font: '92px Slab', fill: C.ink, align: 'center' });
}
function icSun(ctx, t) {
  for (let i = 0; i < 10; i++) { const a = i / 10 * TAU + t * 0.6; ink(ctx, [[Math.cos(a) * 58, Math.sin(a) * 58], [Math.cos(a) * 84, Math.sin(a) * 84]], 7, { seed: 340 + i, color: C.ink, taper: false }); }
  shape(ctx, ellipse(0, 0, 46, 46, 32), { fill: C.gold, line: 5, seed: 351 });
}
function icHouse(ctx, col, colD) {
  shape(ctx, rect(-56, -20, 112, 86), { fill: col, line: 5, seed: 360 });
  shape(ctx, [[-78, -16], [0, -84], [78, -16]], { fill: colD, line: 5, seed: 361 });
  shape(ctx, rect(-15, 22, 30, 44), { fill: C.paper, line: 4, seed: 362 });
}
function icon(ctx, name, cx, cy, size, t = 0) {
  ctx.save(); ctx.translate(cx, cy); ctx.scale(size / 200, size / 200);
  if (name === 'cal') icCalendar(ctx); else if (name === 'euro') icEuro(ctx); else if (name === 'sun') icSun(ctx, t);
  else if (name === 'houseC') icHouse(ctx, C.coral, C.coralD); else if (name === 'heart') shape(ctx, heartPts(0, 0, 5.2), { fill: C.coral, line: 6, seed: 370 });
  ctx.restore();
}
// thought bubble with an icon and a question mark
function bubble(ctx, t, t0, cx, cy, r, tail, name) {
  const k = pop(t, t0, 0.3); if (k <= 0) return;
  const wob = Math.sin(twos(t) * 5 + cx) * 0.03;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(wob); ctx.scale(k, k); ctx.translate(-cx, -cy);
  [[0.22, 0.5], [0.12, 0.78]].forEach(([rr, u], i) => shape(ctx, ellipse(lerp(cx, tail[0], u), lerp(cy, tail[1], u), r * rr, r * rr, 18), { fill: C.white, line: 3.4, seed: 380 + i }));
  shape(ctx, ellipse(cx, cy, r, r * 0.92, 48), { fill: C.white, line: 4.2, seed: 383, grain: 0.15 });
  icon(ctx, name, cx, cy + 4, r * 1.1, t);
  shape(ctx, ellipse(cx + r * 0.78, cy - r * 0.62, 30, 30, 24), { fill: C.gold, line: 3.4, seed: 384 });
  text(ctx, '?', cx + r * 0.78, cy - r * 0.62 + 15, { font: '44px Slab', fill: C.ink, align: 'center' });
  ctx.restore();
}
function medallion(ctx, t, t0, x, y, r, inner) {
  const k = pop(t, t0, 0.24); if (k <= 0) return;
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k); ctx.rotate((1 - k) * 0.4);
  star(ctx, 0, 0, r * 1.22, { n: 16, inner: 0.84, fill: C.white, off: [0, 0] });
  shape(ctx, ellipse(0, 0, r, r, 64), { fill: C.gold, line: 5, seed: 730, grain: 0.3 });
  inner(ctx, r);
  ctx.restore();
}
const heartInner = (ctx, r) => shape(ctx, heartPts(0, 4, r * 0.034), { fill: C.coral, line: 4.5, seed: 735, grain: 0.2 });
const numInner = n => (ctx, r) => text(ctx, String(n), 0, r * 0.38, { font: `${Math.round(r * 1.1)}px Slab`, fill: C.ink, plate: C.white, off: [5, 5], align: 'center' });
function stepHeader(ctx, t, s) {
  const k = eo(seg(twos(t), s.t0 + 0.05, s.t0 + 0.45)); if (k <= 0) return;
  ctx.save(); ctx.translate(-(1 - k) * 700, 0);
  shape(ctx, ellipse(116, 196, 56, 56, 40), { fill: C.ink, line: 0, seed: 700, grain: 0.1, off: [0, 0] });
  text(ctx, String(s.i + 1), 116, 220, { font: '66px Slab', fill: C.paper, align: 'center' });
  text(ctx, `ÉTAPE ${s.i + 1} SUR 3`, 196, 172, { font: '600 26px Jost', fill: C.ink, track: 6 });
  const f = fit(ctx, STEPS[s.i].title, '{px}px Slab', 62, 840, 1, 40);
  text(ctx, f.lines[0], 194, 242, { font: f.font, fill: C.ink, plate: C.white, off: [4, 4] });
  ctx.restore();
}
function tag(ctx, t, t0, str, x, y, o = {}) {
  const k = pop(t, t0); if (k <= 0) return;
  const f = fit(ctx, str, '500 {px}px Jost', o.px || 40, o.maxW || 560, 2, 26);
  const w = Math.max(...f.lines.map(l => measure(ctx, l, f.font))) + 100, h = 34 + f.lines.length * f.px * 1.2;
  const X = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x;
  ctx.save(); ctx.translate(X + w / 2, y + h / 2); ctx.scale(k, k); ctx.translate(-(X + w / 2), -(y + h / 2));
  shape(ctx, rrect(X, y, w, h, 16), { fill: C.white, line: 3.6, seed: 710, grain: 0.15, off: [6, 5] });
  star(ctx, X + 40, y + h / 2, 18, { n: 8, inner: 0.42, fill: C.gold, off: [0, 0], rot: t * 0.6 });
  f.lines.forEach((l, i) => text(ctx, l, X + 70, y + 17 + f.px * 0.92 + i * f.px * 1.2, { font: f.font, fill: C.ink }));
  ctx.restore();
}
function callout(ctx, t, t0, cx, cy, r, inner, bgc, leader) {
  const k = back(seg(t, t0, t0 + 0.32), 1.5); if (k <= 0) return;
  const R = r * k;
  if (leader) { const a = Math.atan2(leader[1] - cy, leader[0] - cx); dashed(ctx, [[cx + Math.cos(a) * (R + 14), cy + Math.sin(a) * (R + 14)], leader], 4, 14, 10, -t * 40, C.ink, clamp(k)); shape(ctx, ellipse(leader[0], leader[1], 9, 9, 12), { fill: C.ink, line: 0, off: [0, 0], grain: 0 }); }
  shape(ctx, ellipse(cx, cy, R + 16, R + 16, 72), { fill: C.white, line: 4.5, seed: 720, grain: 0.15, breaks: 0.05 });
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.clip();
  ctx.fillStyle = bgc; ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
  ctx.translate(cx, cy); ctx.scale(k, k); inner(ctx); ctx.restore();
  ink(ctx, ellipse(cx, cy, R, R, 72), 4, { closed: true, seed: 721, breaks: 0.1, color: C.ink });
}
// a forearm entering from off-screen: sleeve ribbon to a glove hand
function reach(ctx, from, hand, a, kind, sleeveCol, k = 2) {
  const P = [from, [lerp(from[0], hand[0], 0.5), lerp(from[1], hand[1], 0.5) + 10], [hand[0] - Math.cos(a) * 10 * k, hand[1] - Math.sin(a) * 10 * k]];
  const Q = spline(P, false, 8);
  ink(ctx, Q, 26 * k * 0.9, { seed: 740, taper: false, wob: 0.06, color: C.ink });
  ink(ctx, move(Q, 3, 2), 17 * k * 0.9, { seed: 741, taper: false, wob: 0.05, color: sleeveCol });
  drawHand(ctx, hand[0], hand[1], a, kind, 1, k, '#F0C7A4');
}

// ------------------------------------------------------------------ 1 + 6: the two homes
const FLOOR = 1330;
const P_REST_F = { a1: 1.36, a2: 1.5 }, P_REST_B = { a1: 1.78, a2: 1.64 };
const PHONE_F = { a1: 1.85, a2: -2.35 }, PHONE_B = { a1: 1.29, a2: -0.79 };
const UP_F = { a1: -0.95, a2: -1.25 }, UP_B = { a1: -2.19, a2: -1.89 };
function homes(ctx, t, endMode) {
  // endMode: 0 = hook; >0 = time since the end section started
  const u = endMode ? endMode : 0;
  const open = endMode ? eio(seg(u, 0.6, 1.4)) : 0;           // the two halves slide away
  const close = endMode ? eio(seg(u, 0, 0.8)) : 0;            // the parents step toward the child
  bg(ctx, C.paper);
  if (endMode) rays(ctx, 540, 1000, 30, 1500, C.sageL, { alpha: 0.5 * open, rot: 0.2 });
  const z = endMode ? 1.0 : lerp(1, 1.04, ss(t / 5));
  ctx.save(); cam(ctx, 540, 1000, z);
  // halves
  [[0, C.navyT, C.navyL, C.navy, C.navyD, -1], [1, C.coralT, C.coralL, C.coral, C.coralD, 1]].forEach(([i, g, f, hc, hd, sgn]) => {
    ctx.save(); ctx.translate(sgn * open * 620, 0);
    const x0 = i ? 540 : -400, x1 = i ? 1480 : 540;
    plane(ctx, rect(x0, -400, x1 - x0, FLOOR + 400), g);
    plane(ctx, rect(x0, FLOOR, x1 - x0, 1200), f);
    ink(ctx, [[x0 + (i ? 30 : 40), FLOOR], [x1 - (i ? 40 : 30), FLOOR]], 4, { seed: 200 + i, breaks: 0.3, color: C.ink });
    house(ctx, i ? 900 : 180, FLOOR - 4, 230, 210, i ? C.coralL : C.navyL, hd, 210 + i * 10);
    ctx.restore();
  });
  if (!endMode) ink(ctx, [[540, -100], [540, FLOOR + 600]], 5, { seed: 230, breaks: 0.25, color: C.ink });
  if (endMode) plane(ctx, rect(-400, FLOOR, 1900, 1200), C.sageT, { alpha: open });
  // cast
  const tw = twos(t), happy = !!endMode;
  const blinkK = (b) => [1.7, 3.9].some(x => tw > x + b && tw < x + b + 0.13) ? 1 : 0;
  const bob = endMode ? -Math.abs(Math.sin(clamp(u / 0.8) * Math.PI * 2)) * 10 * (1 - close * 0) : 0;
  drawPerson(ctx, { ...KARIM, x: lerp(290, 345, close), y: FLOOR + bob, s: 1.2, face: happy ? 'happy' : 'worried', look: happy ? [4, 0] : [6, 8], blink: blinkK(0),
    armF: PHONE_F, armB: P_REST_B, handF: 'grip', phone: 'F', screen: happy ? 'week' : 'question' });
  drawPerson(ctx, { ...JULIE, x: lerp(790, 735, close), y: FLOOR + bob, s: 1.2, face: happy ? 'happy' : 'worried', look: happy ? [-4, 0] : [-6, 8], blink: blinkK(0.4),
    armB: PHONE_B, armF: P_REST_F, handB: 'grip', phone: 'B', screen: happy ? 'week' : 'question' });
  // the child: looks from one home to the other, on twos; at the end, both arms up (the logo's pose)
  const look = endMode ? [0, -4] : tw < 1 ? [0, 0] : tw < 2 ? [-9, 2] : tw < 3 ? [9, 2] : [0, -3];
  const up = endMode ? (twos(u) >= 1.0 ? 1 : twos(u) >= 0.92 ? 0.5 : 0) : 0;   // one in-between, on twos
  const jump = endMode ? -back(seg(u, 1.0, 1.25), 2) * 26 * (1 - seg(u, 1.25, 1.6)) : 0;
  drawPerson(ctx, { ...KID, x: 540, y: FLOOR + jump, s: 0.82, face: endMode ? (up ? 'happy' : 'neutral') : (tw > 3 ? 'wow' : 'neutral'), look, blink: blinkK(0.9),
    armF: armMix(P_REST_F, UP_F, up), armB: armMix(P_REST_B, UP_B, up), handF: 'open', handB: 'open' });
  if (!endMode) {
    // phones buzz
    [[1.0, 290, 930], [2.0, 790, 930]].forEach(([tb, x, y], i) => { const k = seg(t, tb, tb + 0.35); if (k > 0 && k < 1) for (let j = 0; j < 3; j++) { const a = -2.4 + j * 0.5 + (i ? Math.PI * 0.55 : 0); ink(ctx, [[x + Math.cos(a) * 70, y + Math.sin(a) * 70], [x + Math.cos(a) * 92, y + Math.sin(a) * 92]], 4, { seed: 250 + j, color: C.ink, taper: false }); } });
    bubble(ctx, t, 0.5, 250, 470, 110, [300, 680], 'cal');
    bubble(ctx, t, 1.5, 830, 470, 110, [780, 680], 'euro');
    bubble(ctx, t, 2.5, 540, 700, 92, [540, 850], 'sun');
  } else {
    const kh = pop(t, 28 + 1.05, 0.3);
    if (kh > 0) {
      ctx.save(); ctx.translate(540, 760); ctx.scale(kh, kh); shape(ctx, heartPts(0, 0, 4.6), { fill: C.coral, line: 5, seed: 260 }); ctx.restore();
      [[430, 820, 26], [660, 790, 32], [470, 690, 20], [620, 680, 22]].forEach(([x, y, r], i) => sparkle(ctx, x, y, r * kh * (0.8 + 0.2 * Math.sin(twos(t) * 6 + i)), { fill: i % 2 ? C.gold : C.white }));
    }
  }
  ctx.restore();
  return { focus: [540, 640], child: [540, FLOOR - 0.82 * 330] };
}

// ------------------------------------------------------------------ 2: title, the product on its stage
function appScreen(ctx, sx, sy, sw, sh) {
  const p = sw / 360;   // design units: a 360-wide screen
  ctx.fillStyle = C.sage; ctx.fillRect(sx, sy, sw, 92 * p);
  text(ctx, 'Cette semaine', sx + 24 * p, sy + 60 * p, { font: `600 ${Math.round(30 * p)}px Jost`, fill: C.white });
  const days = ['L', 'M', 'M', 'J', 'V', 'S', 'D'], g = 8 * p, cw = (sw - 24 * p * 2 - g * 6) / 7;
  days.forEach((d, i) => {
    const x = sx + 24 * p + i * (cw + g), y = sy + 128 * p;
    shape(ctx, rrect(x, y, cw, 92 * p, 8 * p), { fill: i < 4 ? C.navy : C.coral, line: 2.4, seed: 600 + i, grain: 0.2, off: [3, 2] });
    text(ctx, d, x + cw / 2, y + 60 * p, { font: `600 ${Math.round(28 * p)}px Jost`, fill: C.white, align: 'center' });
  });
  const card = (y, dot, a, b) => {
    shape(ctx, rrect(sx + 24 * p, y, sw - 48 * p, 92 * p, 12 * p), { fill: C.paper, line: 2.4, seed: 610 + y % 7, grain: 0.1, off: [3, 2] });
    shape(ctx, ellipse(sx + 58 * p, y + 46 * p, 13 * p, 13 * p, 16), { fill: dot, line: 2, seed: 620, grain: 0 });
    text(ctx, a, sx + 86 * p, y + 40 * p, { font: `600 ${Math.round(24 * p)}px Jost`, fill: C.ink });
    text(ctx, b, sx + 86 * p, y + 72 * p, { font: `500 ${Math.round(22 * p)}px Jost`, fill: '#5A5F6B' });
  };
  card(sy + 252 * p, C.coral, 'Ce soir', 'chez Julie');
  card(sy + 364 * p, C.sage, 'Dépenses', 'solde à jour');
  card(sy + 476 * p, C.gold, 'Vacances', 'du 19 déc. au 4 janv.');
}
function sceneTitle(ctx, t, s) {
  bg(ctx, C.paper);
  rays(ctx, 540, 1010, 30, 1500, C.sageL, { alpha: 0.55, rot: t * 0.04 });
  const z = lerp(1, 1.035, ss(seg(t, s.t0, s.t1)));
  ctx.save(); cam(ctx, 540, 960, z);
  // kicker writes on left → right
  const wk = clamp(seg(t, 5.55, 6.35));
  if (wk > 0) { ctx.save(); ctx.beginPath(); ctx.rect(0, 150, 60 + wk * 980, 220); ctx.clip();
    text(ctx, 'Coparentalité Zen', 540, 300, { font: '700 104px Oleo', fill: C.ink, plate: C.sage, off: [6, 5], align: 'center', maxW: 980 }); ctx.restore(); }
  const ks = eo(seg(twos(t), 6.3, 6.7));
  if (ks > 0) { ctx.save(); ctx.translate(-(1 - ks) * 1100, 0);
    text(ctx, 'Tout au même endroit', 540, 418, { font: '74px Slab', fill: C.ink, plate: C.goldL, off: [5, 5], align: 'center', maxW: 980 }); ctx.restore(); }
  const ka = seg(t, 6.8, 7.1);
  if (ka > 0) text(ctx, 'PLANNING · DÉPENSES · VACANCES', 540, 492, { font: '600 28px Jost', fill: C.ink, align: 'center', track: 5, alpha: ka });
  const kp = pop(t, 5.6, 0.34);
  if (kp > 0) { ctx.save(); ctx.translate(540, 1010); ctx.scale(kp, kp); ctx.rotate(-0.035);
    shape(ctx, rrect(-215 + 14, -380 + 18, 430, 760, 70), { fill: C.paperD, line: 0, off: [0, 0], grain: 0.1, alpha: 0.6 });
    drawPhone(ctx, 0, 0, 430, 760, { screen: appScreen }); ctx.restore(); }
  medallion(ctx, t, 9.5, 540, 1010, 112, numInner(1));
  ctx.restore();
  return { focus: [540, 1010] };
}

// ------------------------------------------------------------------ 3: step 1, the custody calendar
const CAL = { x: 60, y: 330, w: 960, h: 770, gx: 100, gy: 512, cw: 115.4, chh: 112, gap: 12 };
const cellXY = (r, c) => [CAL.gx + c * (CAL.cw + CAL.gap), CAL.gy + r * (CAL.chh + CAL.gap)];
function sceneStep1(ctx, t, s) {
  const st = STEPS[0];
  bg(ctx, st.ground);
  const z = lerp(1, 1.05, ss(seg(t, s.t0, s.t1)));
  ctx.save(); cam(ctx, 540, 900, z);
  shape(ctx, rrect(CAL.x, CAL.y, CAL.w, CAL.h, 28), { fill: C.white, line: 4.4, seed: 800, grain: 0.15 });
  text(ctx, 'Ce mois-ci', CAL.x + 44, CAL.y + 74, { font: '46px Slab', fill: C.ink, plate: C.goldL, off: [4, 3] });
  ['L', 'M', 'M', 'J', 'V', 'S', 'D'].forEach((d, c) => text(ctx, d, cellXY(0, c)[0] + CAL.cw / 2, CAL.gy - 22, { font: '600 30px Jost', fill: C.ink, align: 'center' }));
  for (let r = 0; r < 4; r++) for (let c = 0; c < 7; c++) {
    const [x, y] = cellXY(r, c), tf = 10.75 + r * 0.5 + c * 0.05, k = back(seg(t, tf, tf + 0.2), 1.6);
    shape(ctx, rrect(x, y, CAL.cw, CAL.chh, 12), { fill: C.paper, line: 2.6, seed: 810 + r * 7 + c, grain: 0.1, breaks: 0.15, off: [0, 0] });
    if (k > 0) { ctx.save(); ctx.translate(x + CAL.cw / 2, y + CAL.chh / 2); ctx.scale(k, k);
      shape(ctx, rrect(-CAL.cw / 2, -CAL.chh / 2, CAL.cw, CAL.chh, 12), { fill: r % 2 ? C.coral : C.navy, line: 2.6, seed: 840 + r * 7 + c, grain: 0.3, breaks: 0.15 }); ctx.restore(); }
    text(ctx, String(r * 7 + c + 1), x + 14, y + 36, { font: '600 26px Jost', fill: k > 0.5 ? C.white : C.ink });
  }
  // legend
  [[C.navy, 'Chez Karim', CAL.x + 60], [C.coral, 'Chez Julie', CAL.x + 520]].forEach(([col, lab, x], i) => {
    const k = pop(t, 12.6 + i * 0.12); if (k <= 0) return;
    shape(ctx, ellipse(x + 18, CAL.y + CAL.h - 56, 18 * k, 18 * k, 18), { fill: col, line: 3, seed: 870 + i });
    text(ctx, lab, x + 50, CAL.y + CAL.h - 44, { font: '600 34px Jost', fill: C.ink, alpha: k });
  });
  // tonight: row 1, Thursday — Julie's week
  const [tx, ty] = cellXY(1, 3), cx = tx + CAL.cw / 2, cy = ty + CAL.chh / 2;
  const ring = seg(t, 13.0, 13.45);
  if (ring > 0 && ring < 1) ink(ctx, ellipse(cx, cy, 60 + ring * 60, 60 + ring * 60, 40), 5 * (1 - ring), { closed: true, seed: 880, color: C.ink });
  if (t > 13.0) ink(ctx, rrect(tx - 8, ty - 8, CAL.cw + 16, CAL.chh + 16, 16), 6, { closed: true, seed: 881, color: C.gold, breaks: 0.05 });
  // the finger: anticipation (pull back) → tap → recoil → away
  const ant = ss(seg(t, 12.55, 12.85)), act = eo(seg(t, 12.85, 13.0)), rec = Math.sin(clamp(seg(t, 13.0, 13.2)) * Math.PI), away = ss(seg(t, 13.55, 14.0));
  const enter = eo(seg(t, 12.0, 12.55));
  if (enter > 0 && away < 1) {
    const tip = [cx + 30, cy + 40];
    const hx = lerp(1300, tip[0] + 90, enter) + ant * 50 - act * 50 + rec * 8 + away * 700, hy = lerp(1700, tip[1] + 60, enter) + ant * 40 - act * 40 + rec * 6 + away * 600;
    reach(ctx, [1250, 1800], [hx, hy], Math.atan2(-60, -90), 'point', C.coral, 2.2);
  }
  callout(ctx, t, 13.4, 300, 1255, 150, c2 => { icon(c2, 'houseC', 0, 6, 190); icon(c2, 'heart', 0, -112, 46); }, C.coralT, [cx - 20, cy + 40]);
  tag(ctx, t, 13.9, 'Ce soir : chez Julie', 480, 1196, { px: 40, maxW: 500 });
  stepHeader(ctx, t, s);
  ctx.restore();
  return { focus: [540, 900] };
}

// ------------------------------------------------------------------ 4: step 2, shared expenses
function expScreen(t) {
  return (ctx, sx, sy, sw, sh) => {
    const p = sw / 360;
    ctx.fillStyle = C.sage; ctx.fillRect(sx, sy, sw, 92 * p);
    text(ctx, 'Dépenses', sx + 24 * p, sy + 62 * p, { font: `${Math.round(34 * p)}px Slab`, fill: C.white });
    const k = pop(t, 17.5, 0.3);
    if (k > 0) { ctx.save(); ctx.translate(sx + sw / 2, sy + 190 * p); ctx.scale(k, k);
      shape(ctx, rrect(-sw / 2 + 20 * p, -60 * p, sw - 40 * p, 120 * p, 14 * p), { fill: C.paper, line: 2.6, seed: 900, grain: 0.1, off: [3, 2] });
      shape(ctx, ellipse(-sw / 2 + 58 * p, -12 * p, 14 * p, 14 * p, 16), { fill: C.coral, line: 2, seed: 901, grain: 0 });
      text(ctx, 'Cantine', -sw / 2 + 86 * p, 0, { font: `600 ${Math.round(30 * p)}px Jost`, fill: C.ink });
      text(ctx, 'payé par Julie', -sw / 2 + 86 * p, 34 * p, { font: `500 ${Math.round(22 * p)}px Jost`, fill: '#5A5F6B' });
      text(ctx, '48 €', sw / 2 - 40 * p, 8 * p, { font: `${Math.round(36 * p)}px Slab`, fill: C.ink, align: 'right' });
      ctx.restore(); }
    const by = sy + sh - 230 * p;
    shape(ctx, rrect(sx + 20 * p, by, sw - 40 * p, 190 * p, 16 * p), { fill: C.sageT, line: 2.6, seed: 905, grain: 0.15, off: [3, 2] });
    text(ctx, 'À RÉGULARISER', sx + sw / 2, by + 52 * p, { font: `600 ${Math.round(22 * p)}px Jost`, fill: C.ink, align: 'center', track: 3 });
    const n = Math.round(24 * ss(seg(twos(t), 17.8, 18.3)));
    text(ctx, `${n} €`, sx + sw / 2, by + 146 * p, { font: `${Math.round(78 * p)}px Slab`, fill: C.ink, plate: C.goldL, off: [4, 3], align: 'center' });
  };
}
function receipt(ctx, x, y, s, rot) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
  const zig = []; for (let i = 0; i <= 8; i++) zig.push([-70 + i * 17.5, 100 + (i % 2) * 12]);
  shape(ctx, [[-70, -100], [70, -100], ...zig.reverse()], { fill: C.white, line: 4, seed: 920, grain: 0.1 });
  text(ctx, 'CANTINE', 0, -56, { font: '600 22px Jost', fill: C.ink, align: 'center', track: 3 });
  for (let i = 0; i < 3; i++) ink(ctx, [[-46, -20 + i * 22], [46 - i * 14, -20 + i * 22]], 3, { seed: 921 + i, color: C.navyL, taper: false });
  text(ctx, '48 €', 0, 74, { font: '40px Slab', fill: C.ink, align: 'center' });
  ctx.restore();
}
function sceneStep2(ctx, t, s) {
  const st = STEPS[1];
  bg(ctx, st.ground);
  plane(ctx, rect(-200, 1330, 1500, 900), st.floor);
  ctx.save(); cam(ctx, 540, 900, lerp(1, 1.04, ss(seg(t, s.t0, s.t1))));
  shape(ctx, rrect(185 + 14, 470 + 18, 470, 860, 72), { fill: C.navyL, line: 0, off: [0, 0], grain: 0.1, alpha: 0.7 });
  drawPhone(ctx, 420, 900, 470, 860, { screen: expScreen(t) });
  // the hand brings the receipt: enter → lift (anticipation) → let go → away
  const enter = eo(seg(t, 16.35, 16.8)), lift = ss(seg(t, 16.8, 17.0)), away = ss(seg(t, 17.15, 17.6));
  const hx = lerp(1250, 830, enter) + away * 500, hy = lerp(150, 480, enter) - lift * 34 - away * 400;
  const fall = seg(t, 17.0, 17.45);
  if (t < 17.0 && enter > 0) receipt(ctx, hx - 40, hy + 120, 1, -0.12);
  else if (fall > 0 && fall < 1) { const u = ss(fall); receipt(ctx, lerp(hx - 40, 420, u), lerp(hy + 120, 700, u) - Math.sin(u * Math.PI) * 120, lerp(1, 0.55, u), -0.12 + u * 0.9); }
  if (enter > 0 && away < 1) reach(ctx, [1250, 0], [hx, hy], Math.atan2(150, -260), t < 17.0 ? 'grip' : 'open', C.coral, 2.0);
  callout(ctx, t, 18.5, 850, 1080, 150, c2 => {
    text(c2, '24 €', 0, 26, { font: '84px Slab', fill: C.ink, plate: C.goldL, off: [5, 4], align: 'center' });
    text(c2, 'chacun sa part', 0, 82, { font: '600 26px Jost', fill: C.ink, align: 'center' });
  }, C.sageT, [560, 1180]);
  tag(ctx, t, 18.95, 'Calculé automatiquement', 540, 1262, { px: 36, maxW: 520, align: 'center' });
  stepHeader(ctx, t, s);
  ctx.restore();
  return { focus: [540, 900] };
}

// ------------------------------------------------------------------ 5: step 3, holidays and swaps
const WK = { x0: 104, y0: 470, cw: 118.3, ch: 140, gap: 12, rg: 30 };
const wkXY = (r, c) => [WK.x0 + c * (WK.cw + WK.gap), WK.y0 + r * (WK.ch + WK.rg)];
function tile(ctx, x, y, col, seed, lab) {
  shape(ctx, rrect(x, y, WK.cw, WK.ch, 14), { fill: col, line: 3, seed, grain: 0.3, breaks: 0.15 });
  if (lab) text(ctx, lab, x + WK.cw / 2, y + WK.ch / 2 + 14, { font: '600 34px Jost', fill: C.white, align: 'center' });
}
function sceneStep3(ctx, t, s) {
  const st = STEPS[2];
  bg(ctx, st.ground);
  ctx.save(); cam(ctx, 540, 900, lerp(1, 1.04, ss(seg(t, s.t0, s.t1))));
  shape(ctx, rrect(60, 330, 960, 880, 28), { fill: C.white, line: 4.4, seed: 1000, grain: 0.15 });
  ['L', 'M', 'M', 'J', 'V', 'S', 'D'].forEach((d, c) => text(ctx, d, wkXY(0, c)[0] + WK.cw / 2, WK.y0 - 26, { font: '600 30px Jost', fill: C.ink, align: 'center' }));
  text(ctx, 'Semaines', 104, 400, { font: '40px Slab', fill: C.ink, plate: C.coralL, off: [4, 3] });
  // swap: Wednesday of week 1 (Karim) ↔ Wednesday of week 2 (Julie)
  const sw = eio(seg(t, 24.0, 24.45)), SWC = 2;
  for (let r = 0; r < 2; r++) for (let c = 0; c < 7; c++) {
    if (c === SWC) continue;
    const [x, y] = wkXY(r, c); tile(ctx, x, y, r ? C.coral : C.navy, 1010 + r * 7 + c);
  }
  // the holiday week: shared half and half, with a sun
  for (let c = 0; c < 7; c++) {
    const [x, y] = wkXY(2, c), k = back(seg(t, 23.0 + c * 0.05, 23.2 + c * 0.05), 1.6);
    shape(ctx, rrect(x, y, WK.cw, WK.ch, 14), { fill: C.paper, line: 2.4, seed: 1030 + c, grain: 0.1, breaks: 0.3, off: [0, 0] });
    if (k > 0) { ctx.save(); ctx.translate(x + WK.cw / 2, y + WK.ch / 2); ctx.scale(k, k); tile(ctx, -WK.cw / 2, -WK.ch / 2, c < 4 ? C.navy : C.coral, 1040 + c); ctx.restore(); }
  }
  const kb = pop(t, 23.45, 0.3);
  if (kb > 0) { const [x, y] = wkXY(2, 0); ctx.save(); ctx.translate(x + 200, y - 4); ctx.scale(kb, kb);
    shape(ctx, rrect(-170, -36, 340, 72, 36), { fill: C.gold, line: 3.6, seed: 1050, grain: 0.2 });
    icon(ctx, 'sun', -128, 0, 78, t); text(ctx, 'Vacances', 18, 14, { font: '600 38px Jost', fill: C.ink, align: 'center' }); ctx.restore(); }
  // the two swapping tiles travel on bowed paths
  const [ax, ay] = wkXY(0, SWC), [bx, by] = wkXY(1, SWC), lift = Math.sin(sw * Math.PI);
  const A = [lerp(ax, bx, sw) - lift * 70, lerp(ay, by, sw)], Bp = [lerp(bx, ax, sw) + lift * 70, lerp(by, ay, sw)];
  [[Bp, C.coral, 1061], [A, C.navy, 1060]].forEach(([p, col, sd]) => { ctx.save(); ctx.translate(p[0] + WK.cw / 2, p[1] + WK.ch / 2); ctx.scale(1 + lift * 0.12, 1 + lift * 0.12); tile(ctx, -WK.cw / 2, -WK.ch / 2, col, sd); ctx.restore(); });
  const ua = seg(t, 23.6, 23.95), fadeA = 1 - seg(t, 24.5, 24.8);
  if (ua > 0 && fadeA > 0) { ctx.save(); ctx.globalAlpha = fadeA;
    arrow(ctx, [ax - 16, ay + 30], [bx - 16, by + WK.ch - 30], { u: ua, bend: -0.45, w: 6, fill: C.navy, head: 30, color: C.ink });
    arrow(ctx, [bx + WK.cw + 16, by + WK.ch - 30], [ax + WK.cw + 16, ay + 30], { u: ua, bend: -0.45, w: 6, fill: C.coral, head: 30, color: C.ink, seed: 13 });
    ctx.restore(); }
  // finger points at the swap, then leaves before the stamp
  const enter = eo(seg(t, 23.5, 23.9)), tap = Math.sin(clamp(seg(t, 23.95, 24.15)) * Math.PI), away = ss(seg(t, 24.4, 24.8));
  if (enter > 0 && away < 1) {
    const tip = [ax + WK.cw / 2 + 40, by + WK.ch + 20];
    reach(ctx, [1100, 1900], [lerp(1150, tip[0] + 80, enter) + tap * 10 + away * 600, lerp(1800, tip[1] + 70, enter) + tap * 10 + away * 700], Math.atan2(-70, -80), 'point', C.navy, 2.2);
  }
  // the stamp
  const ks = back(seg(t, 25.0, 25.22), 2.2);
  if (ks > 0) { ctx.save(); ctx.translate(540, 1070); ctx.rotate(-0.09); ctx.scale(lerp(1.6, 1, clamp(ks)), lerp(1.6, 1, clamp(ks)));
    ink(ctx, rrect(-230, -62, 460, 124, 16), 7, { closed: true, seed: 1070, color: C.sageD, breaks: 0.18 });
    text(ctx, 'VALIDÉ', 48, 26, { font: '72px Slab', fill: C.sageD, align: 'center', track: 6 });
    ink(ctx, [[-208, -4], [-186, 22], [-150, -28]], 9, { seed: 1071, color: C.sageD, taper: false });
    ctx.restore(); }
  stepHeader(ctx, t, s);
  ctx.restore();
  return { focus: [540, 900] };
}

// ------------------------------------------------------------------ 6: the end — seam closes, circle match-cut into the logo
const LOGO_C = [540, 860], LOGO_RING = 360, LOGO_SIZE = 1254 * LOGO_RING / 591;
function sceneEnd(ctx, t, s) {
  const u = t - s.t0;
  if (t < 30.2) return homes(ctx, t, Math.max(1e-3, u));
  bg(ctx, C.paper);
  rays(ctx, LOGO_C[0], LOGO_C[1], 30, 1600, C.sageL, { alpha: 0.6, rot: 0.2 + Math.min(t, 31) * 0.02 });
  const kp = pop(t, 30.7, 0.3);
  if (kp > 0) { ctx.save(); ctx.translate(540, 300); ctx.scale(kp, kp);
    shape(ctx, rrect(-300, -46, 600, 92, 46), { fill: C.white, line: 4, seed: 1100, grain: 0.15, off: [5, 4] });
    star(ctx, -250, 0, 18, { n: 8, inner: 0.42, fill: C.gold, off: [0, 0] }); star(ctx, 250, 0, 18, { n: 8, inner: 0.42, fill: C.gold, off: [0, 0] });
    text(ctx, 'Gratuit pour commencer', 0, 14, { font: '600 40px Jost', fill: C.ink, align: 'center' }); ctx.restore(); }
  const ku = pop(t, 30.95, 0.3);
  if (ku > 0) { ctx.save(); ctx.translate(540, 1352); ctx.scale(ku, ku);
    text(ctx, 'coparentalitezen.fr', 0, 0, { font: '66px Slab', fill: C.ink, plate: C.goldL, off: [5, 4], align: 'center', maxW: 980 }); ctx.restore(); }
  return { logo: true };
}
// drawn after the paper finish: the user's logo stays untouched; then the iris mask
function endOverlay(ctx, t) {
  if (t < 29.6) return;
  const k = eio(seg(t, 29.6, 30.2));
  const from = [540, FLOOR - 0.82 * 330], r0 = 980;
  const cx = lerp(from[0], LOGO_C[0], k), cy = lerp(from[1], LOGO_C[1], k), r = lerp(r0, LOGO_RING, k);
  if (t >= 30.2 && LOGO) ctx.drawImage(LOGO, LOGO_C[0] - LOGO_SIZE / 2, LOGO_C[1] - LOGO_SIZE / 2, LOGO_SIZE, LOGO_SIZE);
  // ink outside the circle; after the cut it opens back out to reveal the stage
  const rOut = t < 30.2 ? r : lerp(LOGO_RING + 2, 1500, eo(seg(t, 30.25, 30.65)));
  if (rOut < 1450) {
    ctx.save(); ctx.fillStyle = C.ink; ctx.beginPath(); ctx.rect(-10, -10, W + 20, H + 20); ctx.arc(cx, cy, t < 30.2 ? r : rOut, 0, TAU, true); ctx.fill(); ctx.restore();
    if (t < 30.2) ink(ctx, ellipse(cx, cy, r, r, 90), 7, { closed: true, seed: 960, color: C.sage });
  }
}

// ------------------------------------------------------------------ captions
function caption(ctx, t) {
  const cue = subs().find(s => t >= s.t0 && t < s.t1); if (!cue) return;
  const a = Math.min(ss(seg(t, cue.t0, cue.t0 + 0.16)), 1 - ss(seg(t, cue.t1 - 0.16, cue.t1)));
  const f = fit(ctx, cue.text, '500 {px}px Jost', 44, 880, 2, 34);
  const w = Math.max(...f.lines.map(l => measure(ctx, l, f.font))) + 130, lh = f.px * 1.25, h = 40 + lh * f.lines.length, x = W / 2 - w / 2, y = CAP_BOTTOM - h;
  ctx.save(); ctx.globalAlpha = a; ctx.translate(0, (1 - a) * 10);
  shape(ctx, rrect(x, y, w, h, 16), { fill: C.white, line: 3.2, seed: 901, grain: 0.15, breaks: 0.08, off: [5, 5] });
  star(ctx, x + 34, y + h / 2, 15, { n: 8, inner: 0.4, fill: C.gold, off: [0, 0], rot: t * 0.8 });
  star(ctx, x + w - 34, y + h / 2, 15, { n: 8, inner: 0.4, fill: C.gold, off: [0, 0], rot: -t * 0.8 });
  f.lines.forEach((l, i) => text(ctx, l, W / 2, y + 20 + lh * (i + 0.5) + f.px * 0.34, { font: f.font, fill: C.ink, align: 'center' }));
  ctx.restore();
}
export function texts(t) {
  const cue = subs().find(s => t >= s.t0 && t < s.t1);
  return cue ? [{ id: 'cap' + cue.t0, text: cue.text, x0: 100, y0: 1420, x1: 980, y1: 1560 }] : [];
}

// ------------------------------------------------------------------ render + transitions
function drawSection(ctx, t, s) {
  ctx.save(); let r = {};
  if (s.kind === 'hook') r = homes(ctx, t, 0);
  else if (s.kind === 'title') r = sceneTitle(ctx, t, s);
  else if (s.kind === 'step') r = [sceneStep1, sceneStep2, sceneStep3][s.i](ctx, t, s);
  else r = sceneEnd(ctx, t, s);
  ctx.restore(); return r || {};
}
function iris(ctx, t, ta, tb, prev, next, focus) {
  const k = eio(seg(t, ta, tb));
  drawSection(ctx, prev.t1 - 1e-3, prev);
  const cx = lerp(focus[0], W / 2, k), cy = lerp(focus[1], H / 2, k), r = lerp(110, 1250, k * k);
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.clip(); drawSection(ctx, Math.max(t, next.t0 + 1e-3), next); ctx.restore();
  ink(ctx, ellipse(cx, cy, r, r, 90), 7, { closed: true, seed: 965, color: C.ink });
}
function wipe(ctx, t, d, prev, next, dir) {
  const k = eio(seg(t, next.t0, next.t0 + d));
  drawSection(ctx, prev.t1 - 1e-3, prev);
  ctx.save(); ctx.beginPath();
  if (dir === 'up') ctx.rect(0, H * (1 - k), W, H); else ctx.rect(0, 0, W * k, H);
  ctx.clip(); drawSection(ctx, t, next); ctx.restore();
  if (dir === 'up') ink(ctx, [[-10, H * (1 - k)], [W + 10, H * (1 - k)]], 6, { seed: 963, color: C.ink }); else ink(ctx, [[W * k, -10], [W * k, H + 10]], 6, { seed: 964, color: C.ink });
}
export function renderFilm(ctx, t, Q) {
  setClock(t);
  const s = section(t), i = S.indexOf(s), pv = S[i - 1];
  ctx.save();
  if (s.kind === 'title' && t < 5.75) {
    // the heart medallion stamps on the seam (first sound after the silence), then we go through it
    if (t < 5.25) { drawSection(ctx, 4.999, S[0]); medallion(ctx, t, 5.0, 540, 640, 110, heartInner); }
    else { iris(ctx, t, 5.25, 5.75, S[0], s, [540, 640]); }
  } else if (s.kind === 'step' && s.i === 0 && t < 10.2) iris(ctx, t, 9.75, 10.2, pv, s, [540, 1010]);
  else if (s.kind === 'title' && t >= 9.75) iris(ctx, t, 9.75, 10.2, s, S[i + 1], [540, 1010]);
  else if (s.kind === 'step' && s.i === 1 && t < 16.3) wipe(ctx, t, 0.3, pv, s, 'up');
  else if (s.kind === 'step' && s.i === 2 && t < 22.3) wipe(ctx, t, 0.3, pv, s, 'side');
  else drawSection(ctx, t, s);
  ctx.restore();
  paperFinish(ctx, W, H, 0.9);
  if (s.kind === 'end') endOverlay(ctx, t);
  if (!(Q && Q.has('nosubs'))) caption(ctx, t);
}

// ------------------------------------------------------------------ sound events (the same times drive the pictures)
function buildEvents() {
  EVS = []; const ev = (t, type, o = {}) => EVS.push({ t: +t.toFixed(4), type, ...o });
  V.forEach(v => ev(v.t, 'vo', { id: v.id }));
  ev(0.0, 'pop', { gain: 0.4 });
  ev(0.5, 'bubble', { pan: -0.4 }); ev(1.5, 'bubble', { pan: 0.4, pitch: 1 }); ev(2.5, 'bubble', { pan: 0, pitch: 2 });
  ev(1.0, 'buzz', { pan: -0.4 }); ev(2.0, 'buzz', { pan: 0.4 });
  ev(5.0, 'stamp', {}); ev(5.25, 'iris', { dur: 0.5 });
  ev(5.6, 'pop', { gain: 0.7 }); ev(5.55, 'pen_write', { dur: 0.8 }); ev(6.3, 'slide', {}); ev(6.8, 'pop', { gain: 0.4 });
  ev(9.5, 'stamp', {}); ev(9.75, 'whoosh', { dur: 0.45 });
  // step 1
  ev(10.05, 'slide', { gain: 0.6 });
  for (let r = 0; r < 4; r++) ev(10.75 + r * 0.5, 'pen_write', { dur: 0.38, gain: 0.7, pan: -0.3 + r * 0.2 });
  ev(12.6, 'pop', { gain: 0.5 }); ev(12.0, 'whoosh', { dur: 0.35, gain: 0.4 }); ev(13.0, 'tap', {}); ev(13.4, 'pop', {}); ev(13.9, 'ding', { gain: 0.6 });
  // step 2
  ev(16.0, 'paper_swish', {}); ev(16.1, 'slide', { gain: 0.6 }); ev(16.35, 'whoosh', { dur: 0.4, gain: 0.4 });
  ev(17.0, 'flutter', { dur: 0.45 }); ev(17.45, 'paper_land', {}); ev(17.5, 'pop', { gain: 0.6 });
  for (let k = 0; k < 6; k++) ev(17.8 + k * (1 / 12), 'tick', { n: k });
  ev(18.5, 'pop', {}); ev(18.95, 'ding', { gain: 0.6 });
  // step 3
  ev(22.0, 'paper_swish', {}); ev(22.1, 'slide', { gain: 0.6 });
  ev(23.0, 'pen_write', { dur: 0.4, gain: 0.7 }); ev(23.45, 'pop', {}); ev(23.5, 'whoosh', { dur: 0.35, gain: 0.35 });
  ev(23.95, 'tap', {}); ev(24.0, 'whistle', { up: 0, pan: -0.4 }); ev(24.2, 'whistle', { up: 1, pan: 0.4 });
  ev(25.0, 'stamp', { gain: 1.0 });
  // end
  ev(28.0, 'whoosh', { dur: 0.5, gain: 0.5 }); ev(28.6, 'paper_swish', { pan: -0.5 }); ev(28.65, 'paper_swish', { pan: 0.5 });
  ev(29.0, 'pop', { gain: 0.7 }); ev(29.05, 'sparkle', {});
  ev(29.6, 'iris', { dur: 0.6 }); ev(30.2, 'ding', { gain: 0.8 });
  ev(30.7, 'pop', { gain: 0.5 }); ev(30.95, 'pop', { gain: 0.5 });
  EVS.sort((a, b) => a.t - b.t);
}
