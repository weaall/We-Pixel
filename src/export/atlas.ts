import type { PixelDoc } from '../core/doc'
import { createDoc } from '../core/doc'

export interface AtlasSlice {
  name: string
  /** 왼쪽 위 기준. 유니티로 넘길 때 아래 기준으로 뒤집는다. */
  x: number
  y: number
  w: number
  h: number
}

export interface Atlas {
  doc: PixelDoc
  slices: AtlasSlice[]
  columns: number
  rows: number
}

export interface AtlasOptions {
  /** 한 줄에 몇 장. 0이면 한 줄로 늘어놓는다. */
  columns?: number
  /** 칸 사이 여백. 0이 기본이다. */
  padding?: number
}

/**
 * 여러 장을 한 텍스처로 묶는다.
 *
 * 칸 크기는 가장 큰 장에 맞추고 나머지는 칸 안에서 가운데 정렬한다. 크기가
 * 섞인 채로 붙이면 슬라이스 사각형이 어긋나 유니티에서 잘린 스프라이트가 된다.
 *
 * 여백은 기본 0이다. 픽셀 아트는 확대 보간을 끄고 쓰므로 이웃 칸의 색이 새어
 * 들어오지 않는다. 여백을 넣으면 텍스처만 커진다.
 */
export function packAtlas(
  items: ReadonlyArray<{ name: string; doc: PixelDoc }>,
  o: AtlasOptions = {},
): Atlas {
  if (items.length === 0) throw new Error('묶을 그림이 없습니다')

  const cellW = Math.max(...items.map((i) => i.doc.w))
  const cellH = Math.max(...items.map((i) => i.doc.h))
  const pad = Math.max(0, Math.floor(o.padding ?? 0))
  const columns = Math.max(1, Math.floor(o.columns || items.length))
  const rows = Math.ceil(items.length / columns)

  const doc = createDoc(
    columns * cellW + pad * (columns - 1),
    rows * cellH + pad * (rows - 1),
  )

  const slices: AtlasSlice[] = []
  items.forEach((item, i) => {
    const col = i % columns
    const row = Math.floor(i / columns)
    const cx = col * (cellW + pad)
    const cy = row * (cellH + pad)
    // 칸보다 작은 장은 가운데에 둔다. 왼쪽 위에 붙이면 세트가 들쭉날쭉해 보인다.
    const ox = cx + Math.floor((cellW - item.doc.w) / 2)
    const oy = cy + Math.floor((cellH - item.doc.h) / 2)

    for (let y = 0; y < item.doc.h; y++) {
      const src = y * item.doc.w * 4
      const dst = ((oy + y) * doc.w + ox) * 4
      doc.data.set(item.doc.data.subarray(src, src + item.doc.w * 4), dst)
    }

    // 슬라이스는 칸 전체다. 그림에 맞춰 좁히면 장마다 피벗이 달라져
    // 굴릴 때 주사위가 튄다.
    slices.push({ name: item.name, x: cx, y: cy, w: cellW, h: cellH })
  })

  return { doc, slices, columns, rows }
}
