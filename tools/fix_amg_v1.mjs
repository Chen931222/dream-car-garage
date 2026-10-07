// AMG GT 63（gt43.glb）的外觀材質與方向盤（2026-10-07）
//
// 外觀：這台是從遊戲模組零件包轉來的，轉檔時 61 個外觀零件被併成同一個 0.8 淺灰、沒有貼圖的材質
//      （gtishka_tailsignal_L_4），水箱罩直條、鍍鉻飾條、尾燈、反光片、車底全變成灰白色；
//      另一個叫 miniblack（黑色小件）的材質底色也是 0.8 淺灰，下保桿進氣口裡一塊塊白的就是它。
//      零件的節點名稱還留著原本的材質名（chromeMAT、stop、reflik、dno2…），照名字指回該有的材質。
// 內裝：儀表螢幕在左（左駕），方向盤整組（mesh.030、mesh.031）卻在右邊、而且低了 18 公分 → 整組平移，
//      讓方向盤中心對準轉向柱末端那個圓形中心墊（原本那台遊戲車的氣囊蓋，留在儀表板上）。
//      方向盤本身左右對稱，只平移、不鏡像、不轉角度。
//
// 用法：node tools/fix_amg_v1.mjs <輸入.glb> <輸出.glb>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, draco } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';

const [IN, OUT] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule(),
});
const doc = await io.read(IN);
const root = doc.getRoot();
const byName = n => root.listMaterials().find(m => m.getName() === n);

// ---- 新材質（名稱照配置器「發動引擎」的亮燈規則取：taillight 亮紅、signal 亮橙、headlight 亮白）----
function mat(name, base, metal, rough) {
  return doc.createMaterial(name).setBaseColorFactor([...base, 1]).setMetallicFactor(metal).setRoughnessFactor(rough);
}
const M = {
  chrome:    mat('amg_chrome', [0.92, 0.92, 0.92], 1, 0.12),
  mirror:    mat('amg_mirror', [0.90, 0.90, 0.90], 1, 0.02),
  headlight: mat('amg_headlight', [0.85, 0.85, 0.85], 1, 0.15),
  taillight: mat('amg_taillight', [0.36, 0.02, 0.03], 0, 0.12),
  signal:    mat('amg_signal', [0.30, 0.13, 0.02], 0, 0.15),   // 熄燈時的琥珀色燈殼，不要太亮
  engine:    mat('amg_engine', [0.10, 0.10, 0.11], 0.6, 0.5),
  black:     byName('gtishka_black'),
  glass:     byName('glass_clear'),
  carpet:    byName('interior_carpet'),
};
// 節點名稱裡的原始材質名 → 新材質（由上往下比，先比到的算數）
const RULES = [
  [/headlightmesh_glass/, 'glass'],
  [/headlightmesh/, 'headlight'],               // headlightmesh、headlightmeshdo：頭燈內殼
  // 左右後照鏡的鏡面：左邊叫 mirror_cx、右邊在原檔被取名 signal_R（兩塊形狀一樣、面積都是 313 cm²，左右對稱）。
  // 第一版照名字把 signal_R 當方向燈，結果右邊鏡面整片變橘
  [/mirror_cx|signal_R/, 'mirror'],
  [/reflik/, 'signal'],                         // 車頭兩側的反光片（在保桿高度、車頭 90% 處）
  [/stop|signalzad|tailsignal_L_7|_drl_|refract|chlm/, 'taillight'],   // 都在車尾 0–12%（chlm 在車尾上方，高位煞車燈）
  [/chrome|logotip/, 'chrome'],
  [/dno2|etk_common_acc|detali|nakleiki|_cam_/, 'black'],
  [/engine|_red_/, 'engine'],                   // 引擎室裡的零件，平常看不到
  [/carpet/, 'carpet'],
];
const OLD = /tailsignal_L_4/;
const moved = {}, left = [];
for (const n of root.listNodes()) {
  const mesh = n.getMesh(); if (!mesh) continue;
  for (const p of mesh.listPrimitives()) {
    if (!OLD.test(p.getMaterial()?.getName() || '')) continue;
    const rule = RULES.find(([re]) => re.test(n.getName()));
    if (!rule) { left.push(n.getName()); continue; }
    p.setMaterial(M[rule[1]]);
    moved[rule[1]] = (moved[rule[1]] || 0) + 1;
  }
}
// miniblack：黑色小件，底色改回黑
const mb = byName('gtishka_miniblack');
mb.setBaseColorFactor([0.025, 0.025, 0.025, 1]).setRoughnessFactor(0.45).setMetallicFactor(0);

// ---- 方向盤移到左邊 ----
// 量：方向盤整組的中心、儀表螢幕的中心（世界座標）
const xf = (Mx, v) => [Mx[0] * v[0] + Mx[4] * v[1] + Mx[8] * v[2] + Mx[12], Mx[1] * v[0] + Mx[5] * v[1] + Mx[9] * v[2] + Mx[13], Mx[2] * v[0] + Mx[6] * v[1] + Mx[10] * v[2] + Mx[14]];
function bounds(nodes) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity], e = [0, 0, 0];
  for (const top of nodes) top.traverse(n => {
    const mesh = n.getMesh(); if (!mesh) return; const W = n.getWorldMatrix();
    for (const p of mesh.listPrimitives()) { const a = p.getAttribute('POSITION');
      for (let i = 0; i < a.getCount(); i++) { a.getElement(i, e); const w = xf(W, e); for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], w[k]); mx[k] = Math.max(mx[k], w[k]); } } }
  });
  return { mn, mx, c: [0, 1, 2].map(k => (mn[k] + mx[k]) / 2) };
}
const wheelGroups = root.listNodes().filter(n => /^mesh\.03[01]$/.test(n.getName()));
if (wheelGroups.length !== 2) throw new Error('找不到方向盤的兩個群組：' + wheelGroups.map(n => n.getName()));
const gauges = root.listNodes().filter(n => /gauges?_screen/.test(n.getName()));
const wb = bounds(wheelGroups), gb = bounds(gauges);
if (Math.sign(wb.c[0]) === Math.sign(gb.c[0])) throw new Error('方向盤已經跟儀表同一邊了');
// 目標：轉向柱末端那個圓形中心墊（原本那台遊戲車方向盤的氣囊蓋，跟儀表板做成同一片），
// 用它中間的箭頭標誌定位：黑色儀表板網格裡一小塊獨立的零件（≤ 40 個頂點），在儀表那一側。
// 只對齊左右和高度；前後不動，AMG 方向盤的中心本來就在墊子前面約 1 公分，會把它蓋住。
function islands(node) {
  const W = node.getWorldMatrix(), p = node.getMesh().listPrimitives()[0], a = p.getAttribute('POSITION'), idx = p.getIndices().getArray(), nv = a.getCount(), e = [0, 0, 0], P = [];
  for (let i = 0; i < nv; i++) { a.getElement(i, e); P.push(xf(W, e)); }
  const key = new Map(), rep = new Int32Array(nv);
  for (let i = 0; i < nv; i++) { const k = P[i].map(v => Math.round(v * 1e4)).join(','); const h = key.get(k); if (h === undefined) { key.set(k, i); rep[i] = i; } else rep[i] = h; }
  const par = Int32Array.from({ length: nv }, (_, i) => i); const f = x => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  for (let t = 0; t < idx.length; t += 3) { const A = f(rep[idx[t]]), B = f(rep[idx[t + 1]]), D = f(rep[idx[t + 2]]); if (A !== B) par[B] = A; const A2 = f(A); if (A2 !== D) par[D] = A2; }
  const g = new Map(); for (let i = 0; i < nv; i++) { const r = f(rep[i]); if (!g.has(r)) g.set(r, []); g.get(r).push(P[i]); }
  return [...g.values()];
}
const dash = root.listNodes().find(n => n.getName() === 'mesh.161_gtishka_blackDASH_0');
const emblem = islands(dash).filter(pts => pts.length <= 40).map(pts => [0, 1, 2].map(k => pts.reduce((s, p) => s + p[k], 0) / pts.length))
  .filter(c => Math.abs(c[0] - gb.c[0]) < 0.1 && c[1] > 0.7 && c[1] < gb.mn[1])
  .sort((a, b) => Math.abs(a[0] - gb.c[0]) - Math.abs(b[0] - gb.c[0]))[0];
if (!emblem) throw new Error('找不到轉向柱上的標誌');
const hubNode = root.listNodes().find(n => n.getName() === 'mesh.030_gtishka_intLeatherSteeringWheelBump_0');
const hb = bounds([hubNode]);
const D = [emblem[0] - hb.c[0], emblem[1] - hb.c[1], 0];
console.log('wheel center', wb.c.map(v => v.toFixed(3)), 'hub', hb.c.map(v => v.toFixed(3)), 'column emblem', emblem.map(v => v.toFixed(3)), 'gauges', gb.c.map(v => v.toFixed(3)), 'move', D.map(v => v.toFixed(3)));
for (const g of wheelGroups) {
  const parent = g.getParentNode();
  const P = parent ? parent.getWorldMatrix() : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  // 世界座標的位移 → 父節點座標系裡的位移（父節點沒有旋轉時，只差一個縮放）
  if (Math.abs(P[1]) > 1e-6 || Math.abs(P[2]) > 1e-6 || Math.abs(P[4]) > 1e-6 || Math.abs(P[8]) > 1e-6) throw new Error('父節點有旋轉，這支腳本沒處理');
  const s = [Math.hypot(P[0], P[1], P[2]), Math.hypot(P[4], P[5], P[6]), Math.hypot(P[8], P[9], P[10])];
  const t = g.getTranslation();
  g.setTranslation([t[0] + D[0] / s[0], t[1] + D[1] / s[1], t[2] + D[2] / s[2]]);
}
const wb2 = bounds(wheelGroups);
console.log('wheel center after', wb2.c.map(v => v.toFixed(3)), 'x range', wb2.mn[0].toFixed(2), wb2.mx[0].toFixed(2), 'gauges x range', gb.mn[0].toFixed(2), gb.mx[0].toFixed(2));

await doc.transform(prune(), draco());
await io.write(OUT, doc);
console.log('moved', JSON.stringify(moved), 'left on old material', left.length, JSON.stringify(left));
console.log('WROTE', OUT);
