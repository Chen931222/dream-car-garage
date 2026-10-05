// 檢查 add_ride_v1.mjs 的輸出：WHEELS 底下每個零件的頂點範圍應該都落在輪子附近；
// 從合併網格切出來的零件如果還帶著全車的頂點（compactPrimitive 沒生效），外框會撐到整台車。
// 用法：node tools/check_ride_groups_v1.mjs <glb> <上方軸 y|z>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
const [IN, UPA = 'y'] = process.argv.slice(2);
const UP = UPA === 'z' ? 2 : 1;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
const doc = await io.read(IN); const root = doc.getRoot();
const xf = (M, v) => [M[0] * v[0] + M[4] * v[1] + M[8] * v[2] + M[12], M[1] * v[0] + M[5] * v[1] + M[9] * v[2] + M[13], M[2] * v[0] + M[6] * v[1] + M[10] * v[2] + M[14]];
const group = name => root.listNodes().find(n => n.getName() === name);
let carTop = -Infinity, carBot = Infinity;
const rows = [];
for (const [g, tag] of [[group('WHEELS'), 'W'], [group('RIDE_BODY'), 'B']]) {
  for (const n of g.listChildren()) {
    const M = n.getWorldMatrix();
    for (const p of n.getMesh().listPrimitives()) {
      const a = p.getAttribute('POSITION'), e = [0, 0, 0]; let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < a.getCount(); i++) { a.getElement(i, e); const w = xf(M, e)[UP]; if (w < lo) lo = w; if (w > hi) hi = w; }
      const used = new Set(p.getIndices() ? p.getIndices().getArray() : []).size;
      carTop = Math.max(carTop, hi); carBot = Math.min(carBot, lo);
      rows.push({ tag, node: n.getName(), mat: p.getMaterial() && p.getMaterial().getName(), verts: a.getCount(), used, lo, hi });
    }
  }
}
const H = carTop - carBot;
let bad = 0;
for (const r of rows.filter(r => r.tag === 'W')) {
  const top = (r.hi - carBot) / H;                     // 輪子零件的頂端應該在車高一半以下
  const flag = top > 0.6 || r.used < r.verts;
  if (flag) bad++;
  console.log(`${flag ? 'CHECK' : 'ok   '} WHEELS ${r.mat}  頂點 ${r.verts}（用到 ${r.used}）  頂端在車高 ${(top * 100).toFixed(0)}%`);
}
console.log(`WHEELS 零件 ${rows.filter(r => r.tag === 'W').length} 個，要看的 ${bad} 個；RIDE_BODY 零件 ${rows.filter(r => r.tag === 'B').length} 個`);
