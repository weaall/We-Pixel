export type MoveMode = 'none' | 'horizontal' | 'topDown'

export interface ActionSpec {
  className: string
  move: MoveMode
  jump: boolean
  flipSprite: boolean
  animate: boolean
  moveSpeed: number
  jumpForce: number
  animFps: number
  /** 자유 서술 요구사항. 코드 상단 주석으로 들어간다. */
  notes: string
}

export const defaultActionSpec: ActionSpec = {
  className: 'PixelActor',
  move: 'horizontal',
  jump: true,
  flipSprite: true,
  animate: false,
  moveSpeed: 5,
  jumpForce: 9,
  animFps: 8,
  notes: '',
}

/** C# 식별자로 쓸 수 있게 정리한다. 파일명도 이 값을 따라간다. */
export function sanitizeClassName(raw: string): string {
  const cleaned = raw.replace(/[^A-Za-z0-9_]/g, '')
  if (cleaned.length === 0) return 'PixelActor'
  return /^[0-9]/.test(cleaned) ? '_' + cleaned : cleaned
}

/**
 * 액터 스크립트 생성.
 *
 * 점프를 켜면 Rigidbody2D 기반으로 전환된다. transform.Translate와 Rigidbody2D를
 * 섞으면 물리 엔진과 싸우게 되므로, 물리를 쓸 때는 이동도 velocity로 처리한다.
 */
export function generateActorScript(spec: ActionSpec): string {
  const cls = sanitizeClassName(spec.className)
  const usesPhysics = spec.jump
  const needsSprite = spec.flipSprite || spec.animate
  const readsHorizontal =
    spec.move === 'horizontal' || spec.move === 'topDown' || spec.flipSprite

  const L: string[] = []
  const p = (line = '') => L.push(line)

  p('using UnityEngine;')
  p()
  p('/// <summary>')
  p('/// We-Pixel에서 생성된 액터 스크립트.')
  p('/// 입력은 레거시 Input Manager를 사용한다. 프로젝트의')
  p('/// Player Settings > Active Input Handling이 "Input System Package (New)"')
  p('/// 단독으로 설정되어 있으면 "Both"로 바꿔야 동작한다.')
  p('/// </summary>')
  for (const line of noteLines(spec.notes)) p(line)
  if (needsSprite) p('[RequireComponent(typeof(SpriteRenderer))]')
  if (usesPhysics) p('[RequireComponent(typeof(Rigidbody2D))]')
  p('public class ' + cls + ' : MonoBehaviour')
  p('{')

  if (spec.move !== 'none') {
    p('    [Header("이동")]')
    p('    [SerializeField] float moveSpeed = ' + num(spec.moveSpeed) + 'f;')
    p()
  }
  if (spec.jump) {
    p('    [Header("점프")]')
    p('    [SerializeField] float jumpForce = ' + num(spec.jumpForce) + 'f;')
    p('    [Tooltip("발밑에 빈 자식 오브젝트를 만들어 연결한다. 비우면 본체 위치를 쓴다.")]')
    p('    [SerializeField] Transform groundCheck;')
    p('    [SerializeField] float groundCheckRadius = 0.12f;')
    p('    [Tooltip("바닥으로 인정할 레이어. 자기 자신의 레이어는 빼는 것이 안전하다.")]')
    p('    [SerializeField] LayerMask groundLayer = ~0;')
    p()
  }
  if (spec.animate) {
    p('    [Header("애니메이션")]')
    p('    [SerializeField] Sprite[] frames;')
    p('    [SerializeField] float framesPerSecond = ' + num(spec.animFps) + 'f;')
    p()
  }

  if (needsSprite) p('    SpriteRenderer spriteRenderer;')
  if (usesPhysics) p('    Rigidbody2D body;')
  if (readsHorizontal) p('    float inputX;')
  if (spec.move === 'topDown') p('    float inputY;')
  if (spec.jump) p('    bool jumpQueued;')
  if (spec.animate) {
    p('    float animTimer;')
    p('    int animIndex;')
  }
  p()

  p('    void Awake()')
  p('    {')
  if (needsSprite) p('        spriteRenderer = GetComponent<SpriteRenderer>();')
  if (usesPhysics) p('        body = GetComponent<Rigidbody2D>();')
  if (!needsSprite && !usesPhysics) p('        // 캐시할 컴포넌트가 없다.')
  p('    }')
  p()

  if (usesPhysics) {
    p('    // Unity 6에서 Rigidbody2D.velocity가 linearVelocity로 이름이 바뀌었다.')
    p('    // 두 버전 모두에서 컴파일되도록 한 곳에서만 분기한다.')
    p('    Vector2 Velocity')
    p('    {')
    p('#if UNITY_6000_0_OR_NEWER')
    p('        get => body.linearVelocity;')
    p('        set => body.linearVelocity = value;')
    p('#else')
    p('        get => body.velocity;')
    p('        set => body.velocity = value;')
    p('#endif')
    p('    }')
    p()
  }

  p('    void Update()')
  p('    {')
  if (readsHorizontal) p('        inputX = Input.GetAxisRaw("Horizontal");')
  if (spec.move === 'topDown') p('        inputY = Input.GetAxisRaw("Vertical");')
  if (spec.jump) {
    p()
    p('        // GetButtonDown은 프레임 단위 이벤트라 FixedUpdate에서 직접 읽으면')
    p('        // 물리 스텝 사이에 눌린 입력을 놓친다. 여기서 받아 큐에 담는다.')
    p('        if (Input.GetButtonDown("Jump")) jumpQueued = true;')
  }
  if (!usesPhysics && spec.move === 'horizontal') {
    p()
    p('        transform.Translate(new Vector3(inputX, 0f, 0f) * (moveSpeed * Time.deltaTime));')
  }
  if (!usesPhysics && spec.move === 'topDown') {
    p()
    p('        Vector2 dir = new Vector2(inputX, inputY);')
    p('        if (dir.sqrMagnitude > 1f) dir.Normalize();')
    p('        transform.Translate((Vector3)(dir * (moveSpeed * Time.deltaTime)));')
  }
  if (spec.flipSprite) {
    p()
    p('        if (Mathf.Abs(inputX) > 0.01f) spriteRenderer.flipX = inputX < 0f;')
  }
  if (spec.animate) {
    p()
    p('        Animate();')
  }
  p('    }')

  if (usesPhysics) {
    p()
    p('    void FixedUpdate()')
    p('    {')
    if (spec.move === 'horizontal' || spec.move === 'topDown') {
      p('        Velocity = new Vector2(inputX * moveSpeed, Velocity.y);')
    }
    if (spec.jump) {
      if (spec.move !== 'none') p()
      p('        if (jumpQueued)')
      p('        {')
      p('            jumpQueued = false;')
      p('            if (IsGrounded()) Velocity = new Vector2(Velocity.x, jumpForce);')
      p('        }')
    }
    p('    }')
    p()
    p('    bool IsGrounded()')
    p('    {')
    p('        Vector2 origin = groundCheck != null')
    p('            ? (Vector2)groundCheck.position')
    p('            : (Vector2)transform.position;')
    p()
    p('        Collider2D hit = Physics2D.OverlapCircle(origin, groundCheckRadius, groundLayer);')
    p('        // 자기 콜라이더에 걸리면 공중에서도 항상 접지로 판정된다.')
    p('        return hit != null && !hit.transform.IsChildOf(transform);')
    p('    }')
    p()
    p('    void OnDrawGizmosSelected()')
    p('    {')
    p('        Vector3 origin = groundCheck != null ? groundCheck.position : transform.position;')
    p('        Gizmos.color = Color.green;')
    p('        Gizmos.DrawWireSphere(origin, groundCheckRadius);')
    p('    }')
  }

  if (spec.animate) {
    p()
    p('    void Animate()')
    p('    {')
    p('        if (frames == null || frames.Length == 0) return;')
    p()
    p('        animTimer += Time.deltaTime;')
    p('        float step = 1f / Mathf.Max(0.01f, framesPerSecond);')
    p('        while (animTimer >= step)')
    p('        {')
    p('            animTimer -= step;')
    p('            animIndex = (animIndex + 1) % frames.Length;')
    p('        }')
    p('        spriteRenderer.sprite = frames[animIndex];')
    p('    }')
  }

  p('}')
  return L.join('\n') + '\n'
}

/** 자유 서술을 안전한 한 줄 주석들로 바꾼다. */
function noteLines(notes: string): string[] {
  const trimmed = notes.trim()
  if (trimmed.length === 0) return []
  const out = ['// 요구사항:']
  for (const line of trimmed.split(/\r?\n/)) {
    // 블록 주석 종료 토큰이 섞여도 깨지지 않도록 한 줄 주석만 쓴다.
    out.push('//   ' + line.replace(/\*\//g, '* /'))
  }
  return out
}

/** C# float 리터럴 앞에 붙일 수 문자열. */
function num(v: number): string {
  return Number.isFinite(v) ? String(v) : '0'
}
