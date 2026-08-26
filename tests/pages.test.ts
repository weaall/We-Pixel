import { describe, expect, it } from 'vitest'
import { createPage, nextPageName, uniqueName } from '../src/storage/pages'

describe('nextPageName', () => {
  it('빈 목록이면 1번이다', () => {
    expect(nextPageName([])).toBe('페이지 1')
  })

  it('빈 번호를 채운다', () => {
    // 2번을 닫고 새로 만들면 2번이 다시 나와야 한다. 목록 길이로 세면 3번이 된다.
    const pages = [createPage('페이지 1'), createPage('페이지 3')]
    expect(nextPageName(pages)).toBe('페이지 2')
  })

  it('접두어를 바꿀 수 있다', () => {
    expect(nextPageName([], '변형')).toBe('변형 1')
  })
})

describe('uniqueName', () => {
  it('겹치지 않으면 그대로 쓴다', () => {
    expect(uniqueName([], '불꽃')).toBe('불꽃')
  })

  it('겹치면 번호를 붙인다', () => {
    // 모델이 같은 이름을 두 번 지어 주는 일이 있다.
    const pages = [createPage('불꽃')]
    expect(uniqueName(pages, '불꽃')).toBe('불꽃 2')
    expect(uniqueName([...pages, createPage('불꽃 2')], '불꽃')).toBe('불꽃 3')
  })
})
