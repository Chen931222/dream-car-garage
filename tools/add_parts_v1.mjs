// 把 Blender 產生的加裝零件（尾翼、前下巴、輪圈）併進車模（2026-10-11）
// 零件的頂點已經是車模的 glTF 場景座標；尾翼、下巴掛到車身節點底下（跟著車高動畫一起降），輪圈掛到輪子節點底下。
// 用法：node add_parts_v1.mjs <車模.glb> <零件.glb> <輸出.glb> <車身節點名> <輪子節點名>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { mergeDocuments, unpartition, draco, prune } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
const [CAR, PARTS, OUT, BODY, WHEELS] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(), 'draco3d.encoder': await draco3d.createEncoderModule() });
const doc = await io.read(CAR), src = await io.read(PARTS);
const root = doc.getRoot(), scene = root.listScenes()[0];
const find = n => root.listNodes().find(x => x.getName() === n);
const body = find(BODY), wheels = find(WHEELS);
if (!body || !wheels) throw new Error('nodes not found');
const isIdentity = m => m.every((v, i) => Math.abs(v - (i % 5 === 0 ? 1 : 0)) < 1e-6);
if (!isIdentity(body.getWorldMatrix()) || !isIdentity(wheels.getWorldMatrix())) throw new Error('parent not identity — 要先算反矩陣');
mergeDocuments(doc, src);
await doc.transform(unpartition());
const extra = root.listScenes().find(s => s !== scene);
for (const n of extra.listChildren().slice()) {
  const nm = n.getName();
  if (!/^mod_/.test(nm)) throw new Error('unexpected node ' + nm);
  if (!isIdentity(n.getWorldMatrix())) throw new Error('part node has transform ' + nm);
  extra.removeChild(n);
  (/^mod_rim_/.test(nm) ? wheels : body).addChild(n);
}
extra.dispose();
console.log('added', body.listChildren().filter(n => /^mod_/.test(n.getName())).map(n => n.getName()).join(','), '|', wheels.listChildren().filter(n => /^mod_/.test(n.getName())).map(n => n.getName()).join(','));
await doc.transform(prune({ keepAttributes: true, keepIndices: true, keepLeaves: true }), draco({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }));
await io.write(OUT, doc);
