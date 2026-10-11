// 加裝零件的安裝尺寸（2026-10-11）：輸出 JSON 給 Blender 產生零件用。座標是 glTF 場景座標（Q50：公尺、y 朝上、+z 車頭）
//   trunk：行李廂蓋在尾翼腳位置的高度（x、z 網格上車漆最高點）
//   lip：前保桿底緣平面輪廓（每 2 cm 一格：最低點高度、那一圈最前面的 z）
//   wheels：四個輪圈中心、外緣
// 用法：node parts_measure_v1.mjs <glb> <輸出.json> <輪圈材質正則> <車漆材質正則> <排除材質正則（輪胎等）>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import fs from 'fs';
const [IN, OUT, RIM, PAINT, EXCL] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
const doc = await io.read(IN), v = [0, 0, 0];
const W = (M, p) => [0, 1, 2].map(r => M[r] * p[0] + M[4 + r] * p[1] + M[8 + r] * p[2] + M[12 + r]);
const paint = [], front = [], rim = [];
for (const n of doc.getRoot().listNodes()) { const me = n.getMesh(); if (!me) continue; const M = n.getWorldMatrix();
  for (const p of me.listPrimitives()) { const nm = p.getMaterial()?.getName() || '', pos = p.getAttribute('POSITION');
    const isP = new RegExp(PAINT).test(nm), isR = new RegExp(RIM).test(nm), ex = new RegExp(EXCL).test(nm) || /WHEEL/.test(n.getName());
    for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, v); const w = W(M, v);
      if (isP) paint.push(w); if (isR) rim.push(w); if (!ex && !isR && w[2] > 1.7) front.push(w); } } }
const top = (x, z, r = 0.03) => { let h = -9; for (const w of paint) if (Math.abs(w[0] - x) < r && Math.abs(w[2] - z) < r) h = Math.max(h, w[1]); return h; };
const trunk = []; for (const x of [-0.6, -0.42, 0, 0.42, 0.6]) for (let z = -2.34; z <= -1.85; z += 0.03) trunk.push([x, +z.toFixed(2), +top(x, z).toFixed(4)]);
const lip = [];
for (let x = -0.95; x <= 0.951; x += 0.02) { const s = front.filter(w => Math.abs(w[0] - x) < 0.01); if (s.length < 5) continue;
  const lo = Math.min(...s.map(w => w[1])); const near = s.filter(w => w[1] < lo + 0.03); const zf = Math.max(...near.map(w => w[2]));
  lip.push([+x.toFixed(2), +lo.toFixed(4), +zf.toFixed(4), +Math.max(...s.map(w => w[2])).toFixed(4)]); }
const mid = [0, 0, 0]; const wheels = {};
for (const w of rim) { const k = (w[2] > 0 ? 'F' : 'R') + (w[0] > 0 ? 'R' : 'L'); const b = wheels[k] ||= { mn: [9, 9, 9], mx: [-9, -9, -9] }; for (let d = 0; d < 3; d++) { b.mn[d] = Math.min(b.mn[d], w[d]); b.mx[d] = Math.max(b.mx[d], w[d]); } }
for (const b of Object.values(wheels)) { b.c = [0, 1, 2].map(d => +((b.mn[d] + b.mx[d]) / 2).toFixed(4)); b.r = +((b.mx[1] - b.mn[1]) / 2).toFixed(4); }
fs.writeFileSync(OUT, JSON.stringify({ trunk, lip, wheels }, null, 0));
console.log('trunk', trunk.filter(t => t[0] === 0.42).map(t => t[1] + ':' + t[2]).join(' '));
console.log('trunk x0', trunk.filter(t => t[0] === 0).map(t => t[1] + ':' + t[2]).join(' '));
console.log('lip', lip.length, 'pts; sample', lip.filter((_, i) => i % 8 === 0).map(l => l.join('/')).join('  '));
console.log('wheels', Object.entries(wheels).map(([k, b]) => k + ' c=' + b.c + ' r=' + b.r + ' x=' + b.mn[0].toFixed(3) + '..' + b.mx[0].toFixed(3)).join(' | '));
