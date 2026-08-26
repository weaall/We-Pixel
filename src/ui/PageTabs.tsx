import { useEffect, useRef, useState } from 'react'
import type { Page } from '../storage/pages'
import { IconClose } from './icons'

export interface PageTabsProps {
  pages: ReadonlyArray<Page>
  activeId: string
  onSelect: (id: string) => void
  onAdd: () => void
  onClose: (id: string) => void
  onRename: (id: string, name: string) => void
}

export function PageTabs(props: PageTabsProps) {
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (editing !== null) inputRef.current?.select()
  }, [editing])

  const commit = () => {
    if (editing === null) return
    const name = draft.trim()
    if (name.length > 0) props.onRename(editing, name)
    setEditing(null)
  }

  return (
    <div className="page-tabs">
      {props.pages.map((page) => (
        <div
          key={page.id}
          className={`page-tab${page.id === props.activeId ? ' active' : ''}`}
          onClick={() => props.onSelect(page.id)}
          onDoubleClick={() => {
            setEditing(page.id)
            setDraft(page.name)
          }}
          title={`${page.name} — ${page.doc.w}×${page.doc.h} (두 번 클릭해 이름 변경)`}
        >
          {editing === page.id ? (
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit()
                if (e.key === 'Escape') setEditing(null)
                // 이름을 고치는 중에는 캔버스 단축키가 끼어들면 안 된다.
                e.stopPropagation()
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <>
              <span className="page-name">{page.name}</span>
              <span className="page-size">
                {page.doc.w}×{page.doc.h}
              </span>
              {/* 마지막 한 장은 닫지 못하게 한다. 빈 화면이 되면 갈 곳이 없다. */}
              {props.pages.length > 1 && (
                <button
                  className="page-close"
                  aria-label={`${page.name} 닫기`}
                  title="닫기 (저장된 내용도 지워집니다)"
                  onClick={(e) => {
                    e.stopPropagation()
                    props.onClose(page.id)
                  }}
                >
                  <IconClose size={11} />
                </button>
              )}
            </>
          )}
        </div>
      ))}

      <button className="page-add" onClick={props.onAdd} title="새 페이지" aria-label="새 페이지">
        +
      </button>
    </div>
  )
}
