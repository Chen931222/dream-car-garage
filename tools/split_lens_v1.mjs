// 把燈罩從共用材質切出來（2026-10-08）：某些模型的燈罩跟車窗（X5、Mustang）、或跟整台車（CX-5 掃描模型）是同一個材質，
// 「發動引擎」讓燈罩發光時車窗也會跟著亮。這支把指定材質裡、三角形中心落在給定 3D 外框內的面，搬到一個新材質
// （複製原材質再改名：headlight_lens／taillight_lens），外觀不變，只是名字分開，網頁就能只讓燈罩發光。
// 外框來自瀏覽器實測（G:\Projects\_design-check\_lens_boxes.mjs → lens_boxes.json），座標是 glTF 場景座標。
// 用法：node split_lens_v1.mjs <輸入.glb> <輸出.glb> <lens_boxes.json> <車代號>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { draco, compactPrimitive, prune } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import fs from 'fs';
const [IN, OUT, JSONF, CAR] = process.argv.slice(2);
const jobs = JSON.parse(fs.readFileSync(JSONF, 'utf8'))[CAR] || [];
if (!jobs.length) throw new Error('no lens boxes for ' + CAR);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(), 'draco3d.encoder': await draco3d.createEncoderModule() });
const doc = await io.read(IN);
const root = doc.getRoot();
// 外框四周多留燈罩最長邊的 8%（40 cm 的燈約 3 cm）。⚠️ 不能用 POSITION 的 min/max 算車長：Macan、X5、Mazda 3 的頂點是量化過的整數
for (const j of jobs) j.pad = 0.08 * Math.max(...[0, 1, 2].map(k => j.mx[k] - j.mn[k]));
const newMats = {};
const users = new Map(); for (const n of root.listNodes()) if (n.getMesh()) users.set(n.getMesh(), (users.get(n.getMesh()) || []).concat(n));
let moved = {};
for (const [mesh, nodes] of users) {
  if (nodes.length > 1) console.warn('mesh used by', nodes.length, 'nodes, using the first:', mesh.getName());
  const M = nodes[0].getWorldMatrix();
  for (const prim of mesh.listPrimitives().slice()) {
    const mat = prim.getMaterial(); if (!mat) continue;
    const mine = jobs.filter(j => j.mat === mat.getName()); if (!mine.length) continue;
    const pos = prim.getAttribute('POSITION'), idx = prim.getIndices();
    const n = idx ? idx.getCount() : pos.getCount(), get = i => idx ? idx.getScalar(i) : i;
    const keep = [], take = {}; const v = [0, 0, 0];
    const W = i => { pos.getElement(i, v); return [0, 1, 2].map(r => M[r] * v[0] + M[4 + r] * v[1] + M[8 + r] * v[2] + M[12 + r]); };
    for (let t = 0; t < n; t += 3) {
      const a = get(t), b = get(t + 1), c = get(t + 2);
      const A = W(a), B = W(b), C = W(c), ctr = [0, 1, 2].map(k => (A[k] + B[k] + C[k]) / 3);
      const hit = mine.find(j => [0, 1, 2].every(k => ctr[k] >= j.mn[k] - j.pad && ctr[k] <= j.mx[k] + j.pad));
      if (hit) (take[hit.newName] = take[hit.newName] || []).push(a, b, c); else keep.push(a, b, c);
    }
    for (const [name, tri] of Object.entries(take)) {
      if (!newMats[name + '|' + mat.getName()]) {
        // 燈罩拿掉透射（KHR_materials_transmission／volume）：透射玻璃的自發光會被吃掉，發動引擎時燈看起來沒亮（Mustang、Q50、X5、Mazda 3）
        const nm = mat.clone().setName(name);
        for (const e of nm.listExtensions()) { const n2 = e.extensionName || ''; if (/transmission|volume/.test(n2)) nm.setExtension(n2, null); }
        if (nm.getAlphaMode() === 'OPAQUE') nm.setAlphaMode('BLEND');
        newMats[name + '|' + mat.getName()] = nm;
      }
      const q = prim.clone().setMaterial(newMats[name + '|' + mat.getName()]);
      q.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(tri)).setBuffer(root.listBuffers()[0]));
      mesh.addPrimitive(q); compactPrimitive(q);
      moved[name] = (moved[name] || 0) + tri.length / 3;
    }
    if (Object.keys(take).length) {
      if (keep.length) { prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(keep)).setBuffer(root.listBuffers()[0])); compactPrimitive(prim); }
      else { mesh.removePrimitive(prim); prim.dispose(); }
    }
  }
}
console.log(CAR, 'moved triangles', JSON.stringify(moved));
await doc.transform(prune({ keepAttributes: true, keepIndices: true, keepLeaves: true }), draco({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }));
await io.write(OUT, doc);
console.log('wrote', OUT);
