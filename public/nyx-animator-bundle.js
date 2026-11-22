// src/game/render/nyxAnimsCombat.ts
var HIPS = 0;
var SPINE = 1;
var CHEST = 2;
var NECK = 3;
var HEAD = 4;
var HAND_L = 7;
var HAND_R = 10;
var SPIRAL_DRILL_KICK_DURATION = 1.25;
var COUNTER_PARRY_DURATION = 0.75;
function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
function mix(a, b, k) {
  return a + (b - a) * k;
}
function smooth(a, b, v) {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
function wrapPi(a) {
  let r = a;
  while (r > Math.PI) r -= 2 * Math.PI;
  while (r <= -Math.PI) r += 2 * Math.PI;
  return r;
}
function seq4(rest, a, b, c, k1, k2, k3) {
  return mix(mix(mix(rest, a, k1), b, k2), c, k3);
}
function seq5(rest, a, b, c, d, k1, k2, k3, k4) {
  return mix(seq4(rest, a, b, c, k1, k2, k3), d, k4);
}
function poseGravitySlide(w, g, speed01, turnRate) {
  const sp = clamp(speed01, 0, 1);
  const lean = clamp(-turnRate * 0.35, -0.55, 0.55);
  const look = clamp(turnRate * 0.22, -0.5, 0.5);
  const twist = clamp(turnRate * 0.07, -0.16, 0.16);
  const bump = Math.sin(g * 11.3) * 0.016 * sp;
  const bump2 = Math.sin(g * 7.1 + 1.7) * 0.012 * sp;
  const drift = Math.sin(g * 1.6) * 0.03;
  const flutter = Math.sin(g * 6.2 + 0.6) * 0.05 * sp;
  w.pos(drift * 0.4 + lean * 0.06, -0.26 - 0.15 * sp + bump, 0.03 + 0.05 * sp);
  w.p(HIPS, 0.1 + 0.1 * sp, -clamp(turnRate * 0.05, -0.12, 0.12), lean);
  w.p(SPINE, 0.14 + 0.04 * sp, twist, lean * 0.5);
  w.p(CHEST, 0.1, clamp(turnRate * 0.12, -0.28, 0.28), lean * 0.35);
  w.p(NECK, -0.06, 0, -lean * 0.2);
  w.p(HEAD, -0.14, look, -lean * 0.55);
  w.legR(-(0.42 + 0.28 * sp) + bump2, 0, 0.06, 0.16 + 0.1 * sp);
  w.legL(0.42 + 0.16 * sp, 0.04, 0.12 + 0.05 * sp, 1.55 + 0.45 * sp);
  w.armL(0.3 + 0.1 * sp, 0.22, -1.3 + lean * 0.15 + bump * 0.5, 0, -0.14, -0.06);
  w.p(HAND_L, -0.3, 0, 0.15);
  w.armR(-0.12 + flutter * 0.3, -0.38 + flutter, 0.18 + drift, 0, -0.28, -0.1);
  w.p(HAND_R, -0.35, 0, 0);
  w.footR(-(0.32 + 0.18 * sp), 0, 0.04, -(0.18 + 0.12 * sp));
  w.footL(-(0.5 + 0.12 * sp), 0.03, 0.05, -0.32);
  w.clavL(0.05, 0.08, -0.1 + lean * 0.15);
  w.clavR(0.05, -0.06, 0.05 - lean * 0.1);
}
function poseSpiralDrillKick(w, t, g) {
  const coil = smooth(0, 0.09, t) * (1 - smooth(0.1, 0.18, t));
  const launch = smooth(0.12, 0.26, t);
  const drill = smooth(0.16, 0.34, t) * (1 - smooth(1.02, 1.25, t));
  const settle = smooth(1.02, 1.25, t);
  const vib = Math.sin(g * 29) * 0.03 * drill;
  const vib2 = Math.cos(g * 23) * 0.02 * drill;
  const spin = wrapPi(-0.35 * coil + 4 * Math.PI * smooth(0.15, 1.06, t));
  w.pos(
    0,
    seq4(0, 0.05, 0.02, 0.03, coil, launch, settle),
    seq4(0, -0.03, 0.16, 0.06, coil, launch, settle)
  );
  w.p(HIPS, seq4(0, 0.32, -1.46, -0.85, coil, launch, settle), spin, vib);
  w.p(SPINE, seq4(0, 0.22, -0.1, -0.05, coil, launch, settle), 0, vib2 * 0.5);
  w.p(
    CHEST,
    seq4(0, 0.16, -0.07, -0.04, coil, launch, settle),
    seq4(0, 0.12, -0.1, -0.02, coil, launch, settle),
    0
  );
  w.p(NECK, seq4(0, 0.1, -0.06, -0.03, coil, launch, settle), 0, 0);
  w.p(HEAD, seq4(0, 0.34, 0.55, 0.1, coil, launch, settle), 0, 0);
  const aux = seq4(0.04, 0.1, -0.04, -0.02, coil, launch, settle);
  const auy = seq4(0, -0.35, 0.1, -0.1, coil, launch, settle);
  const auz = seq4(-1.1, -0.9, 1.12, 0.55, coil, launch, settle);
  const afy = seq4(-0.12, -1.25, -0.07, -0.3, coil, launch, settle);
  const ahx = seq4(-0.1, -0.2, -0.55, -0.3, coil, launch, settle);
  w.armL(aux, auy, auz + 0.02, 0, afy, 0.04);
  w.armR(aux, auy, auz - 0.06, 0, afy, 0.04);
  w.p(HAND_L, ahx, 0, 0);
  w.p(HAND_R, ahx, 0, 0);
  w.legR(
    seq4(0.02, -1.35, -0.03, -0.18, coil, launch, settle),
    0,
    seq4(0.03, 0.06, -0.06, -0.04, coil, launch, settle),
    seq4(0.04, 2, 0.05, 0.2, coil, launch, settle) + (0.02 + 0.015 * Math.sin(g * 36)) * drill
  );
  w.legL(
    seq4(0, -1.2, -1.02, -0.72, coil, launch, settle),
    0.05,
    seq4(0.03, 0.1, 0.14, 0.12, coil, launch, settle),
    seq4(0.04, 1.95, 1.85, 1.35, coil, launch, settle)
  );
}
function poseCounterParry(w, t) {
  const wind = smooth(0, 0.07, t) * (1 - smooth(0.07, 0.14, t));
  const sweep = smooth(0.09, 0.19, t);
  const push = smooth(0.16, 0.27, t);
  const snap = smooth(0.09, 0.18, t);
  const rec = smooth(0.34, 0.72, t);
  w.pos(
    0,
    -0.05 * wind + mix(-0.13 * snap, -0.015, rec),
    -0.04 * wind + mix(0.1 * snap, 0.02, rec)
  );
  w.p(
    HIPS,
    0.06 * wind + mix(0.1 * snap, 0.03, rec),
    -0.34 * wind + mix(0.62 * snap, 0.06, rec),
    0
  );
  w.p(SPINE, 0.14 * wind + mix(0.1 * snap, 0.03, rec), 0, 0);
  w.p(
    CHEST,
    0.1 * wind + mix(0.16 * snap, 0.05, rec),
    -0.2 * wind + mix(0.5 * snap, 0.04, rec),
    0
  );
  w.p(NECK, mix(-0.05 * snap, -0.02, rec), 0, 0);
  w.p(
    HEAD,
    mix(-0.06 * snap, -0.04, rec),
    0.22 * wind + mix(-0.34 * snap, 0.08, rec),
    0
  );
  w.armL(
    seq5(0.05, 0.1, -0.1, -0.12, -0.06, wind, sweep, push, rec),
    seq5(-0.05, -1.6, -0.28, -1.28, -0.5, wind, sweep, push, rec),
    seq5(-1.08, -1.05, 0.16, -0.3, -0.85, wind, sweep, push, rec),
    0,
    seq5(-0.25, -1.05, -0.16, -0.2, -0.3, wind, sweep, push, rec),
    seq5(-0.08, -0.12, -0.05, -0.06, -0.08, wind, sweep, push, rec)
  );
  w.armR(
    seq5(0.05, 0.06, -0.1, -0.12, 0.08, wind, sweep, push, rec),
    seq5(-0.05, 0.45, -0.28, -1.28, 0.28, wind, sweep, push, rec),
    seq5(-1.08, -1.15, 0.16, -0.3, -0.95, wind, sweep, push, rec),
    0,
    seq5(-0.25, -0.7, -0.16, -0.2, -0.22, wind, sweep, push, rec),
    seq5(-0.08, -0.1, -0.05, -0.06, -0.08, wind, sweep, push, rec)
  );
  const hx = seq5(-0.1, -0.2, -0.25, -0.55, -0.25, wind, sweep, push, rec);
  w.p(HAND_L, hx, 0, 0);
  w.p(HAND_R, hx, 0, 0);
  w.legL(
    seq4(-0.06, -0.18, -0.52, -0.12, wind, snap, rec),
    0,
    seq4(0.03, 0.05, 0.05, 0.04, wind, snap, rec),
    seq4(0.06, 0.3, 0.32, 0.14, wind, snap, rec)
  );
  w.legR(
    seq4(0.03, 0.12, 0.3, 0.06, wind, snap, rec),
    0,
    seq4(0.03, 0.07, 0.07, 0.04, wind, snap, rec),
    seq4(0.06, 0.35, 0.55, 0.12, wind, snap, rec)
  );
  w.clavL(0.02 * wind, -0.12 * push, 0.1 * wind + 0.06 * sweep);
  w.clavR(0.02 * wind, 0.12 * push, 0.1 * wind + 0.06 * sweep);
  w.footL(seq4(0.02, 0.08, 0.12, 0.04, wind, snap, rec), 0, 0.03, 0);
  w.footR(seq4(0.02, -0.05, -0.1, 0.02, wind, snap, rec), 0, 0.03, 0);
}
function poseGravityKick(w, t, g) {
  const coil = smooth(0, 0.12, t) * (1 - smooth(0.13, 0.24, t));
  const fly = smooth(0.15, 0.32, t) * (1 - smooth(0.95, 1.15, t));
  const vib = Math.sin(g * 27) * 0.05 * fly;
  const vib2 = Math.cos(g * 21) * 0.03 * fly;
  w.pos(0, 0.08 * fly - 0.02 * coil, 0.18 * fly - 0.05 * coil);
  w.p(HIPS, -0.18 * coil + 1.15 * fly, vib2, 0);
  w.p(SPINE, 0.1 * coil + 0.06 * fly, 0, 0);
  w.p(CHEST, 0.12 * coil, -0.55 * fly, 0);
  w.p(NECK, -0.08 * fly, 0, 0);
  w.p(HEAD, 0.25 * coil - 0.65 * fly, 0.12 * fly, 0);
  w.clavL(0.08 * fly, 0.22 * fly, -0.08 * fly);
  w.clavR(0.08 * fly, 0.22 * fly, -0.08 * fly);
  w.armL(
    0.3 * coil + (1.05 + vib) * fly,
    0.3 * fly,
    mix(-1.1, -0.45, fly),
    0,
    -0.35 * coil - 0.12 * fly,
    -0.05
  );
  w.armR(
    0.3 * coil + (1 - vib) * fly,
    0.25 * fly,
    mix(-1.1, -0.5, fly),
    0,
    -0.3 * coil - 0.1 * fly,
    -0.05
  );
  w.legR(-1.3 * coil - 0.65 * fly, 0, 0.03, 1.6 * coil + 0.04);
  w.legL(-1.3 * coil + 0.45 * fly, 0, 0.1, 1.6 * coil + 1.45 * fly);
  w.footR(0.28 * coil - 0.85 * fly, 0, 0, -0.45 * fly);
  w.footL(0.35 * coil + 0.22 * fly, 0, 0.04, 0.1 * fly);
}
function poseKickFlip(w, t, g) {
  const p = clamp(t / 0.85, 0, 1);
  const arc = Math.sin(p * Math.PI);
  const tuck = smooth(0.02, 0.16, t) * (1 - smooth(0.6, 0.85, t));
  const wob = Math.sin(g * 5.2) * 0.04 * arc;
  let flip = -2 * Math.PI * smooth(0.02, 0.78, t);
  while (flip <= -Math.PI) flip += 2 * Math.PI;
  w.pos(0, 0.22 * arc, -0.14 * arc);
  w.p(HIPS, flip, wob, 0);
  w.p(SPINE, 0.2 * tuck, 0, 0);
  w.p(CHEST, 0.16 * tuck, -0.15 * tuck, 0);
  w.p(HEAD, 0.34 * tuck, 0, 0);
  w.clavL(0, -0.12 * tuck, 0.18 * tuck);
  w.clavR(0, -0.12 * tuck, 0.18 * tuck);
  w.armL(0.12 + 0.22 * tuck, -0.3 * tuck, -0.82, 0.08, -0.45 * tuck, -0.1);
  w.armR(0.12 + 0.22 * tuck, -0.25 * tuck, -0.82, 0.08, -0.4 * tuck, -0.1);
  w.legL(-1.15, 0.05, 0.08, 1.55);
  w.legR(-1.15, 0, 0.08, 1.55);
  w.footL(-0.35 * tuck, 0, 0.03, -0.2 * tuck);
  w.footR(-0.35 * tuck, 0, 0.03, -0.2 * tuck);
  return flip;
}

// src/game/render/nyxAnimsTraversal.ts
var HIPS2 = 0;
var SPINE2 = 1;
var CHEST2 = 2;
var NECK2 = 3;
var HEAD2 = 4;
var HAND_L2 = 7;
var HAND_R2 = 10;
var WALL_SHIFT_FLIP_DURATION = 0.75;
var DOME_BOUNCE_DURATION = 0.85;
function clamp2(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
function mix2(a, b, k) {
  return a + (b - a) * k;
}
function smooth2(a, b, v) {
  const t = clamp2((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
function pulse(t, a, b, c) {
  return smooth2(a, b, t) * (1 - smooth2(b, c, t));
}
function wrapAngle(rad) {
  let a = rad;
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a <= -Math.PI) a += 2 * Math.PI;
  return a;
}
function poseZeroGFloat(w, g) {
  const breath = Math.sin(g * 1.35);
  const breath2 = Math.sin(g * 0.9 + 1.2);
  const drift = Math.sin(g * 0.6) * 0.04;
  const leg = Math.sin(g * 1.1 + 0.8);
  w.pos(drift, 0.08 + breath * 0.025, breath2 * 0.02);
  w.p(HIPS2, -0.05 + breath * 0.02, breath2 * 0.06, drift * 0.8);
  w.p(SPINE2, -0.03 + breath * 0.035, -0.04, -0.02 * breath2);
  w.p(CHEST2, 0.02 + breath * 0.05, -0.06, 0.02 * breath2);
  w.p(NECK2, -0.03 - breath * 0.02, 0, 0);
  w.p(HEAD2, -0.05 + breath2 * 0.03, 0.08 + breath2 * 0.06, 0.04 * breath2);
  w.clavL(0.02 * breath, 0.03, -0.06 + 0.03 * breath);
  w.clavR(0.02 * breath, -0.03, -0.06 + 0.03 * breath);
  w.armL(
    -0.1 + breath2 * 0.05,
    -0.18 + breath * 0.04,
    -0.72 + breath * 0.06,
    0,
    -0.28 - breath * 0.05,
    -0.06
  );
  w.armR(
    -0.06 - breath2 * 0.05,
    -0.14 - breath * 0.04,
    -0.66 - breath * 0.06,
    0,
    -0.24 + breath * 0.05,
    -0.06
  );
  w.p(HAND_L2, -0.08, 0, 0.06);
  w.p(HAND_R2, -0.06, 0, -0.06);
  w.legL(-0.22 + leg * 0.05, 0.03, 0.05, 0.42 + leg * 0.06);
  w.legR(0.14 - leg * 0.04, -0.02, 0.07, 0.16 - leg * 0.04);
  w.footL(-0.24 + leg * 0.04, 0.02, 0.03, -0.1);
  w.footR(-0.34 - leg * 0.04, -0.02, -0.03, -0.16);
}
function poseGravityFall(w, g, vVel, hasVVel) {
  const spd = hasVVel ? clamp2(Math.abs(vVel) / 15, 0.18, 1) : 0.55;
  const flutter = Math.sin(g * 5.3) * 0.09 * spd;
  const flutter2 = Math.sin(g * 3.7 + 1.4) * 0.07 * spd;
  const sway = Math.sin(g * 1.7) * 0.05 * spd;
  w.pos(sway * 0.5, 0.04 + flutter2 * 0.3, -0.05 * spd);
  w.p(HIPS2, -0.16 * spd, flutter * 0.4, sway);
  w.p(SPINE2, -0.2 * spd, -0.05, sway * 0.5);
  w.p(CHEST2, -0.26 * spd + flutter2 * 0.3, -0.08, 0);
  w.p(NECK2, -0.08 * spd, 0, 0);
  w.p(HEAD2, -0.3 * spd + flutter * 0.25, 0.1, sway * 0.6);
  w.clavL(0.04 * spd, 0.1 * spd, 0.12 * spd + flutter * 0.3);
  w.clavR(0.04 * spd, -0.1 * spd, 0.12 * spd - flutter * 0.3);
  w.armL(
    0.3 * spd + flutter * 0.5,
    -0.2,
    -0.78 + flutter2 * 0.6,
    0,
    0.15 + flutter * 0.4,
    -0.05
  );
  w.armR(
    0.26 * spd - flutter * 0.5,
    -0.16,
    -0.82 - flutter2 * 0.6,
    0,
    0.12 - flutter * 0.4,
    -0.05
  );
  w.p(HAND_L2, 0.2, 0, 0.08);
  w.p(HAND_R2, 0.16, 0, -0.08);
  w.legL(0.18 * spd + flutter2 * 0.3, 0.04, 0.06, 0.5 + flutter * 0.5);
  w.legR(0.3 * spd - flutter2 * 0.3, -0.03, 0.08, 0.28 - flutter * 0.5);
  w.footL(-0.5 * spd + flutter * 0.15, 0.03, 0.04, -0.28 * spd);
  w.footR(-0.58 * spd - flutter * 0.15, -0.03, -0.04, -0.34 * spd);
}
function poseWallShiftFlip(w, t) {
  const p = clamp2(t / WALL_SHIFT_FLIP_DURATION, 0, 1);
  const arc = Math.sin(p * Math.PI);
  const spin = wrapAngle(p * Math.PI * 2);
  const tuck = smooth2(0.12, 0.4, p) * (1 - smooth2(0.62, 0.9, p));
  w.pos(0, 0.14 * arc, -0.06 * arc);
  w.p(HIPS2, 0.25 * arc, spin, 0.28 * arc);
  w.p(SPINE2, -0.22 * arc, 0.12 * arc, 0);
  w.p(CHEST2, -0.26 * arc, -0.18 * arc, 0);
  w.p(NECK2, -0.12 * arc, 0, 0);
  w.p(HEAD2, -0.18 * arc, -0.22 * arc, 0.08 * arc);
  w.clavL(0.03 * arc, -0.08 * arc, 0.1 * arc);
  w.clavR(0.03 * arc, 0.08 * arc, 0.14 * arc);
  w.armL(-0.18 * arc, -0.55 * arc, mix2(-0.8, -0.25, arc), 0, -0.35 * arc, -0.1);
  w.armR(0.22 * arc, 0.45 * arc, mix2(-0.65, -0.15, arc), 0, -0.45 * arc, -0.1);
  w.legL(-0.95 * arc - 0.15, 0, 0.08, 1.55 * arc + 0.12);
  w.legR(0.35 * arc, 0, 0.1, 0.35 * arc + 0.1);
  w.footL(0.3 * tuck, 0, 0.04, 0.12 * tuck);
  w.footR(-0.42 * arc - 0.1, 0, -0.05, -0.26 * arc - 0.06);
}
function poseDomeBounce(w, t) {
  const hit = pulse(t, 0, 0.14, 0.36);
  const reb = smooth2(0.2, 0.45, t) * (1 - smooth2(0.62, 0.85, t));
  w.pos(0, 0.12 * reb - 0.06 * hit, -0.16 * hit + 0.14 * reb);
  w.p(HIPS2, -0.45 * hit + 0.22 * reb, 0.35 * reb, -0.35 * hit + 0.32 * reb);
  w.p(SPINE2, -0.28 * hit + 0.1 * reb, 0, 0);
  w.p(CHEST2, -0.32 * hit + 0.12 * reb, -0.25 * reb, 0);
  w.p(NECK2, 0.06 * hit, 0, 0);
  w.p(HEAD2, 0.15 * hit - 0.12 * reb, 0.15 * hit, 0.12 * hit);
  w.clavL(0, 0.12 * hit, 0.22 * hit - 0.08 * reb);
  w.clavR(0, -0.12 * hit, 0.22 * hit - 0.08 * reb);
  w.armL(
    0.45 * hit - 0.15 * reb,
    0.45 * hit - 0.25 * reb,
    mix2(-1.05, -0.35, Math.max(hit, reb)),
    0,
    -0.55 * hit - 0.25 * reb,
    -0.08
  );
  w.armR(
    0.45 * hit - 0.1 * reb,
    0.35 * hit - 0.2 * reb,
    mix2(-1.05, -0.45, Math.max(hit, reb)),
    0,
    -0.5 * hit - 0.2 * reb,
    -0.08
  );
  w.legL(-0.65 * hit - 0.35 * reb, 0, 0.09, 1.25 * hit + 0.75 * reb);
  w.legR(-0.35 * hit + 0.15 * reb, 0, 0.09, 0.85 * hit + 0.25 * reb);
  w.footL(0.35 * hit - 0.45 * reb, 0, 0.03, 0.18 * hit - 0.3 * reb);
  w.footR(0.3 * hit - 0.4 * reb, 0, -0.03, 0.15 * hit - 0.26 * reb);
}
function poseVictoryFloat(w, g) {
  const bob = Math.sin(g * 1.45) * 0.06;
  const sway = Math.sin(g * 0.85);
  const spin = wrapAngle(g * 0.45);
  const toe = Math.sin(g * 1.3) * 0.05;
  w.pos(0, 0.1 + bob, 0);
  w.p(HIPS2, -0.08 + bob * 0.4, spin, 0.06 * sway);
  w.p(SPINE2, -0.06, -0.08, -0.04 * sway);
  w.p(CHEST2, -0.08 + Math.sin(g * 1.9) * 0.02, -0.1, 0);
  w.p(NECK2, -0.04, 0, 0);
  w.p(HEAD2, -0.06, 0.12 + sway * 0.05, 0.06);
  w.clavL(0, 0.04, -0.08 + Math.sin(g * 1.9) * 0.015);
  w.clavR(0, -0.04, -0.08 + Math.sin(g * 1.9) * 0.015);
  w.armL(0.08, 0.35, -0.85, 0, -1.15, -0.12);
  w.p(HAND_L2, 0, 0, 0.15);
  w.armR(
    -0.18 + Math.sin(g * 1.2) * 0.04,
    -0.35,
    -0.32 + Math.sin(g * 1.5) * 0.05,
    0,
    -0.35,
    -0.1
  );
  w.p(HAND_R2, -0.25, 0, 0);
  w.legL(-0.55 + Math.sin(g * 1.3) * 0.04, -0.12, -0.14, 1.05);
  w.legR(0.18 + Math.sin(g * 1.3 + 1) * 0.04, 0.08, 0.06, 0.24);
  w.footL(-0.42 + toe, 0.02, -0.03, -0.22 + toe * 0.5);
  w.footR(-0.3 - toe * 0.6, -0.02, 0.03, -0.14);
}

// src/game/render/nyxAnimsGrounded.ts
var HIPS3 = 0;
var SPINE3 = 1;
var CHEST3 = 2;
var NECK3 = 3;
var HEAD3 = 4;
var HAND_L3 = 7;
var HAND_R3 = 10;
var JUMP_LAND_DURATION = 1.15;
var AIR_DASH_DURATION = 0.6;
function clamp3(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
function mix3(a, b, k) {
  return a + (b - a) * k;
}
function smooth3(a, b, v) {
  const t = clamp3((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
function pulse2(t, a, b, c) {
  return smooth3(a, b, t) * (1 - smooth3(b, c, t));
}
function poseIdle(w, g) {
  const b = Math.sin(g * 1.7) * 0.02;
  const sh = Math.sin(g * 0.6);
  const sh2 = Math.sin(g * 0.6 + 1.2);
  w.pos(sh * 0.018, -0.012 + b * 0.5, 0);
  w.p(HIPS3, 0.01, sh * 0.05, sh * 0.035);
  w.p(SPINE3, 0.02, -sh * 0.03, -sh * 0.022);
  w.p(CHEST3, 0.035 + b, sh * 0.015, -sh * 0.012);
  w.p(NECK3, -0.015 - b * 0.3, 0, 0);
  w.p(HEAD3, -0.03 - b * 0.5, Math.sin(g * 0.4) * 0.08, sh2 * 0.012);
  w.armL(0.05 + Math.sin(g * 1.2) * 0.03, 0, -1.1 + b * 2, 0, -0.2, -0.08);
  w.armR(0.05 + Math.sin(g * 1.2 + 0.8) * 0.03, 0, -1.1 - b * 2, 0, -0.2, -0.08);
  w.p(HAND_L3, 0.04 + Math.sin(g * 1.2) * 0.02, 0, 0);
  w.p(HAND_R3, 0.04 + Math.sin(g * 1.2 + 0.8) * 0.02, 0, 0);
  w.legL(-0.04, 0, 0.03, 0.1);
  w.legR(0.02, 0, 0.03, 0.04);
  w.clavL(0.015 + b * 0.4, sh2 * 0.01, 0.02 + sh * 0.015);
  w.clavR(0.015 + b * 0.4, -sh2 * 0.01, 0.02 - sh * 0.015);
  w.footL(0.04, 0, 0.02, 0.03);
  w.footR(-0.05 + sh * 0.02, 0, 0.02, -0.04 + sh2 * 0.02);
}
function poseRun(w, g, runPhase, speed01, turnRate) {
  const sp = clamp3(speed01, 0, 1);
  const amp = 0.45 + 0.55 * sp;
  const s = Math.sin(runPhase), c = Math.cos(runPhase);
  const lean = 0.12 + 0.28 * sp;
  const turn = clamp3(-turnRate * 0.22, -0.38, 0.38);
  const twist = clamp3(turnRate * 0.06, -0.14, 0.14);
  const bounce = 0.5 + 0.5 * Math.cos(2 * runPhase);
  const flutter = Math.sin(g * 11) * 0.012 * sp;
  w.pos(-turn * 0.05, -0.05 * amp * bounce - 0.02, 0);
  w.p(HIPS3, lean * 0.4, s * 0.25 * amp, s * 0.04 + turn * 0.35);
  w.p(SPINE3, lean * 0.5 + flutter, -s * 0.15 * amp + twist, -s * 0.03 + turn * 0.45);
  w.p(CHEST3, lean * 0.5, -s * 0.2 * amp + twist * 0.5, turn * 0.3);
  w.p(NECK3, -lean * 0.4, 0, -turn * 0.25);
  w.p(HEAD3, -lean * 0.8, clamp3(turnRate * 0.1, -0.25, 0.25), -turn * 0.5);
  w.legL(
    -s * 0.85 * amp - 0.12 * amp,
    0,
    0.03,
    0.12 + 1.2 * amp * Math.max(0, c * 0.9 + 0.35)
  );
  w.legR(
    s * 0.85 * amp - 0.12 * amp,
    0,
    0.03,
    0.12 + 1.2 * amp * Math.max(0, -c * 0.9 + 0.35)
  );
  const pushL = Math.max(0, -s);
  const pushR = Math.max(0, s);
  const whip = (0.35 + 0.3 * sp) * amp;
  w.footL(s * 0.45 * amp + 0.05, 0, 0.03, -pushL * whip);
  w.footR(-s * 0.45 * amp + 0.05, 0, 0.03, -pushR * whip);
  const bend = 0.85 + 0.35 * amp;
  w.armL(s * 0.9 * amp, 0, -1.2, 0, -(bend - s * 0.25), -0.05);
  w.armR(-s * 0.9 * amp, 0, -1.2, 0, -(bend + s * 0.25), -0.05);
  w.p(HAND_L3, -0.08 - s * 0.06 * amp, 0, 0);
  w.p(HAND_R3, -0.08 + s * 0.06 * amp, 0, 0);
  w.clavL(0.03 + 0.05 * sp, s * 0.09 * amp, -0.05 * sp + turn * 0.5);
  w.clavR(0.03 + 0.05 * sp, s * 0.09 * amp, -0.05 * sp - turn * 0.5);
}
function poseJumpLand(w, t) {
  const c1 = pulse2(t, 0, 0.16, 0.34);
  const air = pulse2(t, 0.28, 0.46, 0.78);
  const c2 = pulse2(t, 0.82, 0.98, JUMP_LAND_DURATION);
  const cr = Math.max(c1, c2 * 1.1);
  const th = cr;
  const drop = 0.84 * (1 - Math.cos(th));
  w.pos(0, -drop + 0.12 * air, 0.84 * Math.sin(th) * 0.5);
  w.p(HIPS3, 0.1 * cr + 0.12 * air, 0, 0);
  w.p(SPINE3, 0.2 * cr - 0.12 * air, 0, 0);
  w.p(CHEST3, 0.2 * cr - 0.1 * air, 0, 0);
  w.p(NECK3, -0.06 * air, 0, 0);
  w.p(HEAD3, -0.2 * cr + 0.08 * air, 0, 0);
  const swing = c1 * 0.7 - c2 * 0.5;
  const ua = mix3(-1.1, -0.1, air);
  w.armL(mix3(0.04, -0.25, air) + swing, 0, ua + 0.1 * air, 0, -0.2 * (1 - air), -0.08);
  w.armR(mix3(0.04, -0.05, air) + swing, 0, ua - 0.12 * air, 0, -0.2 * (1 - air), -0.08);
  w.legL(-th - 0.6 * air, 0, 0.03 + 0.05 * air, 2 * th + 1.1 * air);
  w.legR(-th + 0.75 * air, 0, 0.03, 2 * th + 0.35 * air);
  w.footL(0.32 * c1 + 0.22 * c2 - 0.5 * air, 0, 0.02, -0.3 * c1 - 0.4 * air + 0.15 * c2);
  w.footR(0.32 * c1 + 0.22 * c2 - 0.62 * air, 0, 0.02, -0.3 * c1 - 0.5 * air + 0.15 * c2);
  w.clavL(0.05 * air - 0.04 * cr, 0, 0.14 * air - 0.05 * cr);
  w.clavR(0.05 * air - 0.04 * cr, 0, 0.14 * air - 0.05 * cr);
}
function poseLandRecover(w, t) {
  const c = smooth3(0.02, 0.13, t) * (1 - smooth3(0.42, 1, t));
  const rise = smooth3(0.42, 1, t);
  const push = Math.sin(rise * Math.PI);
  w.pos(0, -0.38 * c + 0.03 * push, 0.1 * c);
  w.p(HIPS3, 0.35 * c, 0, 0);
  w.p(SPINE3, 0.28 * c, 0, 0);
  w.p(CHEST3, 0.16 * c, 0, 0);
  w.p(NECK3, -0.1 * c, 0, 0);
  w.p(HEAD3, -0.28 * c, 0, 0);
  w.armR(-0.5 * c, 0.15 * c, mix3(-1.1, -1.2, c), 0, -0.12 * c, 0);
  w.p(HAND_R3, -0.3 * c, 0, 0.1 * c);
  w.armL(0.65 * c, -0.25 * c, mix3(-1.1, -0.5, c), 0, -0.5 * c, -0.1);
  w.legL(-1.15 * c, 0.05 * c, 0.06, 1.85 * c + 0.04);
  w.legR(-0.85 * c, 0, 0.06, 1.65 * c + 0.04);
  w.footL(-0.32 * c, 0, 0.02, -0.18 * c);
  w.footR(-0.32 * c, 0, 0.02, -0.18 * c);
  w.clavL(0.06 * c + 0.04 * push, 0.12 * c - 0.16 * push, 0.1 * c + 0.05 * push);
  w.clavR(0.08 * c + 0.04 * push, -0.18 * c - 0.06 * push, -0.12 * c + 0.14 * push);
}
function poseAirDash(w, t, g, dashDir) {
  const d = dashDir >= 0 ? 1 : -1;
  const e = smooth3(0, 0.08, t) * (1 - smooth3(0.25, AIR_DASH_DURATION, t));
  const lean = -d * (0.3 + 0.55 * e);
  const flutter = Math.sin(g * 14) * 0.05 * e;
  w.pos(d * 0.05 * e, 0, 0);
  w.p(HIPS3, 0.35 * e, d * 0.3 * e, lean);
  w.p(SPINE3, 0.12 * e, d * 0.12 * e, lean * 0.5);
  w.p(CHEST3, 0.14 * e, -d * 0.18 * e, lean * 0.3);
  w.p(NECK3, -0.06 * e, 0, 0);
  w.p(HEAD3, -0.2 * e, 0, -lean * 0.7);
  const leadL = d > 0;
  const lx = -0.2, ly = -0.35 * e, lz = mix3(-1.1, -0.35, e);
  const tx = 0.5 * e, ty = 0.5 * e, tz = mix3(-1.1, -1.3, e);
  if (leadL) {
    w.armL(lx + flutter, ly, lz, 0, -0.1, 0);
    w.armR(tx, ty, tz, 0, -1 * e, -0.1);
  } else {
    w.armR(lx + flutter, ly, lz, 0, -0.1, 0);
    w.armL(tx, ty, tz, 0, -1 * e, -0.1);
  }
  if (leadL) {
    w.legL(-0.6 * e, 0, 0.03, 1.1 * e);
    w.legR(0.35 * e, 0, 0.03 - 0.1 * e, 0.2 * e);
  } else {
    w.legR(-0.6 * e, 0, 0.03, 1.1 * e);
    w.legL(0.35 * e, 0, 0.03 - 0.1 * e, 0.2 * e);
  }
  if (leadL) {
    w.clavL(0.06 * e, -0.24 * e, -0.1 * e);
    w.clavR(0.06 * e, 0.14 * e, 0.05 * e);
  } else {
    w.clavR(0.06 * e, -0.24 * e, -0.1 * e);
    w.clavL(0.06 * e, 0.14 * e, 0.05 * e);
  }
  if (leadL) {
    w.footL(0.12 * e, 0, 0.04, 0.06 * e);
    w.footR(-0.6 * e, 0, 0.04, -0.35 * e);
  } else {
    w.footR(0.12 * e, 0, 0.04, 0.06 * e);
    w.footL(-0.6 * e, 0, 0.04, -0.35 * e);
  }
}

// src/game/render/nyxAnimsSkills.ts
var HIPS4 = 0;
var SPINE4 = 1;
var CHEST4 = 2;
var NECK4 = 3;
var HEAD4 = 4;
var HAND_L4 = 7;
var HAND_R4 = 10;
function clamp4(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
function mix4(a, b, k) {
  return a + (b - a) * k;
}
function smooth4(a, b, v) {
  const t = clamp4((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
function pulse3(t, a, b, c) {
  return smooth4(a, b, t) * (1 - smooth4(b, c, t));
}
function poseStasisCast(w, t, g) {
  const a = smooth4(0, 0.25, t);
  const tr = Math.sin(g * 41) * 0.012 * a;
  const tr2 = Math.cos(g * 34 + 1.1) * 8e-3 * a;
  const pu = 0.5 + 0.5 * Math.sin(g * 6);
  w.pos(0, -0.07 * a, 0);
  w.p(HIPS4, 0.08 * a, 0.25 * a, 0);
  w.p(SPINE4, 0.04 * a, 0.06 * a, 0);
  w.p(CHEST4, 0.04 * a, -0.25 * a, tr2 * 0.5);
  w.p(NECK4, -0.02 * a, -0.08 * a, 0);
  w.p(HEAD4, -0.05 * a, -0.1 * a, 0);
  w.armR(
    mix4(0.04, -0.12, a),
    mix4(0, -1.4, a),
    mix4(-1.1, -0.08, a) + pu * 0.04 * a,
    0,
    -0.06 * a,
    tr * 4
  );
  w.p(HAND_R4, -1.05 * a + pu * 0.12 * a, 0, 0);
  w.armL(
    mix4(0.04, 0.15, a),
    -0.5 * a,
    mix4(-1.1, -0.78, a),
    0,
    -1.5 * a + tr * 4,
    -0.1
  );
  w.p(HAND_L4, -0.25 * a, 0, 0);
  w.legL(-0.25 * a, 0, 0.15 * a + 0.03, 0.45 * a + 0.04);
  w.legR(0.15 * a, 0, 0.15 * a + 0.03, 0.2 * a + 0.04);
  w.clavR(0.05 * a, -0.22 * a, 0.04 * a);
  w.clavL(0.04 * a, 0.1 * a, 0.02 * a);
  w.footL(0.1 * a, 0, 0.03, 0.04 * a);
  w.footR(-0.06 * a, 0, 0.03, -0.03 * a);
}
function poseStasisThrow(w, t, g) {
  const ch = smooth4(0, 0.24, t) * (1 - smooth4(0.46, 0.62, t));
  const th = smooth4(0.52, 0.72, t) * (1 - smooth4(1.06, 1.3, t));
  const tr = Math.sin(g * 33) * 0.02 * ch;
  w.pos(0, 0.12 * ch - 0.04 * th, -0.06 * ch + 0.14 * th);
  w.p(HIPS4, -0.12 * ch + 0.3 * th, 0, 0);
  w.p(SPINE4, -0.15 * ch + 0.34 * th, 0, 0);
  w.p(CHEST4, -0.22 * ch + 0.36 * th, 0, 0);
  w.p(NECK4, -0.14 * ch - 0.08 * th, 0, 0);
  w.p(HEAD4, -0.28 * ch - 0.42 * th, 0, 0);
  const ux = mix4(0.04, -0.05, ch) * (1 - th) - 0.18 * th + tr;
  const uy = -0.15 * ch - 1.42 * th;
  const uz = mix4(-1.1, 0.6, ch) * (1 - th) - 0.12 * th;
  const fy = -0.45 * ch - 0.05 * th;
  w.armL(ux, uy, uz + 0.02, 0, fy, 0.08 * ch - 0.06 * th);
  w.armR(ux - tr * 2, uy, uz, 0, fy, 0.08 * ch - 0.06 * th);
  const hx = -0.35 * ch - 0.1 * th;
  w.p(HAND_L4, hx, 0, 0);
  w.p(HAND_R4, hx, 0, 0);
  w.legL(0.12 * ch - 1.2 * th, 0, 0.05, 0.28 * ch + 0.24 * th + 0.04);
  w.legR(0.16 * ch - 1.2 * th, 0, 0.05, 0.34 * ch + 0.24 * th + 0.04);
  const fx = -0.06 * ch - 0.5 * th;
  w.footL(fx, 0, 0.04, -0.32 * th);
  w.footR(fx, 0, 0.04, -0.32 * th);
  const cz = 0.16 * ch + 0.06 * th;
  const cy = -0.08 * ch - 0.06 * th;
  w.clavL(0.06 * ch, cy, cz);
  w.clavR(0.06 * ch, cy, cz);
}
function poseHitStagger(w, t) {
  const i = pulse3(t, 0, 0.08, 0.4);
  const wob = Math.exp(-t * 5) * Math.sin(t * 22);
  const buckle = smooth4(0.2, 0.45, t) * (1 - smooth4(0.45, 0.9, t));
  w.pos(0, -0.1 * buckle, -0.12 * i);
  w.p(HIPS4, -0.35 * i + 0.1 * buckle, 0.1 * wob, 0.2 * i + 0.08 * wob);
  w.p(SPINE4, -0.2 * i, 0, 0);
  w.p(CHEST4, -0.3 * i, -0.2 * wob, 0);
  w.p(NECK4, -0.3 * i, 0, 0);
  w.p(HEAD4, -0.35 * i, 0.2 * wob, 0.15 * i);
  w.armL(0.7 * i, 0.5 * i, -1.1 + 0.8 * i, 0, -0.5 * i, -0.1);
  w.armR(0.5 * i, 0.4 * i, -1.1 + 0.6 * i, 0, -0.4 * i, -0.1);
  w.legL(-0.3 * i - 0.4 * buckle, 0, 0.03, 0.6 * i + 0.8 * buckle);
  w.legR(0.3 * i - 0.2 * buckle, 0, 0.03, 0.2 * i + 0.6 * buckle);
  w.footL(0.2 * i - 0.15 * buckle, 0, 0.03, 0.05 * i);
  w.footR(-0.1 * i - 0.2 * buckle, 0, 0.03, 0.05 * i);
  w.clavL(0.06 * i, 0.18 * i, 0.12 * i + 0.04 * wob);
  w.clavR(0.06 * i, 0.18 * i, 0.12 * i - 0.04 * wob);
}
function poseEdenAbsorb(w, t, g) {
  const a = smooth4(0, 0.5, t);
  const pu = Math.sin(g * 3);
  const sway = Math.sin(g * 1.4);
  w.pos(0, a * (0.12 + pu * 0.03), 0);
  w.p(HIPS4, -0.06 * a, Math.sin(g * 0.8) * 0.08 * a, 0);
  w.p(SPINE4, -0.12 * a, 0, 0);
  w.p(CHEST4, -0.2 * a + pu * 0.025 * a, 0, 0);
  w.p(NECK4, -0.18 * a, 0, 0);
  w.p(HEAD4, -0.34 * a, 0, 0);
  const z = mix4(-1.1, 0.62, a) + pu * 0.08 * a;
  w.armL(mix4(0.04, -0.05, a), -0.15 * a, z, 0, -0.5 * a, 0.1 * a);
  w.armR(mix4(0.04, -0.05, a), -0.15 * a, z - pu * 0.05 * a, 0, -0.5 * a, 0.1 * a);
  w.p(HAND_L4, -0.4 * a + pu * 0.06 * a, 0, 0);
  w.p(HAND_R4, -0.4 * a + pu * 0.06 * a, 0, 0);
  w.legL(0.08 * a + sway * 0.05 * a, 0.03, 0.06 * a + 0.03, 0.25 * a + 0.04);
  w.legR(
    0.15 * a + Math.sin(g * 1.4 + 1) * 0.05 * a,
    0,
    0.06 * a + 0.03,
    0.35 * a + 0.04
  );
  w.footL(
    -0.28 * a + Math.sin(g * 1.1) * 0.05 * a,
    0.02,
    0.04,
    -0.16 * a + Math.sin(g * 0.9 + 0.7) * 0.06 * a
  );
  w.footR(
    -0.33 * a + Math.sin(g * 1.1 + 1.3) * 0.05 * a,
    0,
    0.04,
    -0.18 * a + Math.sin(g * 0.9 + 1.9) * 0.06 * a
  );
  w.clavL(0.04 * a, -0.08 * a, 0.14 * a + pu * 0.03 * a);
  w.clavR(0.04 * a, -0.08 * a, 0.14 * a + pu * 0.03 * a);
}

// src/game/render/nyxAnimator.ts
var NYX_ANIM_STATES = [
  "idle",
  "run",
  "jump_land",
  "land_recover",
  "zero_g_float",
  "gravity_fall",
  "air_dash",
  "gravity_kick",
  "kick_flip",
  "spiral_drill_kick",
  "gravity_slide",
  "counter_parry",
  "wall_shift_flip",
  "dome_bounce",
  "victory_float",
  "stasis_cast",
  "stasis_throw",
  "hit_stagger",
  "eden_absorb"
];
var HIPS5 = 0;
var SPINE5 = 1;
var CHEST5 = 2;
var NECK5 = 3;
var HEAD5 = 4;
var UA_L = 5;
var FA_L = 6;
var HAND_L5 = 7;
var UA_R = 8;
var FA_R = 9;
var HAND_R5 = 10;
var TH_L = 11;
var SH_L = 12;
var TH_R = 13;
var SH_R = 14;
var HAIR_1 = 15;
var HAIR_4 = 18;
var CLAV_L = 19;
var CLAV_R = 20;
var FOOT_L = 21;
var TOE_L = 22;
var FOOT_R = 23;
var TOE_R = 24;
var SLEEVE_L = 25;
var SLEEVE_R = 26;
var HALO = 27;
var BONE_COUNT = 28;
var BONE_NAMES = [
  "hips",
  "spine",
  "chest",
  "neck",
  "head",
  "upperArm_L",
  "forearm_L",
  "hand_L",
  "upperArm_R",
  "forearm_R",
  "hand_R",
  "thigh_L",
  "shin_L",
  "thigh_R",
  "shin_R",
  "hair_1",
  "hair_2",
  "hair_3",
  "hair_4",
  "clavicle_L",
  "clavicle_R",
  "foot_L",
  "toe_L",
  "foot_R",
  "toe_R",
  "sleeve_L",
  "sleeve_R",
  "halo_ring"
];
var INF = Number.POSITIVE_INFINITY;
var DURATION = {
  idle: INF,
  run: INF,
  jump_land: 1.15,
  land_recover: 1.1,
  zero_g_float: INF,
  gravity_fall: INF,
  air_dash: 0.6,
  gravity_kick: 1.15,
  kick_flip: 0.85,
  spiral_drill_kick: SPIRAL_DRILL_KICK_DURATION,
  gravity_slide: INF,
  counter_parry: COUNTER_PARRY_DURATION,
  wall_shift_flip: WALL_SHIFT_FLIP_DURATION,
  dome_bounce: DOME_BOUNCE_DURATION,
  victory_float: INF,
  stasis_cast: INF,
  stasis_throw: 1.3,
  hit_stagger: 0.95,
  eden_absorb: INF
};
var FALLBACK = {
  idle: "idle",
  run: "run",
  jump_land: "idle",
  land_recover: "idle",
  zero_g_float: "zero_g_float",
  gravity_fall: "gravity_fall",
  air_dash: "zero_g_float",
  gravity_kick: "zero_g_float",
  kick_flip: "zero_g_float",
  spiral_drill_kick: "zero_g_float",
  gravity_slide: "gravity_slide",
  counter_parry: "zero_g_float",
  wall_shift_flip: "gravity_fall",
  dome_bounce: "zero_g_float",
  victory_float: "victory_float",
  stasis_cast: "stasis_cast",
  stasis_throw: "idle",
  hit_stagger: "idle",
  eden_absorb: "eden_absorb"
};
var HAIR_GRAVITY_SCALE = {
  idle: 1,
  run: 0.7,
  jump_land: 0.9,
  land_recover: 1,
  zero_g_float: 0.12,
  gravity_fall: 0.9,
  air_dash: 0.35,
  gravity_kick: 0.3,
  kick_flip: 0.25,
  spiral_drill_kick: 0.2,
  gravity_slide: 0.65,
  counter_parry: 0.35,
  wall_shift_flip: 0.2,
  dome_bounce: 0.3,
  victory_float: 0.08,
  stasis_cast: 0.8,
  stasis_throw: 0.8,
  hit_stagger: 0.9,
  eden_absorb: -0.25
};
var HAIR_W = [0.28, 0.34, 0.4, 0.44];
var HAIR_K = [140, 100, 75, 58];
var HAIR_ZETA = [0.32, 0.28, 0.25, 0.22];
var HAIR_C = [
  2 * HAIR_ZETA[0] * Math.sqrt(HAIR_K[0]),
  2 * HAIR_ZETA[1] * Math.sqrt(HAIR_K[1]),
  2 * HAIR_ZETA[2] * Math.sqrt(HAIR_K[2]),
  2 * HAIR_ZETA[3] * Math.sqrt(HAIR_K[3])
];
var SLEEVE_W = 0.55;
var SLEEVE_K = 85;
var SLEEVE_ZETA = 0.26;
var SLEEVE_C = 2 * SLEEVE_ZETA * Math.sqrt(SLEEVE_K);
var DEFAULT_GRAVITY = [0, -1, 0];
function clamp5(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
function mix5(a, b, k) {
  return a + (b - a) * k;
}
function smooth5(a, b, v) {
  const t = clamp5((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
function pulse4(t, a, b, c) {
  return smooth5(a, b, t) * (1 - smooth5(b, c, t));
}
var NyxAnimator = class {
  bones = [];
  baseHips = new Float32Array(3);
  // Poses (3 floats por hueso) y offset de posición de hips
  tgt = new Float32Array(BONE_COUNT * 3);
  cur = new Float32Array(BONE_COUNT * 3);
  tgtPos = new Float32Array(3);
  curPos = new Float32Array(3);
  // Pelo (4 segmentos × 2 ejes)
  hairA = new Float32Array(8);
  hairV = new Float32Array(8);
  // Mangas ([L.roll, L.pitch, R.roll, R.pitch])
  sleeveA = new Float32Array(4);
  sleeveV = new Float32Array(4);
  state = "idle";
  stateTime = 0;
  time = 0;
  runPhase = 0;
  lambda = 8;
  fellBack = false;
  dashDir = 1;
  firstFrame = true;
  // Parámetros del frame actual
  speed = 0.85;
  turn = 0;
  vVel = 0;
  hasVVel = false;
  prevVVel = 0;
  prevSpeed = 0;
  vAcc = 0;
  speedAcc = 0;
  /** Desactiva la simulación del pelo (deja los 4 huesos a 0). */
  hairEnabled = true;
  writer;
  constructor(root) {
    this.writer = {
      p: (i, x, y, z) => this.p(i, x, y, z),
      pos: (x, y, z) => this.pos(x, y, z),
      armL: (ux, uy, uz, fx, fy, fz) => this.armL(ux, uy, uz, fx, fy, fz),
      armR: (ux, uy, uz, fx, fy, fz) => this.armR(ux, uy, uz, fx, fy, fz),
      legL: (tx, ty, tz, sx) => this.legL(tx, ty, tz, sx),
      legR: (tx, ty, tz, sx) => this.legR(tx, ty, tz, sx),
      footL: (fx, fy, fz, tx) => this.footL(fx, fy, fz, tx),
      footR: (fx, fy, fz, tx) => this.footR(fx, fy, fz, tx),
      clavL: (x, y, z) => this.clavL(x, y, z),
      clavR: (x, y, z) => this.clavR(x, y, z)
    };
    const found = [];
    for (let i = 0; i < BONE_COUNT; i++) found.push(null);
    root.traverse((o) => {
      if (o.isBone) {
        const idx = BONE_NAMES.indexOf(o.name);
        if (idx >= 0) found[idx] = o;
      }
    });
    for (let i = 0; i < BONE_COUNT; i++) {
      const b = found[i];
      if (!b && i < 18) throw new Error(`NyxAnimator: falta el hueso "${BONE_NAMES[i]}"`);
      this.bones.push(b);
    }
    const hp = this.bones[HIPS5].position;
    this.baseHips[0] = hp.x;
    this.baseHips[1] = hp.y;
    this.baseHips[2] = hp.z;
    this.neutral();
    this.cur.set(this.tgt);
  }
  getState() {
    return this.state;
  }
  /** Segundos desde el último `setState`. */
  getStateTime() {
    return this.stateTime;
  }
  /** true cuando un estado de un solo disparo ya terminó. */
  isFinished() {
    return this.stateTime >= DURATION[this.state];
  }
  setState(state, options) {
    const sustained = DURATION[state] === INF;
    if (state === this.state && sustained && !options) return;
    this.state = state;
    this.stateTime = 0;
    this.fellBack = false;
    if (options && options.dashDir !== void 0) this.dashDir = options.dashDir;
    const bd = options && options.blendDuration !== void 0 ? options.blendDuration : 0.2;
    this.lambda = 4 / Math.max(bd, 0.01);
  }
  update(dt, params) {
    if (!(dt > 0)) return;
    if (dt > 0.1) dt = 0.1;
    if (params) {
      if (params.speed01 !== void 0) this.speed = clamp5(params.speed01, 0, 1);
      if (params.turnRate !== void 0) this.turn = params.turnRate;
      if (params.verticalVel !== void 0) {
        this.vVel = params.verticalVel;
        this.hasVVel = true;
      }
    }
    if (this.firstFrame) {
      this.prevVVel = this.vVel;
      this.prevSpeed = this.speed;
      this.firstFrame = false;
    }
    const k = Math.min(1, dt * 10);
    this.vAcc += (clamp5((this.vVel - this.prevVVel) / dt, -60, 60) - this.vAcc) * k;
    this.speedAcc += (clamp5((this.speed - this.prevSpeed) / dt, -8, 8) - this.speedAcc) * k;
    this.prevVVel = this.vVel;
    this.prevSpeed = this.speed;
    this.time += dt;
    this.stateTime += dt;
    this.runPhase += dt * (7 + 6 * this.speed);
    let st = this.state;
    if (this.stateTime > DURATION[st]) {
      st = FALLBACK[st];
      if (!this.fellBack) {
        this.fellBack = true;
        this.lambda = Math.min(this.lambda, 6);
      }
    }
    this.neutral();
    this.pose(st, this.stateTime, this.time);
    if (st !== "kick_flip") {
      const ho = HIPS5 * 3;
      while (this.cur[ho] > Math.PI) this.cur[ho] -= 2 * Math.PI;
      while (this.cur[ho] <= -Math.PI) this.cur[ho] += 2 * Math.PI;
    }
    if (st === "spiral_drill_kick" || st === "wall_shift_flip" || st === "victory_float") {
      const hy = HIPS5 * 3 + 1;
      const diff = this.tgt[hy] - this.cur[hy];
      if (diff > Math.PI) this.cur[hy] += 2 * Math.PI;
      else if (diff < -Math.PI) this.cur[hy] -= 2 * Math.PI;
    } else {
      const hy = HIPS5 * 3 + 1;
      while (this.cur[hy] > Math.PI) this.cur[hy] -= 2 * Math.PI;
      while (this.cur[hy] <= -Math.PI) this.cur[hy] += 2 * Math.PI;
    }
    const a = 1 - Math.exp(-this.lambda * dt);
    const cur = this.cur, tgt = this.tgt;
    for (let i = 0; i < BONE_COUNT * 3; i++) cur[i] += (tgt[i] - cur[i]) * a;
    for (let i = 0; i < 3; i++) this.curPos[i] += (this.tgtPos[i] - this.curPos[i]) * a;
    const bones = this.bones;
    for (let i = 0; i < HAIR_1; i++) {
      bones[i]?.rotation.set(cur[i * 3], cur[i * 3 + 1], cur[i * 3 + 2]);
    }
    for (let i = HAIR_4 + 1; i < SLEEVE_L; i++) {
      bones[i]?.rotation.set(cur[i * 3], cur[i * 3 + 1], cur[i * 3 + 2]);
    }
    bones[HIPS5]?.position.set(
      this.baseHips[0] + this.curPos[0],
      this.baseHips[1] + this.curPos[1],
      this.baseHips[2] + this.curPos[2]
    );
    this.updateHair(dt, params, st);
    this.updateSleeves(dt, params, st);
    this.updateHalo(st);
  }
  // ==========================================================================
  // Pelo: resorte-amortiguador subamortiguado por segmento y eje (4 eslabones)
  // ==========================================================================
  updateHair(dt, params, st) {
    const bones = this.bones;
    const A = this.hairA, V = this.hairV;
    if (!this.hairEnabled) {
      for (let i = 0; i < 8; i++) {
        A[i] = 0;
        V[i] = 0;
      }
      for (let s = 0; s < 4; s++) bones[HAIR_1 + s]?.rotation.set(0, 0, 0);
      return;
    }
    const g = params && params.hairGravityLocal ? params.hairGravityLocal : DEFAULT_GRAVITY;
    const gs = HAIR_GRAVITY_SCALE[st];
    const gx = g[0] * gs, gy = g[1] * gs;
    const t = this.time;
    const sp = this.speed * (st === "run" ? 1 : 0.35);
    const lift = clamp5(-this.vAcc * 0.02, -0.5, 0.5);
    const calm = gs < 0.3 ? 2.2 : 1;
    const sub = 2, h = dt / sub;
    for (let s = 0; s < 4; s++) {
      const w = HAIR_W[s];
      const pitchT = w * (gy + 0.9 * sp + 0.3 * clamp5(this.speedAcc * 0.1, -1, 1) + lift) + Math.sin(t * 2.1 + s * 0.9) * 0.06 * calm;
      const yawT = w * (-gx + clamp5(this.turn * 0.35, -1.2, 1.2)) + Math.cos(t * 1.7 + s * 1.1) * 0.05 * calm;
      const k = HAIR_K[s], c = HAIR_C[s];
      const ip = s * 2, iy = ip + 1;
      for (let n = 0; n < sub; n++) {
        V[ip] += (-k * (A[ip] - pitchT) - c * V[ip]) * h;
        A[ip] += V[ip] * h;
        V[iy] += (-k * (A[iy] - yawT) - c * V[iy]) * h;
        A[iy] += V[iy] * h;
      }
      bones[HAIR_1 + s]?.rotation.set(A[ip], A[iy], A[iy] * 0.3);
    }
  }
  // ==========================================================================
  // Mangas: resorte-amortiguador subamortiguado (gravedad + inercia + giro)
  // ==========================================================================
  updateSleeves(dt, params, st) {
    const bL = this.bones[SLEEVE_L], bR = this.bones[SLEEVE_R];
    if (!bL && !bR) return;
    const A = this.sleeveA, V = this.sleeveV;
    const g = params && params.hairGravityLocal ? params.hairGravityLocal : DEFAULT_GRAVITY;
    const gs = HAIR_GRAVITY_SCALE[st];
    const gy = g[1] * gs, gz = g[2] * gs;
    const t = this.time;
    const calm = gs < 0.3 ? 2 : 1;
    const lag = clamp5(this.speedAcc * 0.08, -0.6, 0.6) + clamp5(this.vAcc * 0.015, -0.5, 0.5);
    const turn = clamp5(this.turn * 0.25, -0.8, 0.8);
    const sub = 2, h = dt / sub;
    for (let s = 0; s < 2; s++) {
      const side = s === 0 ? 1 : -1;
      const rollT = SLEEVE_W * (gy * side * 1 + lag * 0.5) + Math.sin(t * 2.6 + s * 1.7) * 0.05 * calm;
      const pitchT = SLEEVE_W * (gz * 0.6 + 0.35 * this.speed * (st === "run" ? 1 : 0.2) + turn * side) + Math.cos(t * 2.1 + s * 1.3) * 0.045 * calm;
      const ir = s * 2, ip = ir + 1;
      for (let n = 0; n < sub; n++) {
        V[ir] += (-SLEEVE_K * (A[ir] - rollT) - SLEEVE_C * V[ir]) * h;
        A[ir] += V[ir] * h;
        V[ip] += (-SLEEVE_K * (A[ip] - pitchT) - SLEEVE_C * V[ip]) * h;
        A[ip] += V[ip] * h;
      }
      const b = s === 0 ? bL : bR;
      if (b) b.rotation.set(0, A[ip], A[ir]);
    }
  }
  // ==========================================================================
  // Aro orbital: gira suavemente sobre su eje (normal del aro = +Z local)
  // ==========================================================================
  updateHalo(st) {
    const b = this.bones[HALO];
    if (!b) return;
    const zero = HAIR_GRAVITY_SCALE[st] < 0.3;
    const t = this.time;
    b.rotation.set(
      Math.sin(t * 0.7) * (zero ? 0.12 : 0.05),
      Math.cos(t * 0.53) * (zero ? 0.1 : 0.04),
      t * (zero ? 0.9 : 0.45)
    );
  }
  // ==========================================================================
  // Escritura de poses objetivo
  // ==========================================================================
  p(i, x, y, z) {
    const o = i * 3;
    this.tgt[o] = x;
    this.tgt[o + 1] = y;
    this.tgt[o + 2] = z;
  }
  pos(x, y, z) {
    this.tgtPos[0] = x;
    this.tgtPos[1] = y;
    this.tgtPos[2] = z;
  }
  /** Brazo izquierdo (u = upperArm, f = forearm). */
  armL(ux, uy, uz, fx, fy, fz) {
    this.p(UA_L, ux, uy, uz);
    this.p(FA_L, fx, fy, fz);
  }
  /** Brazo derecho: se pasan valores en convención L; se espeja (y,z). */
  armR(ux, uy, uz, fx, fy, fz) {
    this.p(UA_R, ux, -uy, -uz);
    this.p(FA_R, fx, -fy, -fz);
  }
  legL(tx, ty, tz, sx) {
    this.p(TH_L, tx, ty, tz);
    this.p(SH_L, sx < 0 ? 0 : sx, 0, 0);
  }
  legR(tx, ty, tz, sx) {
    this.p(TH_R, tx, -ty, -tz);
    this.p(SH_R, sx < 0 ? 0 : sx, 0, 0);
  }
  /** Tobillo + puntera izquierdos. fx<0 extiende la bota (plantar). */
  footL(fx, fy, fz, tx) {
    this.p(FOOT_L, fx, fy, fz);
    this.p(TOE_L, tx ?? 0, 0, 0);
  }
  /** Tobillo + puntera derechos: valores en convención L; se espeja (y, z). */
  footR(fx, fy, fz, tx) {
    this.p(FOOT_R, fx, -fy, -fz);
    this.p(TOE_R, tx ?? 0, 0, 0);
  }
  /** Clavícula izquierda: z>0 encoge el hombro, y<0 lo proyecta al frente. */
  clavL(x, y, z) {
    this.p(CLAV_L, x, y, z);
  }
  /** Clavícula derecha: valores en convención L; el helper espeja (y, z). */
  clavR(x, y, z) {
    this.p(CLAV_R, x, -y, -z);
  }
  neutral() {
    this.p(HIPS5, 0, 0, 0);
    this.p(SPINE5, 0, 0, 0);
    this.p(CHEST5, 0, 0, 0);
    this.p(NECK5, 0, 0, 0);
    this.p(HEAD5, 0, 0, 0);
    this.armL(0.04, 0, -1.1, 0, -0.12, -0.08);
    this.armR(0.04, 0, -1.1, 0, -0.12, -0.08);
    this.p(HAND_L5, 0, 0, 0);
    this.p(HAND_R5, 0, 0, 0);
    this.legL(0, 0, 0.03, 0.04);
    this.legR(0, 0, 0.03, 0.04);
    this.clavL(0, 0, 0);
    this.clavR(0, 0, 0);
    this.footL(0, 0, 0, 0);
    this.footR(0, 0, 0, 0);
    this.pos(0, 0, 0);
  }
  pose(st, t, g) {
    switch (st) {
      case "idle":
        poseIdle(this.writer, g);
        break;
      case "run":
        poseRun(this.writer, g, this.runPhase, this.speed, this.turn);
        break;
      case "jump_land":
        poseJumpLand(this.writer, t);
        break;
      case "land_recover":
        poseLandRecover(this.writer, t);
        break;
      case "zero_g_float":
        poseZeroGFloat(this.writer, g);
        break;
      case "gravity_fall":
        poseGravityFall(this.writer, g, this.vVel, this.hasVVel);
        break;
      case "air_dash":
        poseAirDash(this.writer, t, g, this.dashDir);
        break;
      case "gravity_kick":
        poseGravityKick(this.writer, t, g);
        break;
      case "kick_flip": {
        const flip = poseKickFlip(this.writer, t, g);
        const o = HIPS5 * 3;
        while (this.cur[o] - flip > Math.PI) this.cur[o] -= 2 * Math.PI;
        while (this.cur[o] - flip < -Math.PI) this.cur[o] += 2 * Math.PI;
        break;
      }
      case "spiral_drill_kick":
        poseSpiralDrillKick(this.writer, t, g);
        break;
      case "gravity_slide":
        poseGravitySlide(this.writer, g, this.speed, this.turn);
        break;
      case "counter_parry":
        poseCounterParry(this.writer, t);
        break;
      case "wall_shift_flip":
        poseWallShiftFlip(this.writer, t);
        break;
      case "dome_bounce":
        poseDomeBounce(this.writer, t);
        break;
      case "victory_float":
        poseVictoryFloat(this.writer, g);
        break;
      case "stasis_cast":
        poseStasisCast(this.writer, t, g);
        break;
      case "stasis_throw":
        poseStasisThrow(this.writer, t, g);
        break;
      case "hit_stagger":
        poseHitStagger(this.writer, t);
        break;
      case "eden_absorb":
        poseEdenAbsorb(this.writer, t, g);
        break;
    }
  }
  // --- idle: respiración, descarga de peso, mirada lenta ---------------------
  poseIdle(g) {
    const b = Math.sin(g * 1.7) * 0.02;
    const sh = Math.sin(g * 0.6);
    this.pos(sh * 0.015, -0.012 + b * 0.5, 0);
    this.p(HIPS5, 0, sh * 0.04, sh * 0.03);
    this.p(SPINE5, 0.02, -sh * 0.03, -sh * 0.02);
    this.p(CHEST5, 0.03 + b, 0, 0);
    this.p(HEAD5, -0.03 - b * 0.5, Math.sin(g * 0.4) * 0.08, 0);
    this.armL(0.05 + Math.sin(g * 1.2) * 0.03, 0, -1.1 + b * 2, 0, -0.2, -0.08);
    this.armR(0.05 + Math.sin(g * 1.2 + 0.8) * 0.03, 0, -1.1 - b * 2, 0, -0.2, -0.08);
    this.legL(-0.04, 0, 0.03, 0.1);
    this.legR(0.02, 0, 0.03, 0.04);
    this.clavL(0.015 + b * 0.4, 0, 0.02 + sh * 0.015);
    this.clavR(0.015 + b * 0.4, 0, 0.02 - sh * 0.015);
    this.footL(0.04, 0, 0.02, 0);
    this.footR(-0.05 + sh * 0.02, 0, 0.02, 0);
  }
  // --- run: ciclo con fase acumulada, inclinación según speed01 --------------
  poseRun() {
    const sp = this.speed;
    const amp = 0.45 + 0.55 * sp;
    const ph = this.runPhase;
    const s = Math.sin(ph), c = Math.cos(ph);
    const lean = 0.12 + 0.28 * sp;
    this.pos(0, -0.05 * amp * (0.5 + 0.5 * Math.cos(2 * ph)) - 0.02, 0);
    this.p(HIPS5, lean * 0.4, s * 0.25 * amp, s * 0.04);
    this.p(SPINE5, lean * 0.5, -s * 0.15 * amp, -s * 0.03);
    this.p(CHEST5, lean * 0.5, -s * 0.2 * amp, 0);
    this.p(NECK5, -lean * 0.4, 0, 0);
    this.p(HEAD5, -lean * 0.8, s * 0.1 * amp, 0);
    this.legL(
      -s * 0.85 * amp - 0.12 * amp,
      0,
      0.03,
      0.12 + 1.2 * amp * Math.max(0, c * 0.9 + 0.35)
    );
    this.legR(
      s * 0.85 * amp - 0.12 * amp,
      0,
      0.03,
      0.12 + 1.2 * amp * Math.max(0, -c * 0.9 + 0.35)
    );
    this.footL(s * 0.45 * amp + 0.05, 0, 0.03, -Math.max(0, -s) * 0.5 * amp);
    this.footR(-s * 0.45 * amp + 0.05, 0, 0.03, -Math.max(0, s) * 0.5 * amp);
    const bend = 0.85 + 0.35 * amp;
    this.armL(s * 0.9 * amp, 0, -1.2, 0, -(bend - s * 0.25), -0.05);
    this.armR(-s * 0.9 * amp, 0, -1.2, 0, -(bend + s * 0.25), -0.05);
    this.clavL(0.03 + 0.05 * sp, s * 0.09 * amp, -0.05 * sp);
    this.clavR(0.03 + 0.05 * sp, s * 0.09 * amp, -0.05 * sp);
  }
  // --- jump_land: anticipación → impulso → tuck → aterrizaje → recuperación --
  poseJumpLand(t) {
    const c1 = pulse4(t, 0, 0.2, 0.34);
    const air = pulse4(t, 0.3, 0.46, 0.72);
    const c2 = pulse4(t, 0.62, 0.8, 1.1);
    const cr = Math.max(c1, c2 * 1.1);
    const th = 1 * cr;
    const drop = 0.84 * (1 - Math.cos(th));
    this.pos(0, -drop + 0.1 * air, 0.84 * Math.sin(th) * 0.5);
    this.p(HIPS5, 0.1 * cr, 0, 0);
    this.p(SPINE5, 0.2 * cr - 0.1 * air, 0, 0);
    this.p(CHEST5, 0.2 * cr - 0.1 * air, 0, 0);
    this.p(HEAD5, -0.2 * cr, 0, 0);
    const swing = c1 * 0.7 - c2 * 0.5;
    const ua = mix5(-1.1, -0.1, air);
    this.armL(mix5(0.04, -0.2, air) + swing, 0, ua, 0, -0.2 * (1 - air), -0.08);
    this.armR(mix5(0.04, -0.2, air) + swing, 0, ua, 0, -0.2 * (1 - air), -0.08);
    this.legL(-th - 0.6 * air, 0, 0.03 + 0.05 * air, 2 * th + 1.1 * air);
    this.legR(-th - 0.25 * air, 0, 0.03, 2 * th + 0.5 * air);
    this.footL(0.32 * c1 + 0.22 * c2 - 0.35 * air, 0, 0.02, -0.3 * c1 - 0.15 * air);
    this.footR(0.32 * c1 + 0.22 * c2 - 0.35 * air, 0, 0.02, -0.3 * c1 - 0.15 * air);
    this.clavL(0.05 * air - 0.04 * c2, 0, 0.14 * air - 0.06 * c1);
    this.clavR(0.05 * air - 0.04 * c2, 0, 0.14 * air - 0.06 * c1);
  }
  // --- zero_g_float: flotación asimétrica ------------------------------------
  poseFloat(g) {
    const bob = Math.sin(g * 1.3);
    const sw = Math.sin(g * 0.9);
    this.pos(0, bob * 0.05, 0);
    this.p(HIPS5, -0.06 + bob * 0.03, 0.12 + sw * 0.05, sw * 0.05);
    this.p(SPINE5, -0.08, -0.05, -sw * 0.03);
    this.p(CHEST5, -0.06 + Math.sin(g * 1.7) * 0.02, -0.04, 0);
    this.p(NECK5, -0.04, 0, 0);
    this.p(HEAD5, -0.06, -0.08 - sw * 0.04, 0.03);
    this.armL(0.15 + Math.sin(g * 1.1) * 0.05, -0.15, -0.8 + Math.sin(g * 1.8) * 0.06, 0.1, -0.35, -0.15);
    this.armR(-0.05 + Math.sin(g * 1.4 + 1) * 0.05, -0.05, -0.62 - Math.sin(g * 1.6 + 0.6) * 0.06, 0.08, -0.25, -0.1);
    this.legL(-0.75 + Math.sin(g * 1.3) * 0.05, 0.05, 0.1, 1.1);
    this.legR(0.1, 0, 0.1, 0.12 + Math.sin(g * 1.3 + 1) * 0.04);
    this.footL(-0.38 + Math.sin(g * 1.3) * 0.05, 0.04, 0.05, -0.22);
    this.footR(-0.3 + Math.sin(g * 1.3 + 1) * 0.05, 0, 0.05, -0.16);
    this.clavL(0.04, -0.05, 0.06 + Math.sin(g * 1.1) * 0.02);
    this.clavR(0.04, -0.05, 0.06 + Math.sin(g * 1.4 + 1) * 0.02);
  }
  // --- gravity_fall: caída orgánica, espalda arqueada, extremidades al viento -
  poseFall(g) {
    const f = this.hasVVel ? clamp5(-this.vVel / 18, 0, 1) : 0.8;
    const w1 = Math.sin(g * 7.3), w2 = Math.sin(g * 5.1 + 1.2), w3 = Math.sin(g * 9.2 + 0.4);
    this.pos(0, 0, 0);
    this.p(HIPS5, 0.55 + 0.35 * f + w2 * 0.03, Math.sin(g * 1.1) * 0.1, w1 * 0.04);
    this.p(SPINE5, -0.3 - 0.05 * f, 0.03 * w2, 0);
    this.p(CHEST5, -0.25 + w3 * 0.02, 0, 0);
    this.p(NECK5, -0.35, 0, 0);
    this.p(HEAD5, -0.15 + w2 * 0.04, w1 * 0.04, 0);
    const wv = 0.1 + 0.15 * f;
    this.armL(0.35 + 0.2 * f + w1 * wv, 0.2, -0.95 - w2 * 0.12, 0, -0.35 - w3 * 0.15, -0.1);
    this.armR(0.35 + 0.2 * f + w2 * wv, 0.2, -1.05 - w1 * 0.12, 0, -0.3 - w1 * 0.15, -0.1);
    this.legL(0.25 + w1 * 0.1, 0, 0.12, 0.5 + 0.3 * (0.5 + 0.5 * w2));
    this.legR(0.18 + w3 * 0.1, 0, 0.12, 0.35 + 0.3 * (0.5 + 0.5 * w1));
    this.footL(0.28 + 0.2 * f + w1 * 0.12, 0, 0.06, 0.12);
    this.footR(0.2 + 0.15 * f + w3 * 0.12, 0, 0.06, 0.08);
    this.clavL(0.04 * f, 0.14 * f, 0.05 * f);
    this.clavR(0.04 * f, 0.14 * f, 0.05 * f);
  }
  // --- air_dash: sprint lateral con inclinación hacia dashDir -----------------
  // dashDir = +1 → hacia +X del modelo (su costado izquierdo); -1 → hacia -X.
  poseDash(t, g) {
    const d = this.dashDir;
    const e = smooth5(0, 0.08, t) * (1 - smooth5(0.25, 0.6, t));
    const lean = -d * (0.3 + 0.55 * e);
    this.pos(d * 0.05 * e, 0, 0);
    this.p(HIPS5, 0.35 * e, d * 0.3 * e, lean);
    this.p(SPINE5, 0.12 * e, d * 0.12 * e, lean * 0.5);
    this.p(CHEST5, 0.14 * e, -d * 0.18 * e, lean * 0.3);
    this.p(HEAD5, -0.2 * e, 0, -lean * 0.7);
    const flutter = Math.sin(g * 14) * 0.05 * e;
    const leadL = d > 0;
    const lx = -0.2, ly = -0.35 * e, lz = mix5(-1.1, -0.35, e);
    const tx = 0.5 * e, ty = 0.5 * e, tz = mix5(-1.1, -1.3, e);
    if (leadL) {
      this.armL(lx + flutter, ly, lz, 0, -0.1, 0);
      this.armR(tx, ty, tz, 0, -1 * e, -0.1);
    } else {
      this.armR(lx + flutter, ly, lz, 0, -0.1, 0);
      this.armL(tx, ty, tz, 0, -1 * e, -0.1);
    }
    if (leadL) {
      this.legL(-0.6 * e, 0, 0.03, 1.1 * e);
      this.legR(0.35 * e, 0, 0.03 - 0.1 * e, 0.2 * e);
    } else {
      this.legR(-0.6 * e, 0, 0.03, 1.1 * e);
      this.legL(0.35 * e, 0, 0.03 - 0.1 * e, 0.2 * e);
    }
    if (leadL) {
      this.clavL(0.06 * e, -0.24 * e, -0.1 * e);
      this.clavR(0.06 * e, 0.14 * e, 0.05 * e);
    } else {
      this.clavR(0.06 * e, -0.24 * e, -0.1 * e);
      this.clavL(0.06 * e, 0.14 * e, 0.05 * e);
    }
    if (leadL) {
      this.footL(-0.38 * e, 0, 0.04, -0.28 * e);
      this.footR(-0.55 * e, 0, 0.04, -0.42 * e);
    } else {
      this.footR(-0.38 * e, 0, 0.04, -0.28 * e);
      this.footL(-0.55 * e, 0, 0.04, -0.42 * e);
    }
  }
  // --- gravity_kick: misil gravitatorio — cuerpo entero en la trayectoria ---
  // Fase 1 (0..0.15): se encoge en el aire preparándose. Fase 2 (0.15..0.95,
  // sostenida en vuelo): TODO el cuerpo inclinado al ángulo de vuelo (~66°),
  // pierna derecha extendida en la línea de trayectoria, izquierda recogida
  // atrás, torso de contrapeso y brazos cortando el aire hacia atrás.
  poseKick(t, g) {
    const coil = smooth5(0, 0.12, t) * (1 - smooth5(0.13, 0.24, t));
    const fly = smooth5(0.15, 0.32, t) * (1 - smooth5(0.95, 1.15, t));
    const vib = Math.sin(g * 27) * 0.05 * fly;
    const vib2 = Math.cos(g * 21) * 0.03 * fly;
    this.pos(0, 0.08 * fly - 0.02 * coil, 0.18 * fly - 0.05 * coil);
    this.p(HIPS5, -0.18 * coil + 1.15 * fly, vib2, 0);
    this.p(SPINE5, 0.1 * coil + 0.06 * fly, 0, 0);
    this.p(CHEST5, 0.12 * coil, -0.55 * fly, 0);
    this.p(NECK5, -0.08 * fly, 0, 0);
    this.p(HEAD5, 0.25 * coil - 0.65 * fly, 0.12 * fly, 0);
    this.armL(
      0.3 * coil + (1.05 + vib) * fly,
      0.3 * fly,
      mix5(-1.1, -0.45, fly),
      0,
      -0.35 * coil - 0.12 * fly,
      -0.05
    );
    this.armR(
      0.3 * coil + (1 - vib) * fly,
      0.25 * fly,
      mix5(-1.1, -0.5, fly),
      0,
      -0.3 * coil - 0.1 * fly,
      -0.05
    );
    this.legR(-1.3 * coil - 0.65 * fly, 0, 0.03, 1.6 * coil + 0.04);
    this.legL(-1.3 * coil + 0.45 * fly, 0, 0.1, 1.6 * coil + 1.45 * fly);
    this.footR(-(0.28 + 0.55 * fly), 0.03 * fly, 0.02, -(0.18 + 0.5 * fly));
    this.footL(0.5 * fly, 0, 0.05, 0.22 * fly);
    this.clavL(0.06 * fly, 0.16 * fly, -0.04 * fly);
    this.clavR(0.06 * fly, 0.16 * fly, -0.04 * fly);
  }
  // --- kick_flip: voltereta mortal completa tras la patada -------------------
  // Rebota hacia atrás-arriba con las rodillas al pecho y gira 360° hacia
  // atrás sobre hips.x. El ángulo de voltereta es continuo (0 → -2π) pero se
  // escribe normalizado a (-π, π] y la rotación actual se envuelve al
  // equivalente más cercano al objetivo: el lerp persigue por el camino corto
  // y al terminar (-2π ≡ 0) abre con elegancia a zero_g_float sin vuelta atrás.
  poseKickFlip(t, g) {
    const p = clamp5(t / 0.85, 0, 1);
    const arc = Math.sin(p * Math.PI);
    const tuck = smooth5(0.02, 0.16, t) * (1 - smooth5(0.6, 0.85, t));
    const wob = Math.sin(g * 5.2) * 0.04 * arc;
    let flip = -2 * Math.PI * smooth5(0.02, 0.78, t);
    while (flip <= -Math.PI) flip += 2 * Math.PI;
    const o = HIPS5 * 3;
    while (this.cur[o] - flip > Math.PI) this.cur[o] -= 2 * Math.PI;
    while (this.cur[o] - flip < -Math.PI) this.cur[o] += 2 * Math.PI;
    this.pos(0, 0.22 * arc, -0.14 * arc);
    this.p(HIPS5, flip, wob, 0);
    this.p(SPINE5, 0.2 * tuck, 0, 0);
    this.p(CHEST5, 0.16 * tuck, -0.15 * tuck, 0);
    this.p(HEAD5, 0.34 * tuck, 0, 0);
    this.armL(0.12 + 0.22 * tuck, -0.3 * tuck, -0.82, 0.08, -0.45 * tuck, -0.1);
    this.armR(0.12 + 0.22 * tuck, -0.25 * tuck, -0.82, 0.08, -0.4 * tuck, -0.1);
    this.legL(-1.15, 0.05, 0.08, 1.55);
    this.legR(-1.15, 0, 0.08, 1.55);
    this.footL(-0.55 * tuck, 0, 0.04, -0.4 * tuck);
    this.footR(-0.55 * tuck, 0, 0.04, -0.4 * tuck);
    this.clavL(0.05 * tuck, -0.1 * tuck, 0.08 * tuck);
    this.clavR(0.05 * tuck, -0.1 * tuck, 0.08 * tuck);
  }
  // --- land_recover: impacto amortiguado → incorporarse hasta idle ----------
  // Fase 1 (0..0.38): cae y amortigua en cuclillas profundas, brazo derecho
  // casi tocando el suelo y brazo izquierdo atrás en equilibrio. Fase 2
  // (0.38..1.10): empuja con las piernas subiendo el torso hasta quedar erguida.
  poseLandRecover(t) {
    const c = smooth5(0.02, 0.14, t) * (1 - smooth5(0.38, 0.95, t));
    const rise = smooth5(0.38, 0.95, t);
    this.pos(0, -0.36 * c + 0.025 * Math.sin(rise * Math.PI), 0.1 * c);
    this.p(HIPS5, 0.35 * c, 0, 0);
    this.p(SPINE5, 0.28 * c, 0, 0);
    this.p(CHEST5, 0.16 * c, 0, 0);
    this.p(HEAD5, -0.28 * c, 0, 0);
    this.armR(-0.45 * c, 0.15 * c, mix5(-1.1, -1.18, c), 0, -0.1 * c, 0);
    this.armL(0.65 * c, -0.25 * c, mix5(-1.1, -0.55, c), 0, -0.5 * c, -0.1);
    this.legL(-1.15 * c, 0.05 * c, 0.06, 1.85 * c + 0.04);
    this.legR(-0.85 * c, 0, 0.06, 1.65 * c + 0.04);
    this.footL(0.5 * c, 0, 0.02, 0.1 * c);
    this.footR(0.5 * c, 0, 0.02, 0.1 * c);
    this.clavL(0.06 * c, 0.12 * c, 0.1 * c);
    this.clavR(0.08 * c, -0.18 * c, -0.12 * c);
  }
  // --- stasis_cast: mano derecha proyecta el campo, izquierda recogida -------
  poseCast(t, g) {
    const a = smooth5(0, 0.25, t);
    const tr = Math.sin(g * 41) * 0.012 * a;
    const pu = 0.5 + 0.5 * Math.sin(g * 6);
    this.pos(0, -0.07 * a, 0);
    this.p(HIPS5, 0.08 * a, 0.25 * a, 0);
    this.p(SPINE5, 0.04 * a, 0, 0);
    this.p(CHEST5, 0.04 * a, -0.25 * a, 0);
    this.p(HEAD5, -0.05 * a, -0.1 * a, 0);
    this.armR(mix5(0.04, -0.1, a), mix5(0, -1.4, a), mix5(-1.1, -0.1, a) + pu * 0.04 * a, 0, 0, tr * 4);
    this.p(HAND_R5, -1 * a + pu * 0.1 * a, 0, 0);
    this.armL(mix5(0.04, 0.15, a), -0.5 * a, mix5(-1.1, -0.8, a), 0, -1.5 * a + tr * 4, -0.1);
    this.legL(-0.25 * a, 0, 0.15 * a + 0.03, 0.45 * a + 0.04);
    this.legR(0.15 * a, 0, 0.15 * a + 0.03, 0.2 * a + 0.04);
    this.clavR(0.05 * a, -0.2 * a, 0.04 * a);
    this.clavL(0.04 * a, 0.1 * a, 0.02 * a);
    this.footL(0.12 * a, 0, 0.03, 0);
    this.footR(-0.08 * a, 0, 0.03, 0);
  }
  // --- stasis_throw: estilo Genkidama / Spirit Bomb (arriba -> lanzamiento en "C") ---
  // Fase 1 (0..0.38): flota mirando arriba con AMBOS brazos levantados sobre la
  // cabeza (como eden_absorb) concentrando energía. Fase 2 (0.38..0.92): se dobla
  // entera echando AMBOS brazos y AMBAS piernas hacia delante de forma exagerada
  // formando una "C" vista de perfil al proyectar la descarga gravitatoria.
  poseThrow(t, g) {
    const ch = smooth5(0, 0.24, t) * (1 - smooth5(0.46, 0.62, t));
    const th = smooth5(0.52, 0.72, t) * (1 - smooth5(1.06, 1.3, t));
    const tr = Math.sin(g * 33) * 0.02 * ch;
    this.pos(0, 0.12 * ch - 0.04 * th, -0.06 * ch + 0.14 * th);
    this.p(HIPS5, -0.12 * ch + 0.28 * th, 0, 0);
    this.p(SPINE5, -0.15 * ch + 0.32 * th, 0, 0);
    this.p(CHEST5, -0.22 * ch + 0.34 * th, 0, 0);
    this.p(NECK5, -0.14 * ch - 0.08 * th, 0, 0);
    this.p(HEAD5, -0.28 * ch - 0.42 * th, 0, 0);
    const ux = mix5(0.04, -0.05, ch) * (1 - th) - 0.18 * th + tr;
    const uy = -0.15 * ch - 1.42 * th;
    const uz = mix5(-1.1, 0.55, ch) * (1 - th) - 0.12 * th;
    const fy = -0.45 * ch - 0.05 * th;
    this.armL(ux, uy, uz, 0, fy, 0.08 * ch - 0.06 * th);
    this.armR(ux - tr * 2, uy, uz, 0, fy, 0.08 * ch - 0.06 * th);
    this.p(HAND_L5, -0.35 * ch - 0.35 * th, 0, 0);
    this.p(HAND_R5, -0.35 * ch - 0.35 * th, 0, 0);
    this.legL(0.12 * ch - 1.18 * th, 0, 0.05, 0.28 * ch + 0.22 * th + 0.04);
    this.legR(0.16 * ch - 1.18 * th, 0, 0.05, 0.34 * ch + 0.22 * th + 0.04);
    this.footL(-0.42 * th, 0, 0.04, -0.28 * th);
    this.footR(-0.42 * th, 0, 0.04, -0.28 * th);
    this.clavL(0.05 * ch, -0.1 * ch, 0.1 * ch + 0.06 * th);
    this.clavR(0.05 * ch, -0.1 * ch, 0.1 * ch + 0.06 * th);
  }
  // --- hit_stagger: impacto hacia atrás, rodilla vencida y recuperación ------
  poseHit(t) {
    const i = pulse4(t, 0, 0.08, 0.4);
    const wob = Math.exp(-t * 5) * Math.sin(t * 22);
    const buckle = smooth5(0.2, 0.45, t) * (1 - smooth5(0.45, 0.9, t));
    this.pos(0, -0.1 * buckle, -0.12 * i);
    this.p(HIPS5, -0.35 * i + 0.1 * buckle, 0.1 * wob, 0.2 * i + 0.08 * wob);
    this.p(SPINE5, -0.2 * i, 0, 0);
    this.p(CHEST5, -0.3 * i, -0.2 * wob, 0);
    this.p(NECK5, -0.3 * i, 0, 0);
    this.p(HEAD5, -0.35 * i, 0.2 * wob, 0.15 * i);
    this.armL(0.7 * i, 0.5 * i, -1.1 + 0.8 * i, 0, -0.5 * i, -0.1);
    this.armR(0.5 * i, 0.4 * i, -1.1 + 0.6 * i, 0, -0.4 * i, -0.1);
    this.legL(-0.3 * i - 0.4 * buckle, 0, 0.03, 0.6 * i + 0.8 * buckle);
    this.legR(0.3 * i - 0.2 * buckle, 0, 0.03, 0.2 * i + 0.6 * buckle);
    this.footL(0.2 * i - 0.15 * buckle, 0, 0.03, 0.05 * i);
    this.footR(-0.1 * i - 0.2 * buckle, 0, 0.03, 0.05 * i);
    this.clavL(0.05 * i, 0.15 * i, 0.05 * i);
    this.clavR(0.05 * i, 0.15 * i, 0.05 * i);
  }
  // --- eden_absorb: flotando, brazos arriba, cabeza atrás, pulso de energía --
  poseAbsorb(t, g) {
    const a = smooth5(0, 0.5, t);
    const pu = Math.sin(g * 3);
    this.pos(0, a * (0.12 + pu * 0.03), 0);
    this.p(HIPS5, -0.06 * a, Math.sin(g * 0.8) * 0.08 * a, 0);
    this.p(SPINE5, -0.12 * a, 0, 0);
    this.p(CHEST5, -0.2 * a + pu * 0.02 * a, 0, 0);
    this.p(NECK5, -0.15 * a, 0, 0);
    this.p(HEAD5, -0.3 * a, 0, 0);
    const z = mix5(-1.1, 0.55, a) + pu * 0.08 * a;
    this.armL(mix5(0.04, -0.05, a), -0.15 * a, z, 0, -0.5 * a, 0.1 * a);
    this.armR(mix5(0.04, -0.05, a), -0.15 * a, z - pu * 0.05 * a, 0, -0.5 * a, 0.1 * a);
    this.p(HAND_L5, -0.4 * a, 0, 0);
    this.p(HAND_R5, -0.4 * a, 0, 0);
    this.legL(0.08 * a + Math.sin(g * 1.4) * 0.05 * a, 0.03, 0.06 * a + 0.03, 0.25 * a + 0.04);
    this.legR(0.15 * a + Math.sin(g * 1.4 + 1) * 0.05 * a, 0, 0.06 * a + 0.03, 0.35 * a + 0.04);
    this.footL(-0.3 * a, 0.02, 0.04, -0.2 * a);
    this.footR(-0.35 * a, 0, 0.04, -0.22 * a);
    this.clavL(0.03 * a, -0.08 * a, 0.1 * a);
    this.clavR(0.03 * a, -0.08 * a, 0.1 * a);
  }
};
export {
  NYX_ANIM_STATES,
  NyxAnimator
};
