// 燈裡鍍鉻的範圍（2026-10-09，黑化套件）：拿燈罩的外框（lens_boxes.json），沿車長方向前後各延伸 25 cm，
// 把燈罩後面的反射罩包進去；車寬、高度只多留燈罩最長邊的 8%（split_lens_v1 自己加）。
// 用法：node lamp_boxes_v1.mjs <lens_boxes.json> <輸出.json>
import fs from 'fs';
const [IN, OUT] = process.argv.slice(2);
const lens = JSON.parse(fs.readFileSync(IN, 'utf8'));
// 車長在 glTF 場景座標的哪一軸、模型單位 1 = 幾公尺（跟配置器的 scale 相反）
const CARS = {
  w202: { len: 1, unit: 0.01, chrome: ['chrome'] },
  mx5: { len: 1, unit: 0.01, chrome: ['chrome'] },
  x5: { len: 2, unit: 100, chrome: ['chrome_1', 'chrome_r'] },
  q50: { len: 2, unit: 1, chrome: ['Chrome1', 'Chrome_SQ', 'Chrome_R1', 'SQ_CH'] },
  'amg-gt63': { len: 2, unit: 1, chrome: ['amg_chrome'] },
};
const out = {};
for (const [car, c] of Object.entries(CARS)) {
  const ext = 0.25 / c.unit;
  for (const b of lens[car] || []) for (const mat of c.chrome) {
    const mn = b.mn.slice(), mx = b.mx.slice(); mn[c.len] -= ext; mx[c.len] += ext;
    (out[car] = out[car] || []).push({ mat, newName: 'lamp_chrome', mn, mx, from: b.newName });
  }
}
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(Object.entries(out).map(([k, v]) => k + ':' + v.length).join(' '));
