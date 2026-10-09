// 列出某節點（名稱比對）裡某材質的連通零件（2026-10-09，找 Macan、CX-5 的輪圈）
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
const [IN, NODE, MAT] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
const doc = await io.read(IN);
const v = [0, 0, 0];
for (const n of doc.getRoot().listNodes()) { if (n.getName() !== NODE) continue; const M = n.getWorldMatrix();
  for (const prim of n.getMesh().listPrimitives()) { if (prim.getMaterial().getName() !== MAT) continue;
    const pos = prim.getAttribute('POSITION'), idx = prim.getIndices(), cnt = pos.getCount(), wp = [];
    for (let i = 0; i < cnt; i++) { pos.getElement(i, v); wp.push([0, 1, 2].map(r => M[r] * v[0] + M[4 + r] * v[1] + M[8 + r] * v[2] + M[12 + r])); }
    const mn = [0, 1, 2].map(k => Math.min(...wp.map(p => p[k]))), mx = [0, 1, 2].map(k => Math.max(...wp.map(p => p[k])));
    const q = Math.max(...[0, 1, 2].map(k => mx[k] - mn[k])) / 40000, key = new Map(), weld = new Int32Array(cnt);
    for (let i = 0; i < cnt; i++) { const k = wp[i].map(a => Math.round(a / q)).join(','); if (!key.has(k)) key.set(k, i); weld[i] = key.get(k); }
    const par = new Int32Array(cnt).map((_, i) => i), f = i => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
    const tri = idx.getCount(), g = i => weld[idx.getScalar(i)];
    for (let t = 0; t < tri; t += 3) { const a = f(g(t)), b = f(g(t + 1)), c = f(g(t + 2)); par[b] = a; par[f(c)] = a; }
    const comps = new Map();
    for (let t = 0; t < tri; t += 3) { const r = f(g(t)); if (!comps.has(r)) comps.set(r, { n: 0, mn: [1e9, 1e9, 1e9], mx: [-1e9, -1e9, -1e9] }); const c = comps.get(r); c.n++;
      for (let k = 0; k < 3; k++) { const p = wp[idx.getScalar(t + k)]; for (let d = 0; d < 3; d++) { c.mn[d] = Math.min(c.mn[d], p[d]); c.mx[d] = Math.max(c.mx[d], p[d]); } } }
    const L = [...comps.values()].sort((a, b) => b.n - a.n);
    console.log(NODE, MAT, 'parts', L.length);
    for (const c of L.slice(0, 20)) console.log('  ', String(c.n).padStart(6), 'size', c.mn.map((a, k) => (c.mx[k] - a).toPrecision(3)).join(' x '), ' ctr', c.mn.map((a, k) => ((a + c.mx[k]) / 2).toPrecision(3)).join(','));
  } }
