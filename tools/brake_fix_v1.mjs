// 碟盤、卡鉗分家（2026-10-09）
//   Mazda 3：Brake_007 一個材質包了碟盤、卡鉗、來令片、螺絲，換卡鉗顏色會把碟盤一起染紅。
//            把網格拆成連通的零件，正圓、扁、而且是最大那一級的（直徑約 30 cm）算碟盤，搬到新材質 brake_disc。
//   Q50：卡鉗的 Red_Metal1 也用在車尾的紅色「S」字標，換卡鉗顏色會連字標一起換。
//        只把輪子那個網格（名稱帶 _WHEEL）的改用新材質 brake_caliper。
// 用法：node brake_fix_v1.mjs <輸入.glb> <輸出.glb> <mazda3|q50>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { draco, compactPrimitive, prune } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
const [IN, OUT, CAR] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(), 'draco3d.encoder': await draco3d.createEncoderModule() });
const doc = await io.read(IN);
const root = doc.getRoot(), buf = root.listBuffers()[0];

function components(prim) {
  const pos = prim.getAttribute('POSITION'), idx = prim.getIndices(), n = pos.getCount(), v = [0, 0, 0];
  // ⚠️ 外框用 getElement 換算後的值：量化過的模型 getMin／getMax 回的是原始整數
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let i = 0; i < n; i++) { pos.getElement(i, v); for (let d = 0; d < 3; d++) { mn[d] = Math.min(mn[d], v[d]); mx[d] = Math.max(mx[d], v[d]); } }
  const q = Math.max(...[0, 1, 2].map(k => mx[k] - mn[k])) / 20000, key = new Map(), weld = new Int32Array(n);
  for (let i = 0; i < n; i++) { pos.getElement(i, v); const k = v.map(a => Math.round(a / q)).join(','); if (!key.has(k)) key.set(k, i); weld[i] = key.get(k); }
  const par = new Int32Array(n).map((_, i) => i), f = i => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
  const tri = idx ? idx.getCount() : n, g = i => weld[idx ? idx.getScalar(i) : i];
  for (let t = 0; t < tri; t += 3) { const a = f(g(t)), b = f(g(t + 1)), c = f(g(t + 2)); par[b] = a; par[f(c)] = a; }
  const comps = new Map();
  for (let t = 0; t < tri; t += 3) { const r = f(g(t)); if (!comps.has(r)) comps.set(r, { tris: [], mn: [1e9, 1e9, 1e9], mx: [-1e9, -1e9, -1e9] }); const c = comps.get(r); c.tris.push(t);
    for (const k of [0, 1, 2]) { pos.getElement(idx ? idx.getScalar(t + k) : t + k, v); for (let d = 0; d < 3; d++) { c.mn[d] = Math.min(c.mn[d], v[d]); c.mx[d] = Math.max(c.mx[d], v[d]); } } }
  return [...comps.values()].map(c => { const s = [0, 1, 2].map(k => c.mx[k] - c.mn[k]).sort((a, b) => a - b); return { ...c, big: s[2], round: s[1] / s[2], thin: s[0] / s[2] }; });
}

if (CAR === 'mazda3') {
  for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives().slice()) {
    const mat = prim.getMaterial(); if (!mat || mat.getName() !== 'Mazda_3MI_Brake_007') continue;
    const comps = components(prim), maxBig = Math.max(...comps.filter(c => c.round > 0.95).map(c => c.big));
    const disc = comps.filter(c => c.round > 0.95 && c.thin < 0.3 && c.big > 0.8 * maxBig);
    if (disc.length !== 4) throw new Error('expected 4 discs, got ' + disc.length);
    const idx = prim.getIndices(), keep = [], take = [], isDisc = new Set(disc.flatMap(c => c.tris));
    for (let t = 0; t < idx.getCount(); t += 3) (isDisc.has(t) ? take : keep).push(idx.getScalar(t), idx.getScalar(t + 1), idx.getScalar(t + 2));
    const q = prim.clone().setMaterial(mat.clone().setName('brake_disc'));
    q.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(take)).setBuffer(buf));
    prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(keep)).setBuffer(buf));
    mesh.addPrimitive(q); compactPrimitive(q); compactPrimitive(prim);
    console.log('mazda3: discs', take.length / 3, 'tris → brake_disc; caliper/pads keep', keep.length / 3, 'tris; disc size', disc.map(c => c.big.toFixed(3)).join(','));
  }
} else if (CAR === 'q50') {
  let n = 0, cal = null;
  for (const mesh of root.listMeshes()) {
    if (!/_WHEEL$/.test(mesh.getName())) continue;
    for (const prim of mesh.listPrimitives()) {
      const mat = prim.getMaterial(); if (!mat || mat.getName() !== 'Red_Metal1') continue;
      cal = cal || mat.clone().setName('brake_caliper'); prim.setMaterial(cal); n++;
    }
  }
  if (!n) throw new Error('no wheel caliper primitives');
  console.log('q50: wheel caliper primitives → brake_caliper:', n);
} else throw new Error('car must be mazda3 or q50');

await doc.transform(prune({ keepAttributes: true, keepIndices: true, keepLeaves: true }), draco({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }));
await io.write(OUT, doc);
console.log('wrote', OUT);
