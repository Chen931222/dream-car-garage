// 看一台車有沒有內裝可看（2026-10-05，評估「看內裝」能不能開放給所有車）
// 1. 車艙範圍（車長 30–70%、車寬 20–80%、車高 30–80%）裡有多少頂點、是哪些材質
// 2. 每個材質是不是透明的（玻璃）：沒有透明玻璃，從車外、車內都看不到東西
// 用法：node tools/inspect_cabin_v1.mjs <glb> <上方軸 y|z>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
const [IN, UPA = 'y'] = process.argv.slice(2);
const UP = UPA === 'z' ? 2 : 1;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
const doc = await io.read(IN); const root = doc.getRoot();
const xf = (M, v) => [M[0] * v[0] + M[4] * v[1] + M[8] * v[2] + M[12], M[1] * v[0] + M[5] * v[1] + M[9] * v[2] + M[13], M[2] * v[0] + M[6] * v[1] + M[10] * v[2] + M[14]];
const parts = []; const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
for (const n of root.listNodes()) {
  const mesh = n.getMesh(); if (!mesh) continue; const M = n.getWorldMatrix();
  for (const p of mesh.listPrimitives()) {
    const a = p.getAttribute('POSITION'); const e = [0, 0, 0]; const w = new Float64Array(a.getCount() * 3);
    for (let i = 0; i < a.getCount(); i++) { a.getElement(i, e); const q = xf(M, e); w.set(q, i * 3); for (let k = 0; k < 3; k++) { if (q[k] < mn[k]) mn[k] = q[k]; if (q[k] > mx[k]) mx[k] = q[k]; } }
    parts.push({ mat: p.getMaterial(), w });
  }
}
const H = [0, 1, 2].filter(k => k !== UP);
const LEN = (mx[H[0]] - mn[H[0]]) >= (mx[H[1]] - mn[H[1]]) ? H[0] : H[1], WID = H[0] === LEN ? H[1] : H[0];
const f = (v, k) => (v - mn[k]) / (mx[k] - mn[k]);
const byMat = {}; let total = 0;
for (const P of parts) {
  const name = P.mat ? P.mat.getName() : '(none)'; let n = 0;
  for (let i = 0; i < P.w.length; i += 3) {
    const l = f(P.w[i + LEN], LEN), w = f(P.w[i + WID], WID), u = f(P.w[i + UP], UP);
    if (l > 0.3 && l < 0.7 && w > 0.2 && w < 0.8 && u > 0.3 && u < 0.8) n++;
  }
  byMat[name] = (byMat[name] || 0) + n; total += n;
}
console.log('車艙範圍內的頂點：', total);
for (const [m, n] of Object.entries(byMat).sort((a, b) => b[1] - a[1])) if (n) console.log('  ', String(n).padStart(7), m);
console.log('材質是否透明：');
for (const m of root.listMaterials()) {
  const tr = m.getExtension('KHR_materials_transmission');
  console.log('  ', m.getName().padEnd(40), 'alphaMode', m.getAlphaMode(), 'alpha', +m.getBaseColorFactor()[3].toFixed(2), tr ? 'transmission ' + tr.getTransmissionFactor() : '');
}
