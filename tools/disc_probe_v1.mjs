// 找碟盤（2026-10-09）：把指定材質的網格拆成連通的零件，列出每塊的外框（本地座標），看碟盤（又圓又薄的環）跟卡鉗分不分得開
// 用法：node disc_probe_v1.mjs <glb> <材質名>...
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
const [IN, ...MATS] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
const doc = await io.read(IN);
export function components(prim) {
  const pos = prim.getAttribute('POSITION'), idx = prim.getIndices(), n = pos.getCount();
  // 同位置的頂點先焊在一起（UV 接縫會把同一個點拆成好幾個）
  const key = new Map(), weld = new Int32Array(n), v = [0, 0, 0];
  // ⚠️ 外框要用 getElement 換算後的值算：量化過的模型（Mazda 3、X5、Macan）getMin／getMax 回的是原始整數
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let i = 0; i < n; i++) { pos.getElement(i, v); for (let d = 0; d < 3; d++) { mn[d] = Math.min(mn[d], v[d]); mx[d] = Math.max(mx[d], v[d]); } }
  const span = Math.max(...[0, 1, 2].map(k => mx[k] - mn[k])) || 1, q = span / 20000;
  for (let i = 0; i < n; i++) { pos.getElement(i, v); const k = v.map(a => Math.round(a / q)).join(','); if (!key.has(k)) key.set(k, i); weld[i] = key.get(k); }
  const par = new Int32Array(n).map((_, i) => i), f = i => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
  const tri = idx ? idx.getCount() : n, g = i => weld[idx ? idx.getScalar(i) : i];
  for (let t = 0; t < tri; t += 3) { const a = f(g(t)), b = f(g(t + 1)), c = f(g(t + 2)); par[b] = a; par[f(c)] = a; }
  const comps = new Map();
  for (let t = 0; t < tri; t += 3) { const r = f(g(t)); if (!comps.has(r)) comps.set(r, { tris: [], mn: [1e9, 1e9, 1e9], mx: [-1e9, -1e9, -1e9] }); const c = comps.get(r); c.tris.push(t);
    for (const k of [0, 1, 2]) { pos.getElement(idx ? idx.getScalar(t + k) : t + k, v); for (let d = 0; d < 3; d++) { c.mn[d] = Math.min(c.mn[d], v[d]); c.mx[d] = Math.max(c.mx[d], v[d]); } } }
  return [...comps.values()];
}
if (process.argv[1].endsWith('disc_probe_v1.mjs')) {
  for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
    const m = prim.getMaterial(); if (!m || !MATS.includes(m.getName())) continue;
    const comps = components(prim).sort((a, b) => b.tris.length - a.tris.length);
    console.log(`== ${m.getName()} in mesh ${mesh.getName()}: ${comps.length} parts`);
    for (const c of comps.slice(0, 24)) {
      const d = [0, 1, 2].map(k => c.mx[k] - c.mn[k]), s = d.slice().sort((a, b) => a - b);
      console.log(`  tris ${String(c.tris.length).padStart(5)}  size ${d.map(x => x.toPrecision(3)).join(' x ')}  thin ${(s[0] / s[2]).toFixed(2)}  round ${(s[1] / s[2]).toFixed(2)}  ctr ${c.mn.map((a, k) => ((a + c.mx[k]) / 2).toPrecision(3)).join(',')}`);
    }
  }
}
