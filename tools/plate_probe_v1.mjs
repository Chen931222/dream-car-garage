// 車牌材質的幾何：外框、法線方向、有沒有 UV、UV 範圍（2026-10-08，自訂車牌可行性）
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
const W = 'C:/Users/User/Desktop/360汽車環景/web-deploy/';
for (const car of ['w202', 'mx5', 'cx5', 'q50', 'mustang']) {
  const doc = await io.read(W + car + '.glb');
  console.log('=== ' + car);
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh(); if (!mesh) continue;
    const M = node.getWorldMatrix();
    for (const p of mesh.listPrimitives()) {
      const m = p.getMaterial(); const n = m ? m.getName() : '';
      if (!/^Material__\d$|plate/i.test(n)) continue;
      const pos = p.getAttribute('POSITION'), uv = p.getAttribute('TEXCOORD_0');
      const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9], umn = [1e9, 1e9], umx = [-1e9, -1e9];
      const v = [0, 0, 0], t = [0, 0];
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, v);
        const w = [0, 1, 2].map(r => M[r] * v[0] + M[4 + r] * v[1] + M[8 + r] * v[2] + M[12 + r]);
        for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], w[k]); mx[k] = Math.max(mx[k], w[k]); }
        if (uv) { uv.getElement(i, t); for (let k = 0; k < 2; k++) { umn[k] = Math.min(umn[k], t[k]); umx[k] = Math.max(umx[k], t[k]); } }
      }
      const f = x => x.map(a => a.toFixed(3)).join(',');
      console.log(n.padEnd(12), 'node', node.getName().slice(0, 30).padEnd(30), 'verts', pos.getCount(), 'bbox', f(mn), '→', f(mx), uv ? 'uv ' + f(umn) + '→' + f(umx) : 'NO UV');
    }
  }
}
