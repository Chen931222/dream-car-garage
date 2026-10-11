// 加裝零件前置量測（2026-10-11）：車高動畫動哪些節點、輪圈中心／半徑、車漆在車頭車尾的外形
// 用法：node parts_probe_v1.mjs <glb> <車代號> <輪圈材質正則> <車漆材質正則>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
const [IN, CAR, RIM, PAINT] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
const doc = await io.read(IN), root = doc.getRoot(), v = [0, 0, 0];
const W = (M, p) => [0, 1, 2].map(r => M[r] * p[0] + M[4 + r] * p[1] + M[8 + r] * p[2] + M[12 + r]);
console.log('scenes', root.listScenes().length, 'top nodes', root.listScenes()[0].listChildren().map(n => n.getName()).join(','));
for (const a of root.listAnimations()) console.log('anim', a.getName(), a.listChannels().map(c => c.getTargetNode().getName() + '.' + c.getTargetPath()).join(' '));
const all = { mn: [1e9, 1e9, 1e9], mx: [-1e9, -1e9, -1e9] }, rimPts = [], paint = [];
for (const n of root.listNodes()) { const me = n.getMesh(); if (!me) continue; const M = n.getWorldMatrix();
  for (const p of me.listPrimitives()) { const nm = p.getMaterial()?.getName() || '', pos = p.getAttribute('POSITION');
    for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, v); const w = W(M, v); for (let k = 0; k < 3; k++) { all.mn[k] = Math.min(all.mn[k], w[k]); all.mx[k] = Math.max(all.mx[k], w[k]); }
      if (new RegExp(RIM).test(nm)) rimPts.push(w); if (new RegExp(PAINT).test(nm) && i % 2 === 0) paint.push(w); } } }
console.log('bbox mn', all.mn.map(x => x.toFixed(3)).join(','), 'mx', all.mx.map(x => x.toFixed(3)).join(','));
const ext = [0, 1, 2].map(k => all.mx[k] - all.mn[k]); const upAx = /w202|mx5/.test(CAR) ? 2 : 1;
const lenAx = [0, 1, 2].filter(k => k !== upAx).reduce((a, b) => ext[a] > ext[b] ? a : b), latAx = [0, 1, 2].find(k => k !== upAx && k !== lenAx);
console.log('axes len/up/lat', lenAx, upAx, latAx, 'ext', ext.map(x => x.toFixed(3)).join(','));
// 輪圈：照長、寬方向分四群
const mid = [0, 1, 2].map(k => (all.mn[k] + all.mx[k]) / 2), groups = {};
for (const w of rimPts) { const key = (w[lenAx] > mid[lenAx] ? 'A' : 'B') + (w[latAx] > mid[latAx] ? 'R' : 'L'); (groups[key] ||= []).push(w); }
for (const [k, pts] of Object.entries(groups)) { const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; pts.forEach(w => { for (let d = 0; d < 3; d++) { mn[d] = Math.min(mn[d], w[d]); mx[d] = Math.max(mx[d], w[d]); } });
  console.log('rim', k, 'center', [0, 1, 2].map(d => ((mn[d] + mx[d]) / 2).toFixed(3)).join(','), 'size', [0, 1, 2].map(d => (mx[d] - mn[d]).toFixed(3)).join(','), 'outer lat', (k[1] === 'R' ? mx[latAx] : mn[latAx]).toFixed(3)); }
// 車漆側面輪廓：長度方向每 2% 一格，最高點、最低點
const prof = [];
for (let s = 0; s < 50; s++) { const a = all.mn[lenAx] + ext[lenAx] * s / 50, b = a + ext[lenAx] / 50; let hi = -1e9, lo = 1e9, wl = 0;
  for (const w of paint) if (w[lenAx] >= a && w[lenAx] < b) { hi = Math.max(hi, w[upAx]); lo = Math.min(lo, w[upAx]); wl = Math.max(wl, Math.abs(w[latAx] - mid[latAx])); }
  prof.push(hi > -1e9 ? `${(s * 2)}%:${hi.toFixed(2)}/${lo.toFixed(2)}/w${wl.toFixed(2)}` : `${s * 2}%:-`); }
console.log('paint profile (len% : top/bottom/halfwidth)\n ' + prof.join(' '));
