import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const inPath = process.argv[2];
const outPath = process.argv[3];
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(inPath);
const mats = doc.getRoot().listMaterials();

const report = mats.map(m => ({
  name: m.getName(),
  doubleSided: m.getDoubleSided(),
  alpha: +m.getAlpha().toFixed(2),
  mode: m.getAlphaMode(),
}));

// Make every material double-sided so any inward-facing (culled) glass renders from outside.
mats.forEach(m => m.setDoubleSided(true));

await io.write(outPath, doc);
console.log(JSON.stringify(report, null, 0));
console.log('WROTE ' + outPath + ' (materials: ' + mats.length + ')');
