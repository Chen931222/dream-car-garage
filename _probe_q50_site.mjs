import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
const doc = await io.read(process.argv[2]);
const root = doc.getRoot();
const b = getBounds(root.listScenes()[0]);
console.log('bounds', b.min.map(v=>+v.toFixed(3)), b.max.map(v=>+v.toFixed(3)));
const sizes = {};
for (const t of root.listTextures()) { const img = t.getImage(); if(!img) continue; const m = await sharp(Buffer.from(img)).metadata(); const k = m.width+'x'+m.height+' '+t.getMimeType(); sizes[k]=(sizes[k]||0)+1; }
console.log('textures', JSON.stringify(sizes));
console.log('root nodes', root.listScenes()[0].listChildren().map(n=>n.getName()+' r'+n.getRotation().map(v=>+v.toFixed(3))+' s'+n.getScale().map(v=>+v.toFixed(3))));
