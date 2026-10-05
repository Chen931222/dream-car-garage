// 車高滑桿擴到其他車（2026-10-04）。原本只有 W202 有。
//
// 做法跟 W202 一樣（那台是更早在 Blender 裡做的），
// 這裡改用 glTF-Transform 直接改檔：不經過 Blender 匯入匯出，材質、貼圖、擴充原封不動。
//   1. 找四個輪子：輪胎的頂點分四個象限，各自的外框＝輪子中心、半徑、寬度。
//      Macan、CX-5 的輪胎跟全車的黑色零件合成一塊，沒有輪胎材質可以認：
//      改用最低處的頂點分四群找接地點，再掃半徑，找最多頂點落在圓周上的那個圓。
//   2. 分組：整塊落在輪子圓柱裡（1.05R）的零件跟輪子走；
//      跨在兩邊的零件，把三個頂點都在 split·R 以內的面切出來跟輪子走（輪轂、中央蓋、合併在一起的輪胎）。
//   3. 量輪拱縫隙：從輪胎上半圈往正上方打光線，打到車身的最短距離。
//      輪拱裡面的黑色內襯不算（liner）：實車降低後輪胎吃進內襯很常見，從外面看不到。
//      算的是外面看得到的烤漆和外飾板，扣 5 mm 餘裕、以 5 mm 為一格，最多 40 mm（跟 W202 一樣）＝滑桿上限 maxMM。
//      每台的 liner 是看輪拱特寫判斷的（_design-check/_test_ride_arches.mjs，2026-10-04）。
//   4. 車身掛到 RIDE_BODY、輪子掛到 WHEELS（世界座標不變），烘一段 ride 動畫：0 秒原廠、1 秒降 40 mm。
//      每台都烘 40 mm，配置器的滑桿上限另外設（garage.html 的 ride.max），跟 W202 同一段程式。
//   AMG 不做：原廠高度時前輪上方的車身只離輪胎 1.4 mm，一降就穿模。
//
// 用法：node tools/add_ride_v1.mjs <車> <輸入.glb> <輸出.glb> [--measure]
//   --measure：只量、不寫檔
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, draco, compactPrimitive } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';

// up：模型檔裡哪個軸朝上（0 x、1 y、2 z）；mpu：一個模型單位幾公尺（同 garage.html 的 scale）
// tireMat／tireNode：用哪個材質或節點名找輪子；auto：沒有可認的輪胎，用接地點加圓擬合
// split：跨在兩邊的零件，切多大的圓跟輪子走（輪胎有獨立材質的車只需要輪轂一帶，0.62 跟 W202 一樣）
// liner：輪拱裡面的內襯材質，量縫隙時不算
const CFG = {
  mx5:     { up: 2, mpu: 0.01, tireMat: /^tire$/,  split: 0.62, liner: /^black$/ },
  x5:      { up: 1, mpu: 100,  tireMat: /^tire$/,  split: 0.62, liner: /^chassis$/ },        // 外面那圈黑色塑膠飾板（plastic）要算
  q50:     { up: 1, mpu: 1,    tireMat: /^tire1$/, split: 0.62 },
  mazda3:  { up: 1, mpu: 100,  tireMat: /Tyre/,    split: 0.62, liner: /Exhaust_621|Engine_053/ },
  mustang: { up: 1, mpu: 100,  tireMat: /Wheel1A/, split: 0.62, liner: /Base_Material/ },
  macan:   { up: 1, mpu: 0.26, auto: true,         split: 1.04, liner: /^Leftwiper1Mtl$/ },
  cx5:     { up: 1, mpu: 1,    auto: true,         split: 1.04 },
};
const RANGE_MM = 40, MAX_MM = 40, MARGIN_MM = 5, STEP_MM = 5;

const args = process.argv.slice(2);
const [CAR, IN, OUT] = args;
const MEASURE = args.includes('--measure');
const C = CFG[CAR]; if (!C) throw new Error('沒有這台車的設定：' + CAR);

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule(),
});
const doc = await io.read(IN);
const root = doc.getRoot();
if (root.listSkins().length) throw new Error('有骨架，這支腳本不處理');
if (root.listAnimations().length) throw new Error('已經有動畫了：' + root.listAnimations().map(a => a.getName()));

const xf = (M, v) => [M[0] * v[0] + M[4] * v[1] + M[8] * v[2] + M[12], M[1] * v[0] + M[5] * v[1] + M[9] * v[2] + M[13], M[2] * v[0] + M[6] * v[1] + M[10] * v[2] + M[14]];

// ---- 網格被多個節點共用的，先複製一份（之後只換 primitive、不改原本的） ----
const meshNodes = root.listNodes().filter(n => n.getMesh());
const seen = new Set();
for (const n of meshNodes) { const m = n.getMesh(); if (seen.has(m)) n.setMesh(m.clone()); else seen.add(m); }
const WORLD = new Map(meshNodes.map(n => [n, n.getWorldMatrix().slice()]));

// ---- 每個 primitive 的世界座標 ----
const items = [];
const cmin = [Infinity, Infinity, Infinity], cmax = [-Infinity, -Infinity, -Infinity];
for (const n of meshNodes) {
  const M = WORLD.get(n);
  for (const prim of n.getMesh().listPrimitives()) {
    const pos = prim.getAttribute('POSITION'); if (!pos) continue;
    if (prim.getMode() !== 4) throw new Error('不是三角形：' + n.getName());
    const cnt = pos.getCount(), w = new Float64Array(cnt * 3), e = [0, 0, 0];
    for (let i = 0; i < cnt; i++) { pos.getElement(i, e); const p = xf(M, e); w[i * 3] = p[0]; w[i * 3 + 1] = p[1]; w[i * 3 + 2] = p[2];
      for (let k = 0; k < 3; k++) { if (p[k] < cmin[k]) cmin[k] = p[k]; if (p[k] > cmax[k]) cmax[k] = p[k]; } }
    const ia = prim.getIndices(); const idx = ia ? Uint32Array.from(ia.getArray()) : Uint32Array.from({ length: cnt }, (_, i) => i);
    items.push({ node: n, prim, w, idx, mat: prim.getMaterial() ? prim.getMaterial().getName() : '' });
  }
}
const UP = C.up, H = [0, 1, 2].filter(k => k !== UP);
const LEN = (cmax[H[0]] - cmin[H[0]]) >= (cmax[H[1]] - cmin[H[1]]) ? H[0] : H[1], WID = H[0] === LEN ? H[1] : H[0];
const carH = cmax[UP] - cmin[UP];
const u2m = v => v * C.mpu, m2u = v => v / C.mpu;
const midL = (cmin[LEN] + cmax[LEN]) / 2, midW = (cmin[WID] + cmax[WID]) / 2;
const quad = (l, w) => (l > midL ? 2 : 0) + (w > midW ? 1 : 0);

// ---- 1. 四個輪子 ----
let WHEELS = [];
if (!C.auto) {
  const g = [0, 1, 2, 3].map(() => ({ mn: [Infinity, Infinity, Infinity], mx: [-Infinity, -Infinity, -Infinity], n: 0 }));
  for (const it of items) {
    const hit = C.tireMat ? C.tireMat.test(it.mat) : C.tireNode.test(it.node.getName());
    if (!hit) continue;
    for (let i = 0; i < it.w.length; i += 3) {
      const q = g[quad(it.w[i + LEN], it.w[i + WID])]; q.n++;
      for (let k = 0; k < 3; k++) { const v = it.w[i + k]; if (v < q.mn[k]) q.mn[k] = v; if (v > q.mx[k]) q.mx[k] = v; }
    }
  }
  if (g.some(q => !q.n)) throw new Error('四個象限沒有都找到輪胎');
  WHEELS = g.map(q => ({ cl: (q.mn[LEN] + q.mx[LEN]) / 2, cu: (q.mn[UP] + q.mx[UP]) / 2, r: (q.mx[UP] - q.mn[UP]) / 2, w0: q.mn[WID], w1: q.mx[WID] }));
} else {
  // 合併網格裡，每個零件還是各自獨立的一塊（頂點不相連）。拆成一塊一塊（同位置的頂點先焊在一起，避開 UV 接縫），
  // 找「底部碰地、外框接近正圓、直徑 0.45–0.95 公尺」的那塊＝輪胎，每個象限取最大的。
  const ground = cmin[UP], comps = [];
  const qz = m2u(0.0001);
  for (const it of items) {
    const nv = it.w.length / 3, rep = new Int32Array(nv), key = new Map();
    for (let i = 0; i < nv; i++) {
      const k = Math.round(it.w[i * 3] / qz) + ',' + Math.round(it.w[i * 3 + 1] / qz) + ',' + Math.round(it.w[i * 3 + 2] / qz);
      const h = key.get(k); if (h === undefined) { key.set(k, i); rep[i] = i; } else rep[i] = h;
    }
    const par = Int32Array.from({ length: nv }, (_, i) => i);
    const find = x => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
    for (let f = 0; f < it.idx.length; f += 3) {
      const a = find(rep[it.idx[f]]), b = find(rep[it.idx[f + 1]]), c = find(rep[it.idx[f + 2]]);
      if (a !== b) par[b] = a; const a2 = find(a); if (a2 !== c) par[c] = a2;
    }
    const box = new Map();
    for (let i = 0; i < nv; i++) {
      const r = find(rep[i]); let bx = box.get(r);
      if (!bx) { bx = { mn: [Infinity, Infinity, Infinity], mx: [-Infinity, -Infinity, -Infinity], n: 0 }; box.set(r, bx); }
      bx.n++; for (let k = 0; k < 3; k++) { const v = it.w[i * 3 + k]; if (v < bx.mn[k]) bx.mn[k] = v; if (v > bx.mx[k]) bx.mx[k] = v; }
    }
    for (const bx of box.values()) comps.push({ ...bx, mat: it.mat });
  }
  const best = [null, null, null, null];
  for (const c of comps) {
    const d = c.mx[UP] - c.mn[UP], dl = c.mx[LEN] - c.mn[LEN], dm = u2m(d);
    if (c.mn[UP] > ground + 0.015 * carH || dm < 0.45 || dm > 0.95 || Math.abs(dl / d - 1) > 0.15) continue;
    const q = quad((c.mn[LEN] + c.mx[LEN]) / 2, (c.mn[WID] + c.mx[WID]) / 2);
    if (!best[q] || d > best[q].mx[UP] - best[q].mn[UP]) best[q] = c;
  }
  if (best.some(b => !b)) throw new Error('有象限找不到輪胎：' + best.map(b => !!b));
  WHEELS = best.map(c => ({ cl: (c.mn[LEN] + c.mx[LEN]) / 2, cu: (c.mn[UP] + c.mx[UP]) / 2, r: (c.mx[UP] - c.mn[UP]) / 2, w0: c.mn[WID], w1: c.mx[WID], from: `${c.mat} ${c.n}v` }));
}
const pad = m2u(0.04);
function inWheel(x, y, z, k) {
  const p = [x, y, z];
  for (const W of WHEELS) {
    if (p[WID] < W.w0 - pad || p[WID] > W.w1 + pad) continue;
    if (Math.hypot(p[UP] - W.cu, p[LEN] - W.cl) <= k * W.r) return true;
  }
  return false;
}
const upSign = WHEELS.every(W => W.cu < (cmin[UP] + cmax[UP]) / 2) ? 1 : -1;
if (upSign < 0) throw new Error('輪子不在下方，上方軸設錯了');

// ---- 2. 分組 ----
const stats = { wholeWheel: [], split: [], body: 0 };
for (const it of items) {
  const nv = it.w.length / 3, in105 = new Uint8Array(nv), inS = new Uint8Array(nv);
  const intr = /^INT_/.test(it.node.getName());        // 內裝永遠跟車身走（W202、MX-5 的 INT_ 零件）
  let all = !intr;
  for (let i = 0; i < nv; i++) {
    if (intr) break;
    const x = it.w[i * 3], y = it.w[i * 3 + 1], z = it.w[i * 3 + 2];
    in105[i] = inWheel(x, y, z, 1.05); inS[i] = inWheel(x, y, z, C.split);
    if (!in105[i]) all = false;
  }
  if (all && nv) { it.kind = 'wheel'; stats.wholeWheel.push(it.mat || it.node.getName()); continue; }
  const wf = [], bf = [];
  for (let f = 0; f < it.idx.length; f += 3) {
    const a = it.idx[f], b = it.idx[f + 1], c = it.idx[f + 2];
    (!intr && inS[a] && inS[b] && inS[c] ? wf : bf).push(a, b, c);
  }
  if (wf.length && bf.length) { it.kind = 'split'; it.wf = wf; it.bf = bf; stats.split.push(`${it.mat || it.node.getName()} ${wf.length / 3}/${it.idx.length / 3}`); }
  else if (wf.length) { it.kind = 'wheel'; stats.wholeWheel.push(it.mat || it.node.getName()); }
  else { it.kind = 'body'; stats.body++; }
}

// ---- 3. 輪拱縫隙 ----
const tris = [], triMat = [];   // 車身三角形，9 個數一組；triMat：每個三角形的材質（診斷用：最近的是葉子板還是內襯）
for (const it of items) {
  if (it.kind === 'wheel') continue;
  const f = it.kind === 'split' ? it.bf : it.idx;
  for (let i = 0; i < f.length; i++) { const v = f[i] * 3; tris.push(it.w[v], it.w[v + 1], it.w[v + 2]); if (i % 3 === 0) triMat.push(it.mat || it.node.getName()); }
}
const T = Float64Array.from(tris);
const clear = WHEELS.map(W => {
  const L0 = W.cl - 1.05 * W.r, L1 = W.cl + 1.05 * W.r, U0 = W.cu, U1 = W.cu + 2.5 * W.r;
  const cand = [];
  for (let t = 0; t < T.length; t += 9) {
    let lmin = Infinity, lmax = -Infinity, wmin = Infinity, wmax = -Infinity, umin = Infinity, umax = -Infinity;
    for (let v = 0; v < 9; v += 3) {
      const l = T[t + v + LEN], w = T[t + v + WID], u = T[t + v + UP];
      if (l < lmin) lmin = l; if (l > lmax) lmax = l; if (w < wmin) wmin = w; if (w > wmax) wmax = w; if (u < umin) umin = u; if (u > umax) umax = u;
    }
    if (lmax < L0 || lmin > L1 || wmax < W.w0 || wmin > W.w1 || umax < U0 || umin > U1) continue;
    cand.push(t);
  }
  let best = Infinity, at = null, hitMat = null, vis = Infinity;
  const perMat = {};                 // 每個材質各自最近多少（看第二近的是誰）
  for (let th = 15; th <= 165; th += 2.5) {
    const rad = th * Math.PI / 180, pl = W.cl + W.r * Math.cos(rad), pu = W.cu + W.r * Math.sin(rad);
    for (let f = 0.05; f < 1; f += 0.1) {
      const pw = W.w0 + f * (W.w1 - W.w0);
      for (const t of cand) {
        const ax = T[t + LEN], ay = T[t + WID], bx = T[t + 3 + LEN], by = T[t + 3 + WID], cx = T[t + 6 + LEN], cy = T[t + 6 + WID];
        const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy); if (Math.abs(d) < 1e-18) continue;
        const a = ((by - cy) * (pl - cx) + (cx - bx) * (pw - cy)) / d, b = ((cy - ay) * (pl - cx) + (ax - cx) * (pw - cy)) / d, c = 1 - a - b;
        if (a < 0 || b < 0 || c < 0) continue;
        const h = a * T[t + UP] + b * T[t + 3 + UP] + c * T[t + 6 + UP] - pu;
        if (h >= 0) { const m = triMat[t / 9]; if (!(m in perMat) || h < perMat[m]) perMat[m] = h; if (h < best) { best = h; at = th; hitMat = m; }
          if (!(C.liner && C.liner.test(m)) && h < vis) vis = h; }
      }
    }
  }
  const near = Object.entries(perMat).sort((a, b) => a[1] - b[1]).slice(0, 4).map(([m, h]) => `${m} ${(u2m(h) * 1000).toFixed(1)}`);
  return { mm: u2m(best) * 1000, visMM: u2m(vis) * 1000, at, cand: cand.length, hitMat, near };
});
const minVis = Math.min(...clear.map(c => c.visMM));
const maxMM = Math.max(0, Math.min(MAX_MM, Math.floor((minVis - MARGIN_MM) / STEP_MM) * STEP_MM));

const name = ['後左', '後右', '前左', '前右'];   // 象限編號只是代號，前後要看車頭朝哪邊
console.log(JSON.stringify({
  car: CAR, axes: { up: 'xyz'[UP], len: 'xyz'[LEN], wid: 'xyz'[WID] },
  sizeM: [u2m(cmax[LEN] - cmin[LEN]), u2m(carH), u2m(cmax[WID] - cmin[WID])].map(v => +v.toFixed(3)),
  wheels: WHEELS.map((W, i) => ({ q: i, from: W.from, rM: +u2m(W.r).toFixed(3), widthM: +u2m(W.w1 - W.w0).toFixed(3), clearMM: +clear[i].mm.toFixed(1), visibleMM: +clear[i].visMM.toFixed(1), atDeg: clear[i].at, near: clear[i].near.join(' | ') })),
  wholeWheel: stats.wholeWheel, split: stats.split, bodyPrims: stats.body, maxMM, rangeMM: RANGE_MM,
}, null, 1));
if (MEASURE) process.exit(0);
if (!maxMM) throw new Error('縫隙不夠，不能降');

// ---- 4. 改結構、烘動畫 ----
const buf = root.listBuffers()[0];
const scene = root.getDefaultScene() || root.listScenes()[0];
function subPrim(prim, faces) {
  const p = prim.clone();
  p.setIndices(doc.createAccessor().setType('SCALAR').setArray(Uint32Array.from(faces)).setBuffer(buf));
  compactPrimitive(p);                 // 只留用到的頂點，各自獨立（Draco 不喜歡共用的頂點資料）
  return p;
}
function detach(n) {
  const p = n.getParentNode();
  if (p) p.removeChild(n); else for (const s of root.listScenes()) s.removeChild(n);
}
const ride = doc.createNode('RIDE_BODY'), wheels = doc.createNode('WHEELS');
const byNode = new Map();
for (const it of items) { if (!byNode.has(it.node)) byNode.set(it.node, []); byNode.get(it.node).push(it); }
let maxErr = 0;
for (const n of meshNodes) {
  const M = WORLD.get(n), mesh = n.getMesh(), its = byNode.get(n) || [];
  const wheelPrims = [];
  for (const it of its) {
    if (it.kind === 'wheel') { mesh.removePrimitive(it.prim); wheelPrims.push(it.prim); }
    else if (it.kind === 'split') {
      const pw = subPrim(it.prim, it.wf), pb = subPrim(it.prim, it.bf);
      mesh.removePrimitive(it.prim); mesh.addPrimitive(pb); wheelPrims.push(pw);
    }
  }
  detach(n); n.setMatrix(M);
  const back = n.getMatrix(); for (let k = 0; k < 16; k++) maxErr = Math.max(maxErr, Math.abs(back[k] - M[k]));
  if (mesh.listPrimitives().length) {
    ride.addChild(n);
    if (wheelPrims.length) {
      const wm = doc.createMesh(mesh.getName() + '_WHEEL'); wheelPrims.forEach(p => wm.addPrimitive(p));
      wheels.addChild(doc.createNode(n.getName() + '_WHEEL').setMesh(wm).setMatrix(M));
    }
  } else {
    wheelPrims.forEach(p => mesh.addPrimitive(p));
    wheels.addChild(n);
  }
}
if (maxErr > 1e-4 * Math.max(...cmax.map(Math.abs), 1)) throw new Error('重新掛節點後位置跑掉：' + maxErr);
scene.addChild(ride); scene.addChild(wheels);

const down = [0, 0, 0]; down[UP] = -upSign * m2u(RANGE_MM / 1000);
const tIn = doc.createAccessor('ride_t').setType('SCALAR').setArray(new Float32Array([0, 1])).setBuffer(buf);
const tOut = doc.createAccessor('ride_v').setType('VEC3').setArray(new Float32Array([0, 0, 0, ...down])).setBuffer(buf);
const sampler = doc.createAnimationSampler().setInput(tIn).setOutput(tOut).setInterpolation('LINEAR');
const channel = doc.createAnimationChannel().setTargetNode(ride).setTargetPath('translation').setSampler(sampler);
doc.createAnimation('ride').addSampler(sampler).addChannel(channel);

await doc.transform(prune(), draco());
await io.write(OUT, doc);
console.log('WROTE', OUT, 'range', RANGE_MM, 'mm', 'slider max', maxMM, 'mm', 'reparent max err', maxErr.toExponential(2));
