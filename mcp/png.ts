import { deflateSync } from 'node:zlib'
import type { PixelDoc } from '../src/core/doc'

/**
 * Node용 PNG 인코더.
 *
 * 브라우저 쪽은 canvas.toBlob을 쓰지만 Node에는 canvas가 없다.
 * PNG는 zlib 스트림 + CRC32 청크에 불과하므로 의존성을 추가하지 않고 직접 쓴다.
 * core/ 가 DOM에 의존하지 않게 설계해 둔 덕분에 문서 표현은 그대로 재사용한다.
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** 길이(4) + 타입(4) + 데이터 + CRC(4). CRC는 타입부터 데이터 끝까지 계산한다. */
function chunk(type: string, data: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(12 + data.length))
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

/** 최근접 이웃 확대. 픽셀 아트에 보간을 쓰면 안 된다. */
function upscale(doc: PixelDoc, scale: number): { w: number; h: number; data: Uint8ClampedArray } {
  if (scale === 1) return { w: doc.w, h: doc.h, data: doc.data }

  const w = doc.w * scale
  const h = doc.h * scale
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    const sy = (y / scale) | 0
    for (let x = 0; x < w; x++) {
      const sx = (x / scale) | 0
      const src = (sy * doc.w + sx) * 4
      const dst = (y * w + x) * 4
      data[dst] = doc.data[src]
      data[dst + 1] = doc.data[src + 1]
      data[dst + 2] = doc.data[src + 2]
      data[dst + 3] = doc.data[src + 3]
    }
  }
  return { w, h, data }
}

export function encodePng(doc: PixelDoc, scale = 1): Uint8Array<ArrayBuffer> {
  const img = upscale(doc, Math.max(1, Math.floor(scale)))

  // 스캔라인마다 필터 바이트(0 = None)를 앞에 붙인다.
  const raw = new Uint8Array((img.w * 4 + 1) * img.h)
  for (let y = 0; y < img.h; y++) {
    const dst = y * (img.w * 4 + 1)
    raw[dst] = 0
    raw.set(img.data.subarray(y * img.w * 4, (y + 1) * img.w * 4), dst + 1)
  }

  const ihdr = new Uint8Array(new ArrayBuffer(13))
  const view = new DataView(ihdr.buffer)
  view.setUint32(0, img.w)
  view.setUint32(4, img.h)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: RGBA
  ihdr[10] = 0 // compression: deflate
  ihdr[11] = 0 // filter method
  ihdr[12] = 0 // interlace: none

  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', new Uint8Array(deflateSync(raw, { level: 9 }))),
    chunk('IEND', new Uint8Array(0)),
  ]

  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(new ArrayBuffer(total))
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.length
  }
  return out
}

/** buildPackage에 주입할 인코더. */
export async function encodePngAsync(doc: PixelDoc, scale: number): Promise<Uint8Array> {
  return encodePng(doc, scale)
}

export function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64')
}
