import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { IconClose } from './icons'

export interface ModalProps {
  title: string
  onClose: () => void
  children: ReactNode
  /** 내용이 넓어야 하는 모달(내보내기 등)은 넓게 연다. */
  wide?: boolean
}

/**
 * 사이드바 대신 쓰는 모달.
 *
 * 창을 절반 폭으로 써도 캔버스가 좁아지지 않으려면 패널이 상주하면 안 된다.
 * 필요할 때만 띄우고 닫는다.
 */
export function Modal({ title, onClose, children, wide = false }: ModalProps) {
  const panelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    // 캡처 단계에서 잡는다. 그래야 App의 전역 단축키보다 먼저 처리된다.
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  useEffect(() => {
    // 열릴 때 포커스를 안으로 옮긴다. 그래야 Esc와 탭 이동이 바로 먹는다.
    panelRef.current?.focus()
  }, [])

  return (
    <div
      className="modal-backdrop"
      onPointerDown={(e) => {
        // 배경을 직접 눌렀을 때만 닫는다. 내용에서 시작한 드래그가 배경에서 끝나도
        // 닫히면 안 된다.
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className={`modal${wide ? ' wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={panelRef}
      >
        <header className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} title="닫기 (Esc)" aria-label="닫기">
            <IconClose size={16} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}
