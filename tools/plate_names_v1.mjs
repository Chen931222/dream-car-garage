// 找每台車可能是車牌的節點、材質（名稱含 plate/number/licen/kenn/nomer/reg/tag）
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
const W = 'C:/Users/User/Desktop/360汽車環景/web-deploy/';
const re = /plate|number|licen|kenn|nomer|numb|regist|znak|tablic/i;
for (const car of ['macan', 'x5', 'q50', 'mazda3', 'mustang', 'gt43', 'cx5']) {
  const doc = await io.read(W + car + '.glb');
  const hits = new Set();
  for (const n of doc.getRoot().listNodes()) if (re.test(n.getName())) hits.add('node ' + n.getName());
  for (const m of doc.getRoot().listMaterials()) if (re.test(m.getName())) hits.add('mat ' + m.getName());
  for (const t of doc.getRoot().listTextures()) if (re.test(t.getName() + t.getURI())) hits.add('tex ' + t.getName());
  console.log(car.padEnd(8), [...hits].join(' | ') || '(none)', '| nodes', doc.getRoot().listNodes().length);
}
