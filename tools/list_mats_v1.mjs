// 列出每台車的材質：顏色、金屬度、粗糙度、透明度、用到的三角形數（2026-10-08，找鍍鉻飾條與車窗）
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
const W = 'C:/Users/User/Desktop/360汽車環景/web-deploy/';
for (const car of (process.argv[2] || 'w202,mx5,macan,x5,q50,mazda3,mustang,gt43,cx5').split(',')) {
  const doc = await io.read(W + car + '.glb');
  const tris = new Map();
  for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) {
    const m = p.getMaterial(); if (!m) continue;
    const n = p.getIndices() ? p.getIndices().getCount() / 3 : p.getAttribute('POSITION').getCount() / 3;
    tris.set(m, (tris.get(m) || 0) + n);
  }
  console.log('=== ' + car);
  for (const m of doc.getRoot().listMaterials()) {
    const c = m.getBaseColorFactor().map(v => Math.round(Math.pow(v, 1 / 2.2) * 255));
    const tr = m.getExtension('KHR_materials_transmission');
    console.log([m.getName().slice(0, 40).padEnd(40), 'rgb(' + c.slice(0, 3).join(',') + ')', 'a' + c[3] / 255 .toFixed?.(2), 'M' + m.getMetallicFactor().toFixed(2), 'R' + m.getRoughnessFactor().toFixed(2), m.getAlphaMode(), tr ? 'T' + tr.getTransmissionFactor().toFixed(2) : '', m.getBaseColorTexture() ? 'tex' : '', Math.round(tris.get(m) || 0) + 't'].join(' '));
  }
}
