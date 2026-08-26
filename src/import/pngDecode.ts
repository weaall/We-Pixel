import { inflateSync } from 'node:zlib'
import type { PixelDoc } from '../core/doc'

/**
 * 최소 PNG 디코더. 8비트 색 유형 0/2/3/6, 인터레이스 없음.
 *
 * 브라우저에는 createImageBitmap 이 있지만 Node 에는 없다. 분석 스크립트가
 * 브라우저를 띄우지 않고 같은 코어 코드를 쓰려면 여기서 풀어야 한다.
 */
export function decodePng(buf: Buffer): PixelDoc {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('PNG 시그니처가 아닙니다')

  let w = 0
  let h = 0
  let depth = 0
  let colorType = 0
  let palette: Buffer | null = null
  let trns: Buffer | null = null
  const idat: Buffer[] = []

  let p = 8
  while (p < buf.length) {
    const len = buf.readUInt32BE(p)
    const type = buf.toString('ascii', p + 4, p + 8)
    const body = buf.subarray(p + 8, p + 8 + len)
    if (type === 'IHDR') {
      w = body.readUInt32BE(0)
      h = body.readUInt32BE(4)
      depth = body[8]
      colorType = body[9]
      if (body[12] !== 0) throw new Error('인터레이스 PNG 는 지원하지 않습니다')
    } else if (type === 'PLTE') palette = Buffer.from(body)
    else if (type === 'tRNS') trns = Buffer.from(body)
    else if (type === 'IDAT') idat.push(Buffer.from(body))
    else if (type === 'IEND') break
    p += 12 + len
  }
  if (depth !== 8) throw new Error(`비트 깊이 ${depth} 는 지원하지 않습니다`)

  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType]
  if (channels === undefined) throw new Error(`색 유형 ${colorType} 는 지원하지 않습니다`)

  const raw = inflateSync(Buffer.concat(idat))
  const stride = w * channels
  const lines = unfilter(raw, h, stride, channels)

  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = y * stride + x * channels
      const d = (y * w + x) * 4
      if (colorType === 3) {
        const i = lines[s] * 3
        data[d] = palette![i]
        data[d + 1] = palette![i + 1]
        data[d + 2] = palette![i + 2]
        data[d + 3] = trns && lines[s] < trns.length ? trns[lines[s]] : 255
      } else if (colorType === 0 || colorType === 4) {
        data[d] = data[d + 1] = data[d + 2] = lines[s]
        data[d + 3] = colorType === 4 ? lines[s + 1] : 255
      } else {
        data[d] = lines[s]
        data[d + 1] = lines[s + 1]
        data[d + 2] = lines[s + 2]
        data[d + 3] = colorType === 6 ? lines[s + 3] : 255
      }
    }
  }
  return { w, h, data }
}

/** PNG 는 줄마다 다섯 가지 예측 필터 중 하나를 쓴다. 되돌려야 원본 바이트가 나온다. */
function unfilter(raw: Buffer, h: number, stride: number, channels: number): Buffer {
  const out = Buffer.alloc(h * stride)
  let pos = 0
  for (let y = 0; y < h; y++) {
    const filter = raw[pos++]
    const line = raw.subarray(pos, pos + stride)
    pos += stride
    const o = y * stride
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? out[o + i - channels] : 0
      const b = y > 0 ? out[o - stride + i] : 0
      const c = i >= channels && y > 0 ? out[o - stride + i - channels] : 0
      let v = line[i]
      switch (filter) {
        case 1: v += a; break
        case 2: v += b; break
        case 3: v += (a + b) >> 1; break
        case 4: {
          const pa = Math.abs(b - c)
          const pb = Math.abs(a - c)
          const pc = Math.abs(a + b - 2 * c)
          v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
          break
        }
      }
      out[o + i] = v & 255
    }
  }
  return out
}
