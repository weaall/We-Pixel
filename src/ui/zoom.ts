export const MAX_ZOOM = 64

/**
 * 캔버스 주변에 남길 여백.
 *
 * ResizeObserver의 contentRect는 이미 CSS 패딩을 뺀 값이므로 여기서 크게 잡으면
 * 이중으로 빠져 도트가 작아진다. 그림자가 잘리지 않을 만큼만 둔다.
 * (미리보기는 오버레이라 공간을 예약할 필요가 없다.)
 */
const STAGE_PADDING_PX = 16

/**
 * 확대율을 스테이지 실측 크기에서 계산한다.
 *
 * 고정값으로 잡으면 큰 화면에서 도트가 쓸데없이 작게 보인다.
 * 한 픽셀을 크게 볼수록 찍기 편하므로 남는 공간을 최대한 쓴다.
 */
export function fitZoom(
  w: number,
  h: number,
  stage?: { width: number; height: number },
): number {
  const availW = (stage?.width ?? 640) - STAGE_PADDING_PX
  const availH = (stage?.height ?? 640) - STAGE_PADDING_PX
  const byWidth = Math.floor(availW / w)
  const byHeight = Math.floor(availH / h)
  return Math.min(MAX_ZOOM, Math.max(1, Math.min(byWidth, byHeight)))
}
