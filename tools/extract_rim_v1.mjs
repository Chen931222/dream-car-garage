// 把一台車的原廠輪圈抽成獨立的輪圈檔（2026-10-11）：給別台車換輪圈用（web-deploy/wheels/<key>.glb）
// 取一顆外側朝 +橫向 的輪子：wheel_fit_v1.mjs 量到的輪圈 primitive（含中心蓋、廠徽）裡，落在這顆輪子圓柱內的三角形。
// 換到統一座標：原點＝輪圈外緣平面的中心、+X＝往外、+Y＝上、Z＝長度方向（右手系），單位公尺。材質、貼圖照原樣。
// 另外量：R（唇邊半徑）、width（寬）、faceDepth（半徑 0.3–0.85R 之間最深的點，裝到別台時拿來比卡鉗深度）
// 用法：node extract_rim_v1.mjs <原車模.glb> <wheelfit.json> <輸出.glb> <key> <名稱>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { draco, prune, compactPrimitive } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import fs from 'fs';
const [IN, FIT, OUT, KEY, NAME] = process.argv.slice(2);
const fit = JSON.parse(fs.readFileSync(FIT, 'utf8'));
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(), 'draco3d.encoder': await draco3d.createEncoderModule() });
const doc = await io.read(IN), root = doc.getRoot(), scene = root.listScenes()[0], buf = root.listBuffers()[0];
const { k, upAx: up, lenAx: ln, latAx: lat } = fit;
const W0 = (M, p) => [0, 1, 2].map(r => M[r] * p[0] + M[4 + r] * p[1] + M[8 + r] * p[2] + M[12 + r]);
const rcut0 = (fit.hide.find(h => h.rcut) || {}).rcut;
function countIn(w) { let n = 0; const v = [0, 0, 0];
  for (const h of fit.hide) { const nd = root.listNodes().find(x => x.getName() === h.node), p = nd.getMesh().listPrimitives()[h.pi], M = nd.getWorldMatrix(), pos = p.getAttribute('POSITION');
    for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, v); const q = W0(M, v); if (Math.hypot(q[fit.upAx] - w.c[fit.upAx], q[fit.lenAx] - w.c[fit.lenAx]) / fit.k <= (rcut0 || w.R * 1.08)) n++; } } return n; }
const wh = fit.wheels.map(w => [w, countIn(w)]).sort((a, b) => b[1] - a[1])[0][0];
const s = wh.s;
// 右手系：X＝s·e_lat、Y＝e_up、Z＝zs·e_len，行列式要是 +1
const E = (ax, sg) => { const e = [0, 0, 0]; e[ax] = sg; return e; };
const det = (a, b, c) => a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
const zs = det(E(lat, s), E(up, 1), E(ln, s)) > 0 ? s : -s;
const toLocal = w => [s * (w[lat] - wh.outer) / k, (w[up] - wh.c[up]) / k, zs * (w[ln] - wh.c[ln]) / k];
const dirLocal = d => [s * d[lat], d[up], zs * d[ln]];
const W = (M, p) => [0, 1, 2].map(r => M[r] * p[0] + M[4 + r] * p[1] + M[8 + r] * p[2] + M[12 + r]);
function normalMat(M) {   // 3×3 的反轉置
  const a = [M[0], M[1], M[2]], b = [M[4], M[5], M[6]], c = [M[8], M[9], M[10]];
  const x = [b[1] * c[2] - b[2] * c[1], b[2] * c[0] - b[0] * c[2], b[0] * c[1] - b[1] * c[0]];
  const y = [c[1] * a[2] - c[2] * a[1], c[2] * a[0] - c[0] * a[2], c[0] * a[1] - c[1] * a[0]];
  const z = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  return n => { const o = [x[0] * n[0] + y[0] * n[1] + z[0] * n[2], x[1] * n[0] + y[1] * n[1] + z[1] * n[2], x[2] * n[0] + y[2] * n[1] + z[2] * n[2]]; const L = Math.hypot(...o) || 1; return o.map(v => v / L); };
}
const rmax = (fit.hide.find(h => h.rcut) || {}).rcut || wh.R * 1.08;
const mesh = doc.createMesh('rim'); let tris = 0, flips = 0; const v = [0, 0, 0], e = [];
for (const h of fit.hide) {
  const n = root.listNodes().find(x => x.getName() === h.node), p = n.getMesh().listPrimitives()[h.pi];
  const M = n.getWorldMatrix(), NM = normalMat(M), pos = p.getAttribute('POSITION'), idx = p.getIndices();
  const world = []; for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, v); world.push(W(M, v)); }
  const inWheel = i => { const w = world[i]; const r = Math.hypot(w[up] - wh.c[up], w[ln] - wh.c[ln]) / k, a = s * (w[lat] - wh.outer) / k;   // a：離外緣平面多遠（往外為正）
    return r <= rmax && a >= -wh.width - 0.02 && a <= 0.06; };
  // 來源節點是鏡像的（3×3 行列式 < 0，例如右輪是左輪鏡像過去的）：烘進頂點以後三角形正反面會翻，要把頂點順序反過來
  const flip = det([M[0], M[1], M[2]], [M[4], M[5], M[6]], [M[8], M[9], M[10]]) < 0;
  const take = []; for (let t = 0; t < idx.getCount(); t += 3) { const a = idx.getScalar(t), b = idx.getScalar(t + 1), c = idx.getScalar(t + 2); if (inWheel(a) && inWheel(b) && inWheel(c)) flip ? take.push(a, c, b) : take.push(a, b, c); }
  if (!take.length) continue;
  const q = doc.createPrimitive().setMaterial(p.getMaterial()).setMode(p.getMode());
  for (const sem of p.listSemantics()) {
    const acc = p.getAttribute(sem), out = [], e = new Array(acc.getElementSize()).fill(0);   // 每種屬性各用自己長度的暫存陣列（共用的話 UV 會多塞一個數、整個錯位）
    for (let i = 0; i < acc.getCount(); i++) { acc.getElement(i, e);
      if (sem === 'POSITION') out.push(...toLocal(world[i]));
      else if (sem === 'NORMAL') out.push(...dirLocal(NM(e)));
      else if (sem === 'TANGENT') { const d = W([M[0], M[1], M[2], 0, M[4], M[5], M[6], 0, M[8], M[9], M[10], 0, 0, 0, 0, 1], e.slice(0, 3)); const L = Math.hypot(...d) || 1; out.push(...dirLocal(d.map(x => x / L)), e[3]); }
      else out.push(...e); }
    q.setAttribute(sem, doc.createAccessor().setType(acc.getType()).setArray(new Float32Array(out)).setBuffer(buf));
  }
  q.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(take)).setBuffer(buf));
  compactPrimitive(q); mesh.addPrimitive(q); tris += take.length / 3; if (flip) flips++;
}
for (const a of root.listAnimations()) a.dispose();
for (const c of scene.listChildren().slice()) scene.removeChild(c);
for (const n of root.listNodes()) n.dispose();
for (const m of root.listMeshes()) if (m !== mesh) m.dispose();
scene.addChild(doc.createNode('rim').setMesh(mesh));
await doc.transform(prune());
// 量尺寸
let R = 0, width = 0; const depth = new Array(20).fill(0);   // depth[i]：半徑在 i×5%～(i+1)×5% R 之間最深的點（公尺）
for (const p of mesh.listPrimitives()) { const pos = p.getAttribute('POSITION');
  for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, v); const r = Math.hypot(v[1], v[2]); R = Math.max(R, r); width = Math.max(width, -v[0]); } }
for (const p of mesh.listPrimitives()) { const pos = p.getAttribute('POSITION');
  for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, v); const b = Math.min(19, Math.floor(Math.hypot(v[1], v[2]) / R * 20)); depth[b] = Math.max(depth[b], -v[0]); } }
await doc.transform(draco({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }));
await io.write(OUT, doc);
const info = { key: KEY, name: NAME, flips, R: +R.toFixed(4), width: +width.toFixed(4), depth: depth.map(x => +x.toFixed(3)), tris, bytes: fs.statSync(OUT).size };
console.log(JSON.stringify(info));
