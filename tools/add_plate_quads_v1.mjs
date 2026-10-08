// 自訂車牌（2026-10-08）：W202、MX-5 的車牌底板沒有 UV、原本的字是立體幾何（模型作者的廣告字），
// 印不了字。在前後車牌底板正前方各加一片有 UV 的薄板（材質 plate_print），網頁再把訪客打的字畫成貼圖貼上去。
// 薄板跟車牌底板放在同一個 mesh：車高動畫、轉向都一起動。預設全透明，沒打字時看到的還是原本的黑牌。
// ⚠️ 這兩台的頂點是量化過的本地座標（縮到 ±1，靠節點縮放還原），軸向跟世界座標不同：
//    方向一律在世界座標判斷（glTF 世界：z 朝上），本地只用來放點。
// 用法：node add_plate_quads_v1.mjs <輸入.glb> <輸出.glb>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { draco } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
const [IN, OUT] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(), 'draco3d.encoder': await draco3d.createEncoderModule() });
const doc = await io.read(IN);
const root = doc.getRoot(), buf = root.listBuffers()[0];
if (root.listMaterials().some(m => m.getName() === 'plate_print')) throw new Error('already has plate_print');

const node = root.listNodes().find(n => n.getMesh() && n.getMesh().listPrimitives().some(p => p.getMaterial() && p.getMaterial().getName() === 'Material__1'));
const host = node.getMesh();
const prim = host.listPrimitives().find(p => p.getMaterial().getName() === 'Material__1');
const M = node.getWorldMatrix();   // 欄優先
const toW = p => [0, 1, 2].map(r => M[r] * p[0] + M[4 + r] * p[1] + M[8 + r] * p[2] + M[12 + r]);
const axisW = k => { const e = [0, 0, 0]; e[k] = 1; return [0, 1, 2].map(r => M[r] * e[0] + M[4 + r] * e[1] + M[8 + r] * e[2]); };
const len = a => Math.hypot(...a), dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// 本地座標裡，前後兩塊車牌在「車長那一軸」的兩端：找出值落在兩個極端的那一軸
const pos = prim.getAttribute('POSITION'), v = [0, 0, 0], pts = [];
for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, v); pts.push(v.slice()); }
const ext = [0, 1, 2].map(k => [Math.min(...pts.map(p => p[k])), Math.max(...pts.map(p => p[k]))]);
// 車長軸：世界方向最接近水平、而且兩塊車牌分在兩端（中間沒有點）
let T = -1;
for (let k = 0; k < 3; k++) {
  const mid = (ext[k][0] + ext[k][1]) / 2, span = ext[k][1] - ext[k][0];
  const gap = pts.every(p => Math.abs(p[k] - mid) > span * 0.3);
  if (gap) { T = k; break; }
}
if (T < 0) throw new Error('cannot find length axis');
const up = [0, 0, 1];
const quads = [];
for (const sgn of [-1, 1]) {
  const grp = pts.filter(p => Math.sign(p[T] - (ext[T][0] + ext[T][1]) / 2) === sgn);
  const mn = [0, 1, 2].map(k => Math.min(...grp.map(p => p[k]))), mx = [0, 1, 2].map(k => Math.max(...grp.map(p => p[k])));
  // 往外推 1.5 mm（世界單位是公分 → 0.15）
  const tW = axisW(T), off = 0.15 / len(tW);
  const tPlane = sgn > 0 ? mx[T] + off : mn[T] - off;
  const others = [0, 1, 2].filter(k => k !== T);
  const corners = [];
  for (const a of [mn[others[0]], mx[others[0]]]) for (const b of [mn[others[1]], mx[others[1]]]) {
    const p = [0, 0, 0]; p[T] = tPlane; p[others[0]] = a; p[others[1]] = b; corners.push(p);
  }
  // 世界方向：往外 = 本地 T 軸 × sgn；觀察者在外面往裡看，右手邊 = (往裡) × 上
  const outW = tW.map(x => x * sgn / len(tW));
  const right = cross(outW.map(x => -x), up);
  const W = corners.map(toW);
  const us = W.map(w => dot(w, right)), vs = W.map(w => dot(w, up));
  const u0 = Math.min(...us), u1 = Math.max(...us), v0 = Math.min(...vs), v1 = Math.max(...vs);
  const uv = W.map((w, i) => [(us[i] - u0) / (u1 - u0), (v1 - vs[i]) / (v1 - v0)]);
  // 兩個三角形：照 uv 排成 左上、右上、右下、左下
  const order = [0, 1, 2, 3].sort((a, b) => (uv[a][1] - uv[b][1]) || (uv[a][0] - uv[b][0]));
  const [tl, tr] = order.slice(0, 2).sort((a, b) => uv[a][0] - uv[b][0]);
  const [bl, br] = order.slice(2).sort((a, b) => uv[a][0] - uv[b][0]);
  quads.push({ corners, uv, idx: [tl, tr, br, bl], outLocal: (() => { const n = [0, 0, 0]; n[T] = sgn; return n; })(),
    sizeW: [(u1 - u0).toFixed(1), (v1 - v0).toFixed(1)], heightW: ((v0 + v1) / 2).toFixed(1) });
}
console.log('length axis', T, quads.map(q => `plate ${q.sizeW.join('x')} cm at z=${q.heightW}`).join(' | '));
const P = [], N = [], UV = [], I = [];
for (const q of quads) {
  const base = P.length / 3;
  for (const i of q.idx) { P.push(...q.corners[i]); N.push(...q.outLocal); UV.push(...q.uv[i]); }
  I.push(base, base + 1, base + 2, base, base + 2, base + 3);
}
const acc = (type, arr, Tp) => doc.createAccessor().setType(type).setArray(new Tp(arr)).setBuffer(buf);
const mat = doc.createMaterial('plate_print').setBaseColorFactor([1, 1, 1, 0]).setAlphaMode('BLEND')
  .setMetallicFactor(0).setRoughnessFactor(0.45).setDoubleSided(true);
host.addPrimitive(doc.createPrimitive().setMaterial(mat)
  .setAttribute('POSITION', acc('VEC3', P, Float32Array))
  .setAttribute('NORMAL', acc('VEC3', N, Float32Array))
  .setAttribute('TEXCOORD_0', acc('VEC2', UV, Float32Array))
  .setIndices(acc('SCALAR', I, Uint16Array)));
await doc.transform(draco({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }));
await io.write(OUT, doc);
console.log('wrote', OUT);
