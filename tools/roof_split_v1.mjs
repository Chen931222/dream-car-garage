// 雙色車頂（2026-10-10）：把車頂那塊從車漆切出來，叫 roof_paint（原廠跟著車身色，勾了變亮黑）。
// 挑法：車漆裡朝上（法向量朝上分量 > UP）的三角形，中心離車漆最高點不超過 CUT 公分。
// CUT 照 roof_probe_v1.mjs 的輸出定：車頂那幾格面積大，往下有一段幾乎沒有面積的斷層（只剩柱子），再往下才是引擎蓋、行李廂。
// MX-5 是軟頂，車頂是帆布不是車漆，不做。尺寸照車長 4.7 m 換算。
// 用法：node roof_split_v1.mjs <輸入.glb> <輸出.glb> <車代號>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { draco, compactPrimitive, prune } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
const [IN, OUT, CAR] = process.argv.slice(2);
const PAINT = { w202: /^carpaint$/, macan: /^Color1Mtl$/, x5: /^carpaint$/, q50: /^CarPaint$/, mazda3: /^Mazda_3MI_1218030001_089$/,
  mustang: /^Ford_MustangGT_2024(PaintA|Coloured)_Material$/, gt43: /^gtishka_body$/, cx5: /^Paint_Color$/ };
const CUT = { w202: 13, macan: 15, x5: 21, q50: 13, mazda3: 13, mustang: 18, gt43: 14, cx5: 17 };
const UP = +(process.env.UP || 0.6);
if (!PAINT[CAR]) throw new Error('no roof for ' + CAR);
const cut = +(process.env.CUT || CUT[CAR]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(), 'draco3d.encoder': await draco3d.createEncoderModule() });
const doc = await io.read(IN), root = doc.getRoot(), buf = root.listBuffers()[0], v = [0, 0, 0];
const W = (M, p) => [0, 1, 2].map(r => M[r] * p[0] + M[4 + r] * p[1] + M[8 + r] * p[2] + M[12 + r]);
const all = { mn: [1e9, 1e9, 1e9], mx: [-1e9, -1e9, -1e9] };
for (const n of root.listNodes()) { const me = n.getMesh(); if (!me) continue; const M = n.getWorldMatrix();
  for (const p of me.listPrimitives()) { const pos = p.getAttribute('POSITION'); for (let i = 0; i < pos.getCount(); i += 5) { pos.getElement(i, v); const w = W(M, v); for (let k = 0; k < 3; k++) { all.mn[k] = Math.min(all.mn[k], w[k]); all.mx[k] = Math.max(all.mx[k], w[k]); } } } }
const ext = [0, 1, 2].map(k => all.mx[k] - all.mn[k]);
const upAx = CAR === 'w202' ? 2 : 1;
const lenAx = [0, 1, 2].filter(k => k !== upAx).reduce((a, b) => ext[a] > ext[b] ? a : b);
const unit = 4.7 / ext[lenAx];
const triInfo = prim => { const M = prim._node.getWorldMatrix(), pos = prim.getAttribute('POSITION'), idx = prim.getIndices(), out = [];
  for (let t = 0; t < idx.getCount(); t += 3) { const P = [0, 1, 2].map(k => { pos.getElement(idx.getScalar(t + k), v); return W(M, v); });
    const a = [0, 1, 2].map(d => P[1][d] - P[0][d]), b = [0, 1, 2].map(d => P[2][d] - P[0][d]);
    const c = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], L = Math.hypot(...c);
    out.push({ t, h: (P[0][upAx] + P[1][upAx] + P[2][upAx]) / 3, up: L ? Math.abs(c[upAx] / L) : 0 }); }
  return out; };
const prims = [];
for (const n of root.listNodes()) { const me = n.getMesh(); if (!me) continue;
  for (const p of me.listPrimitives()) { const nm = p.getMaterial() ? p.getMaterial().getName() : ''; if (PAINT[CAR].test(nm)) { p._node = n; p._mesh = me; prims.push(p); } } }
let ptop = -1e9; const infos = prims.map(p => { const I = triInfo(p); I.forEach(x => { ptop = Math.max(ptop, x.h); }); return I; });
const newMats = {}; let moved = 0;
prims.forEach((prim, pi) => {
  const take = [], keep = [], idx = prim.getIndices();
  infos[pi].forEach(x => ((ptop - x.h) * unit * 100 <= cut && x.up > UP ? take : keep).push(idx.getScalar(x.t), idx.getScalar(x.t + 1), idx.getScalar(x.t + 2)));
  if (!take.length) return;
  const src = prim.getMaterial(), key = src.getName();
  if (!newMats[key]) newMats[key] = src.clone().setName('roof_paint');   // 每個來源材質各一份（Mustang 兩種車漆貼圖不同），名稱一樣
  const q = prim.clone().setMaterial(newMats[key]);
  q.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(take)).setBuffer(buf));
  prim._mesh.addPrimitive(q); compactPrimitive(q);
  if (keep.length) { prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(keep)).setBuffer(buf)); compactPrimitive(prim); }
  else { prim._mesh.removePrimitive(prim); prim.dispose(); }
  moved += take.length / 3;
});
console.log(CAR, 'roof_paint triangles', moved, 'cut', cut, 'cm');
await doc.transform(prune({ keepAttributes: true, keepIndices: true, keepLeaves: true }), draco({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }));
await io.write(OUT, doc);
