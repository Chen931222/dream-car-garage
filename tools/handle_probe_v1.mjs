// 找車門把手（從 mirror_probe_v1 改，2026-10-09）；原註解：找後視鏡外殼（2026-10-09）：把車漆材質拆成連通零件，用世界座標列出大小、位置（以整台車外框的比例表示），
// 後視鏡＝10–40 cm、在車寬兩端、高度在車身上半、長度方向在車頭三分之一附近，而且左右各一塊
// 用法：node mirror_probe_v1.mjs <glb> <車漆材質名或 /正規式/>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
const [IN, MAT] = process.argv.slice(2);
const re = MAT.startsWith('/') ? new RegExp(MAT.slice(1, MAT.lastIndexOf('/')), MAT.slice(MAT.lastIndexOf('/') + 1)) : null;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
const doc = await io.read(IN);
const root = doc.getRoot();
// 整台車外框（世界座標，用 getElement 換算後的頂點）
const all = { mn: [1e9, 1e9, 1e9], mx: [-1e9, -1e9, -1e9] }; const v = [0, 0, 0];
const W = (M, p) => [0, 1, 2].map(r => M[r] * p[0] + M[4 + r] * p[1] + M[8 + r] * p[2] + M[12 + r]);
for (const n of root.listNodes()) { const me = n.getMesh(); if (!me) continue; const M = n.getWorldMatrix();
  for (const p of me.listPrimitives()) { const pos = p.getAttribute('POSITION'); for (let i = 0; i < pos.getCount(); i += 7) { pos.getElement(i, v); const w = W(M, v); for (let k = 0; k < 3; k++) { all.mn[k] = Math.min(all.mn[k], w[k]); all.mx[k] = Math.max(all.mx[k], w[k]); } } } }
const ext = [0, 1, 2].map(k => all.mx[k] - all.mn[k]), lenAx = ext.indexOf(Math.max(...ext));
const unit = 4.7 / ext[lenAx];   // 粗估：1 模型單位 ≈ 幾公尺
console.log('car bbox ext', ext.map(x => x.toPrecision(3)).join(' x '), 'length axis', lenAx, 'm/unit≈', unit.toPrecision(3));
const out = [];
for (const n of root.listNodes()) { const me = n.getMesh(); if (!me) continue; const M = n.getWorldMatrix();
  for (const prim of me.listPrimitives()) {
    const m = prim.getMaterial(); const nm = m ? m.getName() : ''; if (re ? !re.test(nm) : nm !== MAT) continue;
    const pos = prim.getAttribute('POSITION'), idx = prim.getIndices(), cnt = pos.getCount();
    const wp = []; for (let i = 0; i < cnt; i++) { pos.getElement(i, v); wp.push(W(M, v)); }
    const q = ext[lenAx] / 40000, key = new Map(), weld = new Int32Array(cnt);
    for (let i = 0; i < cnt; i++) { const k = wp[i].map(a => Math.round(a / q)).join(','); if (!key.has(k)) key.set(k, i); weld[i] = key.get(k); }
    const par = new Int32Array(cnt).map((_, i) => i), f = i => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
    const tri = idx ? idx.getCount() : cnt, g = i => weld[idx ? idx.getScalar(i) : i];
    for (let t = 0; t < tri; t += 3) { const a = f(g(t)), b = f(g(t + 1)), c = f(g(t + 2)); par[b] = a; par[f(c)] = a; }
    const comps = new Map();
    for (let t = 0; t < tri; t += 3) { const r = f(g(t)); if (!comps.has(r)) comps.set(r, { n: 0, mn: [1e9, 1e9, 1e9], mx: [-1e9, -1e9, -1e9] }); const c = comps.get(r); c.n++;
      for (let k = 0; k < 3; k++) { const p = wp[idx ? idx.getScalar(t + k) : t + k]; for (let d = 0; d < 3; d++) { c.mn[d] = Math.min(c.mn[d], p[d]); c.mx[d] = Math.max(c.mx[d], p[d]); } } }
    for (const c of comps.values()) {
      const sz = [0, 1, 2].map(k => (c.mx[k] - c.mn[k]) * unit), big = Math.max(...sz);
      const rel = [0, 1, 2].map(k => (((c.mn[k] + c.mx[k]) / 2) - all.mn[k]) / ext[k]);
      out.push({ mesh: me.getName().slice(0, 28), mat: nm, tris: c.n, sizeCm: sz.map(x => Math.round(x * 100)), rel: rel.map(x => +x.toFixed(2)), big, mn: c.mn, mx: c.mx });
    }
  } }
// 門把候選：最長 12–35 cm、最薄 < 8 cm、在車寬兩端、高度 40–72%
const upAx = process.env.UP ? +process.env.UP : 1, latAx = [0, 1, 2].find(k => k !== lenAx && k !== upAx);
const cand = out.filter(c => c.big > 0.12 && c.big < 0.35 && Math.min(...c.sizeCm) < 8 && (c.rel[latAx] < 0.1 || c.rel[latAx] > 0.9) && c.rel[upAx] > 0.4 && c.rel[upAx] < 0.72).sort((a, b) => b.tris - a.tris);
console.log('paint parts', out.length, '; candidates (10–45 cm):');
for (const c of cand.slice(0, 30)) console.log('  ', c.mat.slice(0, 26).padEnd(26), c.tris.toString().padStart(5), 'tris', c.sizeCm.join('x').padEnd(12), 'cm  rel', c.rel.join(','), ' ', c.mesh);
