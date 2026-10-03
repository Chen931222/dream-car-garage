// 修兩台車的內裝（2026-10-03）
//
// mazda3：皮革、織布、車艙塑料三個材質的金屬度是 1（貼圖 B 通道平均 0.72），
//         內裝像鏡子一樣反射攝影棚頂燈，儀表板上蓋變成一片白。皮革不是金屬 → metallicFactor 設 0。
// macan ：白色的 A1Mtl 有一批面跟內裝（門板、儀表板）的面疊在同一個位置，兩層互相搶著顯示，
//         儀表板上出現紅白花紋。把 A1Mtl 裡「貼在內裝表面 0.5 mm 以內」的三角形刪掉。
//         另外車旁邊飄著一個小零件（像鑰匙），渲染出來像掉在地上的白色小東西，一併拿掉。
//
// 用法：node tools/fix_interior_v1.mjs <mazda3|macan> <輸入.glb> <輸出.glb>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, draco } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import fs from 'node:fs';

const [CAR, IN, OUT] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule(),
});
const doc = await io.read(IN);
const root = doc.getRoot();

if (CAR === 'mazda3') {
  const RE = /Leather_Inst_017|ChangeA_Cabin_013|Fablic_019/;
  for (const m of root.listMaterials()) {
    if (!RE.test(m.getName())) continue;
    console.log('METAL', m.getName(), m.getMetallicFactor(), '-> 0');
    m.setMetallicFactor(0);
  }
} else if (CAR === 'macan') {
  const TOL = 0.002;                       // 模型單位；這台車長約 18 單位，0.002 約 0.5 mm
  const VICTIM = /^A1Mtl$/;                // 被刪的：白色那層
  const KEEP = /intcolor|interior|doorlr/i; // 留下的：配置器會上內裝色的那幾個材質
  // 世界座標的三角形
  const prims = [];
  for (const node of root.listNodes()) {
    const mesh = node.getMesh(); if (!mesh) continue;
    const M = node.getWorldMatrix();
    for (const p of mesh.listPrimitives()) {
      const pos = p.getAttribute('POSITION'), idx = p.getIndices(); if (!idx) continue;
      const n = pos.getCount(), W = new Float64Array(n * 3), v = [0, 0, 0];
      for (let i = 0; i < n; i++) {
        pos.getElement(i, v);
        W[i * 3] = M[0] * v[0] + M[4] * v[1] + M[8] * v[2] + M[12];
        W[i * 3 + 1] = M[1] * v[0] + M[5] * v[1] + M[9] * v[2] + M[13];
        W[i * 3 + 2] = M[2] * v[0] + M[6] * v[1] + M[10] * v[2] + M[14];
      }
      prims.push({ p, W, idx: Array.from(idx.getArray()), mat: p.getMaterial() ? p.getMaterial().getName() : '' });
    }
  }
  // 內裝三角形放進格子
  const CELL = 0.08, grid = new Map(), tris = [];
  const key = (x, y, z) => x + ',' + y + ',' + z;
  for (const pr of prims) {
    if (!KEEP.test(pr.mat)) continue;
    for (let t = 0; t < pr.idx.length; t += 3) {
      const a = pr.idx[t] * 3, b = pr.idx[t + 1] * 3, c = pr.idx[t + 2] * 3, W = pr.W;
      const tri = [W[a], W[a + 1], W[a + 2], W[b], W[b + 1], W[b + 2], W[c], W[c + 1], W[c + 2]];
      const id = tris.push(tri) - 1;
      const lo = [0, 1, 2].map(k => Math.floor((Math.min(tri[k], tri[k + 3], tri[k + 6]) - TOL) / CELL));
      const hi = [0, 1, 2].map(k => Math.floor((Math.max(tri[k], tri[k + 3], tri[k + 6]) + TOL) / CELL));
      for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) {
        const k = key(x, y, z); let arr = grid.get(k); if (!arr) grid.set(k, arr = []); arr.push(id);
      }
    }
  }
  // 點到三角形的距離平方（Ericson, Real-Time Collision Detection 5.1.5）
  function dist2(p, t) {
    const ax = t[0], ay = t[1], az = t[2], bx = t[3], by = t[4], bz = t[5], cx = t[6], cy = t[7], cz = t[8];
    const abx = bx - ax, aby = by - ay, abz = bz - az, acx = cx - ax, acy = cy - ay, acz = cz - az;
    const apx = p[0] - ax, apy = p[1] - ay, apz = p[2] - az;
    const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
    let qx, qy, qz;
    if (d1 <= 0 && d2 <= 0) { qx = ax; qy = ay; qz = az; }
    else {
      const bpx = p[0] - bx, bpy = p[1] - by, bpz = p[2] - bz;
      const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
      if (d3 >= 0 && d4 <= d3) { qx = bx; qy = by; qz = bz; }
      else {
        const vc = d1 * d4 - d3 * d2;
        if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); qx = ax + v * abx; qy = ay + v * aby; qz = az + v * abz; }
        else {
          const cpx = p[0] - cx, cpy = p[1] - cy, cpz = p[2] - cz;
          const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
          if (d6 >= 0 && d5 <= d6) { qx = cx; qy = cy; qz = cz; }
          else {
            const vb = d5 * d2 - d1 * d6;
            if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); qx = ax + w * acx; qy = ay + w * acy; qz = az + w * acz; }
            else {
              const va = d3 * d6 - d5 * d4;
              if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); qx = bx + w * (cx - bx); qy = by + w * (cy - by); qz = bz + w * (cz - bz); }
              else { const den = 1 / (va + vb + vc), v = vb * den, w = vc * den; qx = ax + abx * v + acx * w; qy = ay + aby * v + acy * w; qz = az + abz * v + acz * w; }
            }
          }
        }
      }
    }
    const dx = p[0] - qx, dy = p[1] - qy, dz = p[2] - qz; return dx * dx + dy * dy + dz * dz;
  }
  let removed = 0, total = 0;
  for (const pr of prims) {
    if (!VICTIM.test(pr.mat)) continue;
    const keep = [];
    for (let t = 0; t < pr.idx.length; t += 3) {
      total++;
      const a = pr.idx[t] * 3, b = pr.idx[t + 1] * 3, c = pr.idx[t + 2] * 3, W = pr.W;
      const cen = [(W[a] + W[b] + W[c]) / 3, (W[a + 1] + W[b + 1] + W[c + 1]) / 3, (W[a + 2] + W[b + 2] + W[c + 2]) / 3];
      const cand = grid.get(key(Math.floor(cen[0] / CELL), Math.floor(cen[1] / CELL), Math.floor(cen[2] / CELL)));
      let hit = false;
      if (cand) for (const id of cand) { if (dist2(cen, tris[id]) <= TOL * TOL) { hit = true; break; } }
      if (hit) removed++; else keep.push(pr.idx[t], pr.idx[t + 1], pr.idx[t + 2]);
    }
    const old = pr.p.getIndices();
    const Arr = old.getArray().constructor;
    pr.p.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Arr(keep)).setBuffer(old.getBuffer()));
  }
  console.log('REMOVED', removed, 'of', total, 'A1Mtl triangles lying on interior surfaces (interior triangles indexed:', tris.length + ')');

  // 車旁邊飄著一個小零件（約 10×5 公分，離車身 20 多公分、離地 22 公分，材質 A1Mtl＋Handle1Mtl，
  // 看起來是模型附的鑰匙）。渲染出來像掉在地上的一小塊白色。整塊拿掉。
  // 範圍是 glTF 座標（Y 向上）；Blender 裡量到的是 x[-10.9,-10.3] y[43.9,44.2] z[0.80,0.92]，換算 Z = -y。
  const BOX = { min: [-10.9, 0.80, -44.2], max: [-10.3, 0.92, -43.9] };
  let stray = 0;
  for (const pr of prims) {
    const cur = Array.from(pr.p.getIndices().getArray()), keep = [], W = pr.W;
    for (let t = 0; t < cur.length; t += 3) {
      const a = cur[t] * 3, b = cur[t + 1] * 3, c = cur[t + 2] * 3;
      const cen = [(W[a] + W[b] + W[c]) / 3, (W[a + 1] + W[b + 1] + W[c + 1]) / 3, (W[a + 2] + W[b + 2] + W[c + 2]) / 3];
      const inside = cen.every((v, k) => v >= BOX.min[k] && v <= BOX.max[k]);
      if (inside) stray++; else keep.push(cur[t], cur[t + 1], cur[t + 2]);
    }
    if (keep.length !== cur.length) {
      const old = pr.p.getIndices(); const Arr = old.getArray().constructor;
      pr.p.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Arr(keep)).setBuffer(old.getBuffer()));
      console.log('STRAY', pr.mat, (cur.length - keep.length) / 3, 'triangles');
    }
  }
  console.log('STRAY_TOTAL', stray);
} else {
  console.error('unknown car'); process.exit(1);
}

await doc.transform(prune(), draco());
await io.write(OUT, doc);
console.log('OUT', OUT, (fs.statSync(OUT).size / 1048576).toFixed(2) + ' MB (was ' + (fs.statSync(IN).size / 1048576).toFixed(2) + ' MB)');
