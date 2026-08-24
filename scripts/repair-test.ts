/**
 * Gemini 응답 보정 로직 테스트.
 *
 * 모델이 행 길이나 팔레트를 틀리는 것은 예외가 아니라 일상이다.
 * 이 함수가 조용히 잘못 고치면 결과물 품질이 원인 불명으로 나빠진다.
 */
import { repairSpec } from '../server/gemini'
import { fromSpec } from '../src/core/codec'

const results: string[] = []
const check = (name: string, pass: boolean, detail = '') =>
  results.push(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)

const palette = [
  { char: 'k', hex: '#101018' },
  { char: 'g', hex: '#4caf50' },
]

// 정상 입력
{
  const r = repairSpec({ palette, rows: ['kkkk', 'kggk', 'kggk', 'kkkk'] }, 4, 4)
  check('정상 입력 무경고', r.warnings.length === 0, r.warnings.join('; '))
  check('투명 문자 자동 추가', r.palette['.'] === 'transparent')
  check('fromSpec 통과', (() => { try { fromSpec(r); return true } catch { return false } })())
}

// 행 수 부족
{
  const r = repairSpec({ palette, rows: ['kkkk', 'kggk'] }, 4, 4)
  check('행 수 부족 보정', r.rows.length === 4, `${r.rows.length}행`)
  check('부족분 투명 채움', r.rows[3] === '....')
  check('행 수 경고', r.warnings.some((w) => w.includes('행 수')))
}

// 행 수 초과
{
  const r = repairSpec({ palette, rows: ['kkkk', 'kkkk', 'kkkk', 'kkkk', 'kkkk', 'kkkk'] }, 4, 4)
  check('행 수 초과 절단', r.rows.length === 4)
}

// 행 길이 불일치
{
  const r = repairSpec({ palette, rows: ['kk', 'kggkkk', 'kggk', 'k'] }, 4, 4)
  check('행 길이 통일', r.rows.every((row) => row.length === 4), r.rows.join('|'))
  check('짧은 행 우측 투명', r.rows[0] === 'kk..')
  check('긴 행 절단', r.rows[1] === 'kggk')
  check('길이 경고', r.warnings.some((w) => w.includes('길이')))
}

// 팔레트에 없는 문자
{
  const r = repairSpec({ palette, rows: ['kZkk', 'kggk', 'kggk', 'kkkk'] }, 4, 4)
  check('미정의 문자 투명화', r.rows[0] === 'k.kk', r.rows[0])
  check('문자 경고', r.warnings.some((w) => w.includes('팔레트에 없는')))
  check('보정 후 fromSpec 통과', (() => { try { fromSpec(r); return true } catch { return false } })())
}

// 잘못된 팔레트 항목은 버려진다
{
  const r = repairSpec(
    { palette: [...palette, { char: 'toolong', hex: '#fff' }, { char: 'x', hex: 'not-a-hex' }, { char: '.', hex: '#000' }], rows: ['kkkk','kkkk','kkkk','kkkk'] },
    4, 4,
  )
  check('긴 char 무시', r.palette['toolong'] === undefined)
  check('잘못된 hex 무시', r.palette['x'] === undefined)
  check('투명 문자 덮어쓰기 방지', r.palette['.'] === 'transparent')
}

// 팔레트가 아예 쓸 수 없으면 실패해야 한다
{
  let threw = false
  try { repairSpec({ palette: [], rows: ['....'] }, 4, 1) } catch { threw = true }
  check('빈 팔레트는 오류', threw)
}

console.log(results.join('\n'))
const failed = results.filter((r) => r.startsWith('FAIL')).length
console.log(`\n${results.length - failed}/${results.length} 통과`)
process.exit(failed === 0 ? 0 : 1)
