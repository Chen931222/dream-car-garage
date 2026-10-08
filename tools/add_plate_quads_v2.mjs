// 自訂車牌，第二版（2026-10-08）：其他七台車。車牌位置在瀏覽器裡量（G:\Projects\_design-check\_plate_scan.mjs）：
//   有車牌座的（Q50 前後、X5 後、Mustang 後、AMG 前）用顏色找外框、沿中線打射線量四角；
//   模型裡沒有車牌的（Macan、CX-5、Mazda 3 前後、AMG 後）在實車掛車牌的位置放標準尺寸（歐規 52×11、美規 30.5×15.2 cm），
//   保桿是弧面就整塊往外推到不陷進去。座標都是 glTF 場景座標。
// 這裡把每塊車牌做成一片有 UV 的薄板（材質 plate_print@寬高比），再往外推 1.5 mm；
// 掛在 RIDE_BODY 底下（車高動畫會一起降），沒有 RIDE_BODY 的（AMG）掛在場景根。
// 用法：node add_plate_quads_v2.mjs <輸入.glb> <輸出.glb> <plates.json> <車代號，跟 plates.json 的 key 前綴一樣>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { draco } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import fs from 'fs';
const [IN, OUT, JSONF, CAR] = process.argv.slice(2);
const plates = Object.values(JSON.parse(fs.readFileSync(JSONF, 'utf8'))).filter(p => p.car === CAR);
if (!plates.length) throw new Error('no plates for ' + CAR);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(), 'draco3d.encoder': await draco3d.createEncoderModule() });
const doc = await io.read(IN);
const root = doc.getRoot(), buf = root.listBuffers()[0], scene = root.listScenes()[0];
if (root.listMaterials().some(m => m.getName().startsWith('plate_print'))) throw new Error('already has plate_print');

// 4×4 反矩陣（欄優先）
function inv(m) {
  const a = m, b = new Array(16);
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3], a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7], a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11], a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  const det = 1 / (b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06);
  b[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det; b[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det; b[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det; b[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  b[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det; b[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det; b[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det; b[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  b[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det; b[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det; b[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det; b[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  b[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det; b[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det; b[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det; b[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return b;
}
const xf = (M, p, w = 1) => [0, 1, 2].map(r => M[r] * p[0] + M[4 + r] * p[1] + M[8 + r] * p[2] + M[12 + r] * w);

const ride = root.listNodes().find(n => n.getName() === 'RIDE_BODY');
const parent = ride || null;
const Minv = parent ? inv(parent.getWorldMatrix()) : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const scale = plates[0].scale;
const OFF = 0.0015 / scale;   // 1.5 mm，換成模型單位
const P = [], N = [], UV = [], I = [];
let aspect = 0;
for (const pl of plates) {
  const n = pl.normal, k = pl.corners, base = P.length / 3;
  const push = q => q.map((v, i) => v + n[i] * OFF);
  for (const [c, uv] of [[k.tl, [0, 0]], [k.tr, [1, 0]], [k.br, [1, 1]], [k.bl, [0, 1]]]) {
    P.push(...xf(Minv, push(c))); UV.push(...uv);
    const nl = xf(Minv, n, 0), l = Math.hypot(...nl); N.push(...nl.map(v => v / l));
  }
  I.push(base, base + 1, base + 2, base, base + 2, base + 3);
  aspect += pl.wCm / pl.hCm / plates.length;
  console.log(CAR, pl.view, `${pl.wCm.toFixed(1)} x ${pl.hCm.toFixed(1)} cm`, pl.fab ? '(standard size)' : '(measured)');
}
const acc = (type, arr, T) => doc.createAccessor().setType(type).setArray(new T(arr)).setBuffer(buf);
const mat = doc.createMaterial('plate_print@' + aspect.toFixed(2)).setBaseColorFactor([1, 1, 1, 0]).setAlphaMode('BLEND')
  .setMetallicFactor(0).setRoughnessFactor(0.45).setDoubleSided(true);
const mesh = doc.createMesh('plate_print').addPrimitive(doc.createPrimitive().setMaterial(mat)
  .setAttribute('POSITION', acc('VEC3', P, Float32Array))
  .setAttribute('NORMAL', acc('VEC3', N, Float32Array))
  .setAttribute('TEXCOORD_0', acc('VEC2', UV, Float32Array))
  .setIndices(acc('SCALAR', I, Uint16Array)));
const node = doc.createNode('PLATE_PRINT').setMesh(mesh);
if (parent) parent.addChild(node); else scene.addChild(node);
await doc.transform(draco({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }));
await io.write(OUT, doc);
console.log('wrote', OUT, 'parent', parent ? 'RIDE_BODY' : 'scene root', 'aspect', aspect.toFixed(2));
