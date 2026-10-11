// 換輪圈造型（2026-10-11）：
//  1. 原廠輪圈和輪圈正面的小零件（中心蓋、廠徽、螺絲）拆到自己的子節點 stock_rim_N，網頁換造型時整個藏起來。
//     子節點掛在原本的節點底下、不帶位移，所以原本跟著什麼動（車高動畫）就還是跟著動。
//     Mustang 的輪圈和輪胎是同一個材質：只拆半徑 ≤ rcut 的三角形（輪圈），輪胎留著。
//  2. Blender 產生的三款輪圈（mod_rim_<造型>_<輪子>）掛到場景最上層，節點自帶位置、旋轉、單位縮放。
// 用法：node add_wheels_v1.mjs <車模.glb> <wheelfit.json> <輪圈.glb> <輸出.glb>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { mergeDocuments, unpartition, draco, prune, compactPrimitive } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import fs from 'fs';
const [CAR, FIT, PARTS, OUT] = process.argv.slice(2);
const fit = JSON.parse(fs.readFileSync(FIT, 'utf8'));
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(), 'draco3d.encoder': await draco3d.createEncoderModule() });
const doc = await io.read(CAR), root = doc.getRoot(), scene = root.listScenes()[0], buf = root.listBuffers()[0], v = [0, 0, 0];
const W = (M, p) => [0, 1, 2].map(r => M[r] * p[0] + M[4 + r] * p[1] + M[8 + r] * p[2] + M[12 + r]);
// 共用的 mesh（好幾個節點用同一個）先複製一份給要拆的節點，才不會動到別的節點；再照量測時的節點名＋序號抓好 primitive，之後才動手
for (const h of fit.hide) {
  const n = root.listNodes().find(x => x.getName() === h.node); if (!n || !n.getMesh()) throw new Error('node not found ' + h.node);
  const me = n.getMesh(); if (me.listParents().filter(x => x.propertyType === 'Node').length > 1) n.setMesh(me.clone());
}
const jobs = fit.hide.map(h => { const n = root.listNodes().find(x => x.getName() === h.node), p = n.getMesh().listPrimitives()[h.pi];
  if (!p || (p.getMaterial()?.getName() || '') !== h.mat) throw new Error('prim mismatch ' + h.node + '#' + h.pi);
  return { n, p, rcut: h.rcut }; });
let k = 0;
for (const { n, p: prim, rcut } of jobs) {
  const me = n.getMesh();
  let take = prim;
  if (rcut) {   // 只拆輪圈那一圈（離最近的輪心 ≤ rcut 公尺）
    const M = n.getWorldMatrix(), pos = prim.getAttribute('POSITION'), idx = prim.getIndices(), up = fit.upAx, ln = fit.lenAx;
    const near = i => { pos.getElement(i, v); const w = W(M, v); return fit.wheels.some(wh => Math.hypot(w[up] - wh.c[up], w[ln] - wh.c[ln]) / fit.k <= rcut); };
    const keep = [], tk = [];
    for (let t = 0; t < idx.getCount(); t += 3) { const a = idx.getScalar(t), b = idx.getScalar(t + 1), c = idx.getScalar(t + 2); (near(a) && near(b) && near(c) ? tk : keep).push(a, b, c); }
    take = prim.clone(); take.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(tk)).setBuffer(buf)); compactPrimitive(take);
    prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(keep)).setBuffer(buf)); compactPrimitive(prim);
    console.log('  split', n.getName(), 'rim tris', tk.length / 3, 'kept (tire)', keep.length / 3);
  } else {
    me.removePrimitive(prim);
    if (!me.listPrimitives().length) { n.setMesh(null); }
  }
  const child = doc.createNode('stock_rim_' + (k++)).setMesh(doc.createMesh('stock_rim_' + k).addPrimitive(take));
  n.addChild(child);
}
mergeDocuments(doc, await io.read(PARTS));
await doc.transform(unpartition());
const extra = root.listScenes().find(s => s !== scene);
for (const n of extra.listChildren().slice()) { if (!/^mod_rim_/.test(n.getName())) throw new Error('unexpected ' + n.getName()); extra.removeChild(n); scene.addChild(n); }
extra.dispose();
console.log('stock_rim nodes', k, '| mod_rim nodes', scene.listChildren().filter(n => /^mod_rim_/.test(n.getName())).length);
await doc.transform(prune({ keepAttributes: true, keepIndices: true, keepLeaves: true }), draco({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }));
await io.write(OUT, doc);
