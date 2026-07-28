/* スリッパアイコンのPNGを依存なしで生成する（zlibのみ使用）
   デザイン：玄関にそろえて置かれたスリッパ2足（少し外向き） */
const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

/* ---------- PNG 書き出し ---------- */
const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const td  = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgb) {
  const stride = w * 3 + 1;
  const raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    raw[y * stride] = 0;                                  // filter: None
    rgb.copy(raw, y * stride + 1, y * w * 3, (y + 1) * w * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2;                               // 8bit, truecolour
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ---------- 色 ---------- */
const CREAM = [251, 247, 239];
const INK   = [43, 42, 38];
const GREEN = [63, 125, 94];
const DARKG = [56, 112, 84];

/* ---------- スリッパ1足（ローカル座標：中心0、つま先が -y 方向） ----------
   sole: たまご型（かかと側をすぼめる）  band: つま先寄りの甲バンド        */
const RX = 15, RY = 34;

function soleIn(x, y, pad) {
  if (y < -RY - pad || y > RY + pad) return false;
  const taper = 1 - 0.22 * Math.max(0, y / RY);      // かかと側を細く
  const rx = RX * taper + pad;
  const ry = RY + pad;
  const n = 2.5;                                      // 超楕円：つま先の尖りを抑える
  return Math.abs(x / rx) ** n + Math.abs(y / ry) ** n <= 1;
}
function bandIn(x, y, pad) {
  const cy = -13;                                     // 甲バンドの中心
  const hw = 14.6 + pad;
  const t = x / hw;
  const q = 1 - t * t;
  if (q <= 0) return false;
  const up = cy - (7.0 + pad) * q - pad * 0.4;
  const lo = cy + (5.5 + pad) * q + pad * 0.4;
  return y >= up && y <= lo;
}
function heelIn(x, y) {                               // かかとの影（奥行き）
  return ((x) / 9.5) ** 2 + ((y - 15) / 13) ** 2 <= 1;
}

/* 1足を評価。何も無ければ null */
function slipper(u, v, cx, cy, rotDeg) {
  const a = -rotDeg * Math.PI / 180;
  const dx = u - cx, dy = v - cy;
  const x = dx * Math.cos(a) - dy * Math.sin(a);
  const y = dx * Math.sin(a) + dy * Math.cos(a);
  const PAD = 2.3;
  if (!soleIn(x, y, PAD)) return null;
  let c = INK;
  if (soleIn(x, y, 0)) {
    c = GREEN;
    if (heelIn(x, y)) c = DARKG;
  }
  if (bandIn(x, y, PAD)) c = INK;
  if (bandIn(x, y, 0))   c = CREAM;
  return c;
}

/* ---------- 1ピクセルの色（デザイン座標 -50..50） ---------- */
function colorAt(u, v, pair) {
  if (pair) {
    return slipper(u, v,  19, 0,  7)          // 右足（外向き）
        || slipper(u, v, -19, 0, -7)          // 左足
        || CREAM;
  }
  return slipper(u, v, 0, 0, 0) || CREAM;
}

/* ---------- レンダリング（3x3 スーパーサンプリング） ---------- */
function render(size, scale, pair) {
  const SS = 3;
  const k  = (size * scale) / 100;
  const c0 = size / 2;
  const buf = Buffer.alloc(size * size * 3);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = colorAt((px + (sx + 0.5) / SS - c0) / k,
                            (py + (sy + 0.5) / SS - c0) / k, pair);
          r += c[0]; g += c[1]; b += c[2];
        }
      }
      const n = SS * SS, i = (py * size + px) * 3;
      buf[i] = Math.round(r / n); buf[i + 1] = Math.round(g / n); buf[i + 2] = Math.round(b / n);
    }
  }
  return png(size, size, buf);
}

/* ---------- 出力 ---------- */
const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });
const files = [
  ['icon-192.png',          192, 0.92, true],
  ['icon-512.png',          512, 0.92, true],
  ['icon-maskable-512.png', 512, 0.64, true],   // マスク時の安全領域に収まるよう小さめ
  ['apple-touch-icon.png',  180, 0.80, true],   // iOSは角を丸めるので余白多め
  ['favicon-32.png',         32, 0.92, false],  // 小さいサイズは1足だけにして潰れを防ぐ
  ['favicon-16.png',         16, 0.92, false]
];
for (const [name, size, scale, pair] of files) {
  const buf = render(size, scale, pair);
  fs.writeFileSync(path.join(out, name), buf);
  console.log(name.padEnd(24), size + 'x' + size, (buf.length / 1024).toFixed(1) + ' KB');
}
