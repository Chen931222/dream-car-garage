// 改裝用的零件切分（2026-10-09，參考 Porsche 配置器「車外後視鏡烤漆」「輪圈」）
//   mirror_cap：後視鏡外殼。原本在車漆（七台）或黑色塑膠（Q50、AMG）材質裡，是左右各一塊獨立零件：
//               最長邊 15–30 cm、在車寬兩端（<12% 或 >88%）、高度在整台車的 66–80%。切成新材質才能單獨改顏色。
//   rim：Macan、CX-5 的輪圈原本跟輪胎同一個材質（Macan 的黑色 Leftwiper1Mtl、CX-5 的掃描貼圖），按圓的大小挑出來。
// 尺寸用「車長 ≈ 4.7 m」換算成公尺（跟 mirror_probe_v1.mjs 一樣），只用來挑零件。
// 用法：node mods_split_v1.mjs <輸入.glb> <輸出.glb> <車代號>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { draco, compactPrimitive, prune } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
const [IN, OUT, CAR] = process.argv.slice(2);
const MIRROR = {
  w202: /^carpaint$/, mx5: /^carpaint$/, macan: /^Color1Mtl$/, x5: /^carpaint$/, q50: /^Plasatic_S$/,
  mazda3: /^Mazda_3MI_1218030001_089$/, mustang: /^Ford_MustangGT_2024(PaintA|Coloured)_Material$/, gt43: /^gtishka_black$/, cx5: /^Paint_Color$/,
};
// 輪圈：節點名稱、材質、最長邊（模型單位）的範圍；Macan 1.4–1.7 那圈是碟盤後面的擋板，不算
const RIM = {
  macan: { node: 'Object_43_WHEEL', mat: 'Leftwiper1Mtl', ok: b => (b > 0.8 && b < 1.4) || (b > 2.1 && b < 2.4) },
  cx5: { node: 'Index_0_1_BD_WHEEL', mat: 'Index_0_1', ok: b => b > 0.48 && b < 0.55 },
};
// 車門把手（2026-10-09，參考 Porsche「車門把手施以高亮澤黑色烤漆」）：最長邊 17–30 cm、最薄 < 8 cm、車寬兩端、高度 50–68%，
// 長度方向只在車門那一段（各車的 len 範圍是看 handle_probe_v1.mjs 的輸出定的；AMG 前葉子板那條 27 cm 的鍍鉻飾條要排除）
const HANDLE = {
  w202: { mat: /^black$/, len: [0.45, 0.78] }, mx5: { mat: /^carpaint$/, len: [0.55, 0.7] }, macan: { mat: /^Color1Mtl$/, len: [0.45, 0.78] },
  x5: { mat: /^carpaint$/, len: [0.2, 0.55] }, q50: { mat: /^CarPaint$|^Chrome1$/, len: [0.2, 0.55] }, mazda3: { mat: /^Mazda_3MI_1218030001_089$/, len: [0.2, 0.55] },
  mustang: { mat: /^Ford_MustangGT_2024PaintA_Material$/, len: [0.35, 0.47] }, gt43: { mat: /^gtishka_body$|^amg_chrome$/, len: [0.25, 0.55] }, cx5: { mat: /^Paint_Color$/, len: [0.2, 0.55] },
};
const MIRROR_PAINT = {   // 各車的車漆材質
  w202: /^carpaint$/, mx5: /^carpaint$/, macan: /^Color1Mtl$/, x5: /^carpaint$/, q50: /^CarPaint$/, mazda3: /^Mazda_3MI_1218030001_089$/,
  mustang: /^Ford_MustangGT_2024(PaintA|Coloured)_Material$/, gt43: /^gtishka_body$/, cx5: /^Paint_Color$/,
};
const ONLY = process.env.ONLY || '';   // ONLY=handle：只切把手（後視鏡、輪圈已經切過的模型）
if (!MIRROR[CAR]) throw new Error('unknown car ' + CAR);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(), 'draco3d.encoder': await draco3d.createEncoderModule() });
const doc = await io.read(IN);
const root = doc.getRoot(), buf = root.listBuffers()[0], v = [0, 0, 0];
const W = (M, p) => [0, 1, 2].map(r => M[r] * p[0] + M[4 + r] * p[1] + M[8 + r] * p[2] + M[12 + r]);
const all = { mn: [1e9, 1e9, 1e9], mx: [-1e9, -1e9, -1e9] };
for (const n of root.listNodes()) { const me = n.getMesh(); if (!me) continue; const M = n.getWorldMatrix();
  for (const p of me.listPrimitives()) { const pos = p.getAttribute('POSITION'); for (let i = 0; i < pos.getCount(); i += 7) { pos.getElement(i, v); const w = W(M, v); for (let k = 0; k < 3; k++) { all.mn[k] = Math.min(all.mn[k], w[k]); all.mx[k] = Math.max(all.mx[k], w[k]); } } } }
const ext = [0, 1, 2].map(k => all.mx[k] - all.mn[k]);
const lenAx = ext.indexOf(Math.max(...ext));
const unit = 4.7 / ext[lenAx];
// 上方向：W202、MX-5 的 glTF 是 z 朝上，其他是 y
const upAx = (CAR === 'w202' || CAR === 'mx5') ? 2 : 1, latAx = [0, 1, 2].find(k => k !== lenAx && k !== upAx);

function comps(prim, M) {
  const pos = prim.getAttribute('POSITION'), idx = prim.getIndices(), cnt = pos.getCount(), wp = [];
  for (let i = 0; i < cnt; i++) { pos.getElement(i, v); wp.push(W(M, v)); }
  const q = ext[lenAx] / 40000, key = new Map(), weld = new Int32Array(cnt);
  for (let i = 0; i < cnt; i++) { const k = wp[i].map(a => Math.round(a / q)).join(','); if (!key.has(k)) key.set(k, i); weld[i] = key.get(k); }
  const par = new Int32Array(cnt).map((_, i) => i), f = i => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
  const tri = idx ? idx.getCount() : cnt, g = i => weld[idx ? idx.getScalar(i) : i];
  for (let t = 0; t < tri; t += 3) { const a = f(g(t)), b = f(g(t + 1)), c = f(g(t + 2)); par[b] = a; par[f(c)] = a; }
  const out = new Map();
  for (let t = 0; t < tri; t += 3) { const r = f(g(t)); if (!out.has(r)) out.set(r, { tris: [], mn: [1e9, 1e9, 1e9], mx: [-1e9, -1e9, -1e9] }); const c = out.get(r); c.tris.push(t);
    for (let k = 0; k < 3; k++) { const p = wp[idx ? idx.getScalar(t + k) : t + k]; for (let d = 0; d < 3; d++) { c.mn[d] = Math.min(c.mn[d], p[d]); c.mx[d] = Math.max(c.mx[d], p[d]); } } }
  return [...out.values()];
}
const newMats = {};
function moveTris(prim, mesh, taken, name) {
  if (!taken.size) return 0;
  const idx = prim.getIndices(), keep = [], take = [];
  for (let t = 0; t < idx.getCount(); t += 3) (taken.has(t) ? take : keep).push(idx.getScalar(t), idx.getScalar(t + 1), idx.getScalar(t + 2));
  const src = prim.getMaterial();
  const key = name + '|' + src.getName();   // 每個來源材質各複製一份（貼圖不同），名稱一樣
  if (!newMats[key]) newMats[key] = src.clone().setName(name);
  const q = prim.clone().setMaterial(newMats[key]);
  q.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(take)).setBuffer(buf));
  mesh.addPrimitive(q); compactPrimitive(q);
  if (keep.length) { prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(keep)).setBuffer(buf)); compactPrimitive(prim); }
  else { mesh.removePrimitive(prim); prim.dispose(); }
  return take.length / 3;
}
const report = {};
for (const n of root.listNodes()) { const me = n.getMesh(); if (!me) continue; const M = n.getWorldMatrix();
  for (const prim of me.listPrimitives().slice()) {
    const nm = prim.getMaterial() ? prim.getMaterial().getName() : '';
    const H = HANDLE[CAR];
    if (H.mat.test(nm) && (!ONLY || ONLY === 'handle')) {
      const sel = new Set();
      for (const c of comps(prim, M)) {
        const sz = [0, 1, 2].map(k => (c.mx[k] - c.mn[k]) * unit), big = Math.max(...sz), thin = Math.min(...sz);
        const rel = k => (((c.mn[k] + c.mx[k]) / 2) - all.mn[k]) / ext[k];
        if (big > 0.17 && big < 0.30 && thin < 0.08 && (rel(latAx) < 0.12 || rel(latAx) > 0.88) && rel(upAx) > 0.5 && rel(upAx) < 0.68 && rel(lenAx) > H.len[0] && rel(lenAx) < H.len[1]) c.tris.forEach(t => sel.add(t));
      }
      // 車漆做的把手叫 door_handle（原廠跟著車身色），其他材質（W202 黑塑膠、Q50／AMG 鍍鉻飾條）叫 door_handle_trim（原廠照原樣）
      const nmH = MIRROR_PAINT[CAR].test(nm) ? 'door_handle' : 'door_handle_trim';
      const k = moveTris(prim, me, sel, nmH); if (k) report[nmH] = (report[nmH] || 0) + k;
      if (ONLY === 'handle') continue;
    }
    if (ONLY === 'handle') continue;
    if (MIRROR[CAR].test(nm)) {
      const sel = new Set();
      for (const c of comps(prim, M)) {
        const big = Math.max(...[0, 1, 2].map(k => c.mx[k] - c.mn[k])) * unit;
        const rel = k => (((c.mn[k] + c.mx[k]) / 2) - all.mn[k]) / ext[k];
        if (big > 0.15 && big < 0.30 && (rel(latAx) < 0.12 || rel(latAx) > 0.88) && rel(upAx) > 0.66 && rel(upAx) < 0.80) c.tris.forEach(t => sel.add(t));
      }
      const k = moveTris(prim, me, sel, 'mirror_cap'); if (k) report.mirror_cap = (report.mirror_cap || 0) + k;
    }
    const R = RIM[CAR];
    if (R && n.getName() === R.node && nm === R.mat) {
      const sel = new Set();
      for (const c of comps(prim, M)) { const big = Math.max(...[0, 1, 2].map(k => c.mx[k] - c.mn[k])); if (R.ok(big)) c.tris.forEach(t => sel.add(t)); }
      const k = moveTris(prim, me, sel, 'rim'); if (k) report.rim = (report.rim || 0) + k;
    }
  } }
console.log(CAR, 'moved', JSON.stringify(report), 'axes len/up/lat', lenAx, upAx, latAx);
await doc.transform(prune({ keepAttributes: true, keepIndices: true, keepLeaves: true }), draco({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }));
await io.write(OUT, doc);
