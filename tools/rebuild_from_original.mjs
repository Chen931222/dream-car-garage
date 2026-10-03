// 從 Sketchfab 原檔重建網站用的 glb（2026-10-02，為 Q50 寫）
//
// 網站上的 q50.glb 是用 glTF-Transform 的 optimize 流程做的（合併同材質網格、攤平節點、
// 量化、簡化、貼圖轉 webp、Draco）。其中「簡化」把車身砍掉六成，面板皺掉、保桿破洞。
// 這支照同一套流程重做，但預設不簡化；要壓小時只簡化指定材質以外的網格（例如內裝）。
//
// 用法：
//   node rebuild_from_original.mjs <原檔.glb> <輸出.glb> [--tex 1024] [--simplify-others 0.5] [--keep "CarPaint|Rim_RS_AO"]
//     --tex              貼圖最長邊（預設 1024，跟現在網站版一樣）
//     --simplify-others  除了 --keep 的材質以外，其餘網格簡化到這個比例（預設不簡化）
//     --keep             不簡化的材質（正規式，預設車漆）
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, instance, flatten, join, weld, resample, prune, sparse, textureCompress, draco, getBounds, simplifyPrimitive } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';
import fs from 'node:fs';

const args = process.argv.slice(2);
const IN = args[0], OUT = args[1];
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const TEX = +opt('--tex', 1024);
const SIMPLIFY_OTHERS = opt('--simplify-others', null);
const KEEP = new RegExp(opt('--keep', 'carpaint'), 'i');

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule(),
});

function tris(doc) {
  const by = {};
  for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) {
    const n = (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3;
    const m = p.getMaterial() ? p.getMaterial().getName() : '-';
    by[m] = (by[m] || 0) + n;
  }
  return by;
}

const doc = await io.read(IN);
const before = tris(doc);
const total0 = Object.values(before).reduce((a, b) => a + b, 0);
console.log('IN', IN, (fs.statSync(IN).size / 1048576).toFixed(1) + ' MB', 'tris', total0);

await doc.transform(dedup(), instance(), flatten(), join(), weld());

if (SIMPLIFY_OTHERS) {
  await MeshoptSimplifier.ready;
  let done = 0;
  for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) {
    const m = p.getMaterial() ? p.getMaterial().getName() : '';
    if (KEEP.test(m)) continue;
    simplifyPrimitive(p, { simplifier: MeshoptSimplifier, ratio: +SIMPLIFY_OTHERS, error: 0.001 });
    done++;
  }
  console.log('SIMPLIFIED_OTHERS', done, 'primitives to', SIMPLIFY_OTHERS, '(kept:', KEEP.source + ')');
}

await doc.transform(
  resample(), prune(), sparse(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [TEX, TEX] }),
  draco(),
);

const after = tris(doc);
const total1 = Object.values(after).reduce((a, b) => a + b, 0);
await io.write(OUT, doc);
const b = getBounds(doc.getRoot().listScenes()[0]);
console.log('OUT', OUT, (fs.statSync(OUT).size / 1048576).toFixed(2) + ' MB', 'tris', total1);
console.log('BOUNDS', b.min.map(v => +v.toFixed(3)), b.max.map(v => +v.toFixed(3)));
const show = Object.entries(after).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => k + ' ' + v + (before[k] ? ' (原 ' + before[k] + ')' : ''));
console.log('TOP', show.join(' | '));
console.log('MATERIALS', doc.getRoot().listMaterials().length);
