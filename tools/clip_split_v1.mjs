// 沿平面把車漆切開（2026-10-10）：賽車條紋要直的邊，不能照三角形挑（會鋸齒）。
// 做法：每個三角形依序被幾個平面切（Sutherland–Hodgman，切出來的新頂點照比例內插位置、法向量、UV、頂點色），
// 切完每一小塊都完全在某一邊，再照中心點判斷屬於哪一區，歸到新材質。
//   MODE=stripe：兩條平行條紋，離車身中線 STRIPE_IN～STRIPE_OUT 公尺（左右各一條），材質 stripe_paint。
// 車漆＋車頂（roof_paint）都切，條紋會連過車頂。尺寸照車長 4.7 m 換算成公尺。
// 用法：node clip_split_v1.mjs <輸入.glb> <輸出.glb> <車代號>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { draco, compactPrimitive, prune } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
const [IN, OUT, CAR] = process.argv.slice(2);
const PAINT = { w202: /^carpaint$/, mx5: /^carpaint$/, macan: /^Color1Mtl$/, x5: /^carpaint$/, q50: /^CarPaint$/, mazda3: /^Mazda_3MI_1218030001_089$/,
  mustang: /^Ford_MustangGT_2024(PaintA|Coloured)_Material$/, gt43: /^gtishka_body$/, cx5: /^Paint_Color$/ };
if (!PAINT[CAR]) throw new Error('unknown car ' + CAR);
const IN_M = +(process.env.STRIPE_IN || 0.06), OUT_M = +(process.env.STRIPE_OUT || 0.30);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(), 'draco3d.encoder': await draco3d.createEncoderModule() });
const doc = await io.read(IN), root = doc.getRoot(), buf = root.listBuffers()[0], v = [0, 0, 0];
const W = (M, p) => [0, 1, 2].map(r => M[r] * p[0] + M[4 + r] * p[1] + M[8 + r] * p[2] + M[12 + r]);
const all = { mn: [1e9, 1e9, 1e9], mx: [-1e9, -1e9, -1e9] };
for (const n of root.listNodes()) { const me = n.getMesh(); if (!me) continue; const M = n.getWorldMatrix();
  for (const p of me.listPrimitives()) { const pos = p.getAttribute('POSITION'); for (let i = 0; i < pos.getCount(); i += 3) { pos.getElement(i, v); const w = W(M, v); for (let k = 0; k < 3; k++) { all.mn[k] = Math.min(all.mn[k], w[k]); all.mx[k] = Math.max(all.mx[k], w[k]); } } } }
const ext = [0, 1, 2].map(k => all.mx[k] - all.mn[k]);
const upAx = (CAR === 'w202' || CAR === 'mx5') ? 2 : 1;
const lenAx = [0, 1, 2].filter(k => k !== upAx).reduce((a, b) => ext[a] > ext[b] ? a : b);
const latAx = [0, 1, 2].find(k => k !== upAx && k !== lenAx);
const unit = 4.7 / ext[lenAx];   // 公尺／模型單位
const mid = (all.mn[latAx] + all.mx[latAx]) / 2;
// 平面：橫向座標（公尺，離中線）＝ ±IN、±OUT
const PLANES = [-OUT_M, -IN_M, IN_M, OUT_M].map(m => mid + m / unit);
const region = latW => { const d = Math.abs(latW - mid) * unit; return d > IN_M && d < OUT_M ? 1 : 0; };

const newMats = new Map(); let made = 0, cut = 0;
for (const n of root.listNodes()) { const me = n.getMesh(); if (!me) continue; const M = n.getWorldMatrix();
  for (const prim of me.listPrimitives().slice()) {
    const mat = prim.getMaterial(), nm = mat ? mat.getName() : '';
    if (!(PAINT[CAR].test(nm) || nm === 'roof_paint')) continue;
    const sems = prim.listSemantics(), acc = sems.map(s => prim.getAttribute(s)), size = acc.map(a => a.getElementSize());
    const data = acc.map(a => { const out = [], e = []; for (let i = 0; i < a.getCount(); i++) { a.getElement(i, e); out.push(...e); } return out; });
    const pos = prim.getAttribute('POSITION'), cnt = pos.getCount(), lat = [];
    for (let i = 0; i < cnt; i++) { pos.getElement(i, v); lat.push(W(M, v)[latAx]); }
    const nIdx = sems.indexOf('NORMAL');
    const cache = new Map();
    const lerpVert = (a, b, t, pk) => {   // a、b 兩頂點之間 t 的位置新增一個頂點（同一條邊、同一個平面只做一次）
      const key = (a < b ? a + '_' + b : b + '_' + a) + '_' + pk; if (cache.has(key)) return cache.get(key);
      if (a > b) { [a, b] = [b, a]; t = 1 - t; }
      const id = lat.length;
      data.forEach((d, k) => { const s = size[k]; for (let c = 0; c < s; c++) d.push(d[a * s + c] + (d[b * s + c] - d[a * s + c]) * t); });
      if (nIdx >= 0) { const d = data[nIdx], o = id * 3, L = Math.hypot(d[o], d[o + 1], d[o + 2]) || 1; d[o] /= L; d[o + 1] /= L; d[o + 2] /= L; }
      lat.push(lat[a] + (lat[b] - lat[a]) * t); cache.set(key, id); return id; };
    const idx = prim.getIndices(), keep = [], take = [];
    for (let t = 0; t < idx.getCount(); t += 3) {
      let polys = [[idx.getScalar(t), idx.getScalar(t + 1), idx.getScalar(t + 2)]];
      PLANES.forEach((pv, pk) => {
        const next = [];
        for (const poly of polys) {
          const s = poly.map(i => lat[i] - pv);
          if (s.every(x => x >= 0) || s.every(x => x <= 0)) { next.push(poly); continue; }
          const A = [], B = [];
          for (let i = 0; i < poly.length; i++) { const j = (i + 1) % poly.length, a = poly[i], b = poly[j], sa = s[i], sb = s[j];
            (sa >= 0 ? A : B).push(a); if (sa === 0) B.push(a);
            if ((sa > 0 && sb < 0) || (sa < 0 && sb > 0)) { const m = lerpVert(a, b, sa / (sa - sb), pk); A.push(m); B.push(m); } }
          cut++; if (A.length >= 3) next.push(A); if (B.length >= 3) next.push(B);
        }
        polys = next; });
      for (const poly of polys) { const c = poly.reduce((x, i) => x + lat[i], 0) / poly.length, dst = region(c) ? take : keep;
        for (let i = 1; i + 1 < poly.length; i++) dst.push(poly[0], poly[i], poly[i + 1]); }
    }
    if (!take.length) continue;
    // 新的頂點資料（原本的頂點＋切出來的頂點），兩個 primitive 共用，之後 compactPrimitive 各自瘦身
    sems.forEach((s, k) => { const a = acc[k];
      prim.setAttribute(s, doc.createAccessor().setType(a.getType()).setArray(new Float32Array(data[k])).setBuffer(buf)); });
    const q = prim.clone();
    // 貼圖留著：沒選條紋時這塊要跟車身一模一樣。選了條紋時網頁才把底色貼圖拿掉（Mustang 的車漆是貼圖乘顏色，白條紋會變成貼圖的藍）
    // 從車頂切出來的叫 stripe_roof（沒選條紋時跟著車頂，車頂亮黑時一起黑），其他叫 stripe_paint（跟著車身色）
    // 照來源材質物件分（不是名稱）：Mustang 的車頂有兩個都叫 roof_paint 的材質，貼圖不同，共用會讓沒選條紋時看得出來
    if (!newMats.has(mat)) newMats.set(mat, mat.clone().setName(nm === 'roof_paint' ? 'stripe_roof' : 'stripe_paint'));
    q.setMaterial(newMats.get(mat));
    q.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(take)).setBuffer(buf));
    me.addPrimitive(q); compactPrimitive(q);
    if (keep.length) { prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(keep)).setBuffer(buf)); compactPrimitive(prim); }
    else { me.removePrimitive(prim); prim.dispose(); }
    made += take.length / 3;
  } }
console.log(CAR, 'stripe triangles', made, 'polygon cuts', cut, 'axes len/up/lat', lenAx, upAx, latAx);
// 量化格維持每塊各自的外框（預設）。試過整台車一個格（quantizationVolume: 'scene'）：W202、MX-5 的模型是公分再加一層縮放，整車外框算錯，差異反而大 100 倍（2026-10-10）
await doc.transform(prune({ keepAttributes: true, keepIndices: true, keepLeaves: true }), draco({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }));
await io.write(OUT, doc);
