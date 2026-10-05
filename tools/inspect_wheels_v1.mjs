// 找輪子用的偵察（2026-10-04，車高滑桿要擴到其他車）
// 每個材質在整台車裡的位置：頂點數、外框（用車高／車長／車寬的比例表示），
// 以及「有多少頂點落在四個角落的低處」——輪胎、輪圈、煞車都集中在那裡。
// 用法：node tools/inspect_wheels_v1.mjs <glb> <上方軸 y|z>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';

const [IN, UPA = 'y'] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
});
const doc = await io.read(IN);
const root = doc.getRoot();
const UP = UPA === 'z' ? 2 : 1;

function xf(M, v) {   // glTF-Transform 的矩陣是 column-major
  return [M[0] * v[0] + M[4] * v[1] + M[8] * v[2] + M[12], M[1] * v[0] + M[5] * v[1] + M[9] * v[2] + M[13], M[2] * v[0] + M[6] * v[1] + M[10] * v[2] + M[14]];
}
const parts = [];
const gmin = [Infinity, Infinity, Infinity], gmax = [-Infinity, -Infinity, -Infinity];
for (const node of root.listNodes()) {
  const mesh = node.getMesh(); if (!mesh) continue;
  const M = node.getWorldMatrix();
  for (const p of mesh.listPrimitives()) {
    const pos = p.getAttribute('POSITION'); if (!pos) continue;
    const pts = new Float32Array(pos.getCount() * 3); const e = [0, 0, 0];
    for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, e); const w = xf(M, e); pts.set(w, i * 3);
      for (let k = 0; k < 3; k++) { if (w[k] < gmin[k]) gmin[k] = w[k]; if (w[k] > gmax[k]) gmax[k] = w[k]; } }
    parts.push({ node: node.getName(), mat: p.getMaterial() ? p.getMaterial().getName() : '(none)', pts });
  }
}
const H = [0, 1, 2].filter(k => k !== UP);
const LEN = (gmax[H[0]] - gmin[H[0]]) >= (gmax[H[1]] - gmin[H[1]]) ? H[0] : H[1], WID = H[0] === LEN ? H[1] : H[0];
const size = k => gmax[k] - gmin[k];
console.log(`car size  up ${size(UP).toPrecision(4)}  len ${size(LEN).toPrecision(4)}  wid ${size(WID).toPrecision(4)}  (axes up=${'xyz'[UP]} len=${'xyz'[LEN]} wid=${'xyz'[WID]})`);
const f = (v, k) => (v - gmin[k]) / size(k);
const rows = [];
for (const P of parts) {
  const n = P.pts.length / 3; let corner = 0; const mn = [1, 1, 1], mx = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const u = f(P.pts[i * 3 + UP], UP), l = f(P.pts[i * 3 + LEN], LEN), w = f(P.pts[i * 3 + WID], WID);
    for (const [k, v] of [[0, u], [1, l], [2, w]]) { if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v; }
    // 四個角落的低處：高度在下半部、長度在前後 35% 以內、寬度在左右 30% 以內
    if (u < 0.5 && (l < 0.35 || l > 0.65) && (w < 0.3 || w > 0.7)) corner++;
  }
  rows.push({ mat: P.mat, node: P.node, n, corner: corner / n, up: [mn[0], mx[0]], len: [mn[1], mx[1]], wid: [mn[2], mx[2]] });
}
rows.sort((a, b) => b.corner - a.corner || b.n - a.n);
const r2 = a => a.map(v => v.toFixed(2)).join('–');
for (const r of rows) console.log(`${(r.corner * 100).toFixed(0).padStart(3)}% corner  ${String(r.n).padStart(7)} v  up ${r2(r.up)}  len ${r2(r.len)}  wid ${r2(r.wid)}  ${r.mat}  [${r.node}]`);
