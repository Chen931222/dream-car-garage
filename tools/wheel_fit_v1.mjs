// 換輪圈造型前置量測（2026-10-11）：四個輪圈的中心、半徑、寬、外緣平面；卡鉗／碟盤離外緣多深；輪圈正面還有哪些小零件（換輪圈時要一起藏）
// 座標是 glTF 場景座標（世界）；長度另外換成公尺（k＝每公尺幾個模型單位）。
// 用法：node wheel_fit_v1.mjs <glb> <車代號> <輸出.json> <輪圈材質> <模型單位縮放（CARS.scale）> [煞車材質正則]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import fs from 'fs';
const [IN, CAR, OUT, RIMMAT, SCALE, BRAKE] = process.argv.slice(2);
const k = 1 / +SCALE;                       // 每公尺幾個模型單位
const brakeRe = new RegExp((BRAKE ? BRAKE + '|' : '') + 'brake|disc|disk|calip|callip|rotor', 'i');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
const doc = await io.read(IN), root = doc.getRoot(), v = [0, 0, 0];
const W = (M, p) => [0, 1, 2].map(r => M[r] * p[0] + M[4 + r] * p[1] + M[8 + r] * p[2] + M[12 + r]);
const prims = [];
const all = { mn: [1e9, 1e9, 1e9], mx: [-1e9, -1e9, -1e9] };
for (const n of root.listNodes()) { const me = n.getMesh(); if (!me) continue; const M = n.getWorldMatrix();
  me.listPrimitives().forEach((p, pi) => { const pos = p.getAttribute('POSITION'), pts = [];
    for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, v); const w = W(M, v); pts.push(w); for (let d = 0; d < 3; d++) { all.mn[d] = Math.min(all.mn[d], w[d]); all.mx[d] = Math.max(all.mx[d], w[d]); } }
    prims.push({ node: n.getName(), pi, mat: p.getMaterial()?.getName() || '', pts }); }); }
const ext = [0, 1, 2].map(d => all.mx[d] - all.mn[d]);
const upAx = /w202|mx5/.test(CAR) ? 2 : 1, lenAx = [0, 1, 2].filter(d => d !== upAx).reduce((a, b) => ext[a] > ext[b] ? a : b), latAx = [0, 1, 2].find(d => d !== upAx && d !== lenAx);
const mid = [0, 1, 2].map(d => (all.mn[d] + all.mx[d]) / 2);
const wheels = {};
for (const p of prims) if (p.mat === RIMMAT) for (const w of p.pts) { const q = (w[lenAx] > mid[lenAx] ? 'A' : 'B') + (w[latAx] > mid[latAx] ? '+' : '-');
  const b = wheels[q] ||= { mn: [1e9, 1e9, 1e9], mx: [-1e9, -1e9, -1e9] }; for (let d = 0; d < 3; d++) { b.mn[d] = Math.min(b.mn[d], w[d]); b.mx[d] = Math.max(b.mx[d], w[d]); } }
const out = { car: CAR, k, upAx, lenAx, latAx, wheels: [], hide: [] };
for (const [q, b] of Object.entries(wheels)) {
  const c = [0, 1, 2].map(d => (b.mn[d] + b.mx[d]) / 2), s = q[1] === '+' ? 1 : -1;
  const R = Math.max(b.mx[upAx] - b.mn[upAx], b.mx[lenAx] - b.mn[lenAx]) / 2, outer = s > 0 ? b.mx[latAx] : b.mn[latAx];
  // 煞車零件在這個輪子裡、最靠外的位置
  let brakeOut = -1e9, brakeR = 0;
  for (const p of prims) if (brakeRe.test(p.mat)) for (const w of p.pts) { const rr = Math.hypot(w[upAx] - c[upAx], w[lenAx] - c[lenAx]);
    if (rr < R * 1.05 && Math.abs(w[latAx] - c[latAx]) < (b.mx[latAx] - b.mn[latAx])) { brakeOut = Math.max(brakeOut, s * w[latAx]); brakeR = Math.max(brakeR, rr); } }
  out.wheels.push({ q, c, s, R: R / k, width: (b.mx[latAx] - b.mn[latAx]) / k, outer, depth: brakeOut > -1e9 ? (s * outer - brakeOut) / k : null, brakeR: brakeR / k });
}
// 輪圈正面的小零件：整個 primitive 都在某個輪子的圓柱裡（半徑 ≤ 1.03R）、在輪子中心面外側，而且不是煞車、輪胎、輪圈材質本身
for (const p of prims) { if (p.mat === RIMMAT) { out.hide.push({ node: p.node, pi: p.pi, mat: p.mat, why: 'rim' }); continue; }
  if (brakeRe.test(p.mat) || /tire|tyre|rubber/i.test(p.mat)) continue;
  const ok = p.pts.every(w => out.wheels.some(wh => { const rr = Math.hypot(w[upAx] - wh.c[upAx], w[lenAx] - wh.c[lenAx]) / k;
    return rr <= wh.R * 1.03 && wh.s * (w[latAx] - wh.c[latAx]) / k >= -0.01; }));
  if (ok) out.hide.push({ node: p.node, pi: p.pi, mat: p.mat, why: 'face', n: p.pts.length }); }
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(CAR, 'k', k, 'axes', lenAx, upAx, latAx, '|', out.wheels.map(w => `${w.q} R=${w.R.toFixed(3)} W=${w.width.toFixed(3)} depth=${w.depth == null ? '-' : w.depth.toFixed(3)} brakeR=${w.brakeR.toFixed(3)}`).join(' | '));
console.log('   hide:', out.hide.map(h => `${h.mat}@${h.node}#${h.pi}${h.why === 'face' ? '(' + h.n + ')' : ''}`).join(', '));
