// 雙色車頂前置量測（2026-10-10）：車漆裡朝上的三角形，照「離車漆最高點多深」分 4 cm 一格統計面積（m²），
// 看車頂跟引擎蓋、行李廂蓋之間有沒有明顯的高度斷層，斷層在哪就從哪切。尺寸照車長 4.7 m 換算。
// 用法：node roof_probe_v1.mjs <glb> <車代號>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
const [IN, CAR] = process.argv.slice(2);
const PAINT = { w202: /^carpaint$/, mx5: /^carpaint$/, macan: /^Color1Mtl$/, x5: /^carpaint$/, q50: /^CarPaint$/, mazda3: /^Mazda_3MI_1218030001_089$/,
  mustang: /^Ford_MustangGT_2024(PaintA|Coloured)_Material$/, gt43: /^gtishka_body$/, cx5: /^Paint_Color$/ };
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
const doc = await io.read(IN), root = doc.getRoot(), v = [0, 0, 0];
const W = (M, p) => [0, 1, 2].map(r => M[r] * p[0] + M[4 + r] * p[1] + M[8 + r] * p[2] + M[12 + r]);
const all = { mn: [1e9, 1e9, 1e9], mx: [-1e9, -1e9, -1e9] };
for (const n of root.listNodes()) { const me = n.getMesh(); if (!me) continue; const M = n.getWorldMatrix();
  for (const p of me.listPrimitives()) { const pos = p.getAttribute('POSITION'); for (let i = 0; i < pos.getCount(); i += 5) { pos.getElement(i, v); const w = W(M, v); for (let k = 0; k < 3; k++) { all.mn[k] = Math.min(all.mn[k], w[k]); all.mx[k] = Math.max(all.mx[k], w[k]); } } } }
const ext = [0, 1, 2].map(k => all.mx[k] - all.mn[k]);
const upAx = (CAR === 'w202' || CAR === 'mx5') ? 2 : 1;
const lenAx = [0, 1, 2].filter(k => k !== upAx).reduce((a, b) => ext[a] > ext[b] ? a : b);
const unit = 4.7 / ext[lenAx];
const tris = [];   // [深度(m)、面積(m²)、朝上分量、長度方向相對位置]
let ptop = -1e9;
for (const n of root.listNodes()) { const me = n.getMesh(); if (!me) continue; const M = n.getWorldMatrix();
  for (const p of me.listPrimitives()) { const nm = p.getMaterial() ? p.getMaterial().getName() : ''; if (!PAINT[CAR].test(nm)) continue;
    const pos = p.getAttribute('POSITION'), idx = p.getIndices(), cnt = idx ? idx.getCount() : pos.getCount();
    for (let t = 0; t < cnt; t += 3) { const P = [0, 1, 2].map(k => { pos.getElement(idx ? idx.getScalar(t + k) : t + k, v); return W(M, v); });
      const a = [0, 1, 2].map(d => P[1][d] - P[0][d]), b = [0, 1, 2].map(d => P[2][d] - P[0][d]);
      const c = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], L = Math.hypot(...c); if (!L) continue;
      const h = (P[0][upAx] + P[1][upAx] + P[2][upAx]) / 3, l = ((P[0][lenAx] + P[1][lenAx] + P[2][lenAx]) / 3 - all.mn[lenAx]) / ext[lenAx];
      ptop = Math.max(ptop, h); tris.push([h, L / 2 * unit * unit, Math.abs(c[upAx] / L), l]); } } }
const bins = new Map();
for (const [h, A, up, l] of tris) { if (up < 0.6) continue; const d = Math.floor((ptop - h) * unit / 0.04); if (d > 20) continue; const e = bins.get(d) || [0, 1, 0]; e[0] += A; e[1] = Math.min(e[1], l); e[2] = Math.max(e[2], l); bins.set(d, e); }
console.log(`${CAR}: 車高 ${(ext[upAx] * unit).toFixed(2)} m、車漆最高點在車頂下 ${((all.mx[upAx] - ptop) * unit * 100).toFixed(1)} cm`);
console.log([...bins.keys()].sort((a, b) => a - b).map(d => `  ${d * 4}-${d * 4 + 4}cm ${bins.get(d)[0].toFixed(3)}m² 長度 ${(bins.get(d)[1] * 100).toFixed(0)}–${(bins.get(d)[2] * 100).toFixed(0)}%`).join('\n'));
