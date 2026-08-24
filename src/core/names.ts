/**
 * 디자인 이름 규칙. 서버(파일명)와 브라우저(저장소 키) 양쪽이 같은 규칙을 써야
 * 한쪽에서 저장한 것을 다른 쪽에서 못 여는 일이 생기지 않는다.
 *
 * 서버에서는 이 값이 파일 경로가 되므로 화이트리스트로만 통과시킨다.
 */
export const DESIGN_NAME_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

export function isValidDesignName(name: string): boolean {
  return DESIGN_NAME_PATTERN.test(name.trim())
}

export const DESIGN_NAME_RULE = '영문, 숫자, 밑줄, 하이픈만 쓸 수 있습니다 (최대 64자).'
