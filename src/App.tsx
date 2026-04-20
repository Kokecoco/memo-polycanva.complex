import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import type { PartialBlock } from '@blocknote/core'
import { BlockNoteView } from '@blocknote/mantine'
import { useCreateBlockNote } from '@blocknote/react'
import { MantineProvider } from '@mantine/core'
import '@mantine/core/styles.css'
import '@blocknote/core/fonts/inter.css'
import '@blocknote/mantine/style.css'
import './App.css'

type PageId = string

interface MemoPage {
  id: PageId
  title: string
  parentId: PageId | null
  childrenIds: PageId[]
  content: string
  isPinned: boolean
  updatedAt: number
  isTrashed: boolean
  trashedAt: number | null
}

interface Workspace {
  pages: Record<PageId, MemoPage>
  rootPageIds: PageId[]
  selectedPageId: PageId
}

type ContextMenuTarget =
  | { kind: 'page'; pageId: PageId }
  | { kind: 'sidebar' }
  | { kind: 'editor'; pageId: PageId | null }

interface ContextMenuState {
  target: ContextMenuTarget
  x: number
  y: number
}

interface CommandAction {
  id: string
  label: string
  description: string
  shortcut?: string
  tags: string[]
  prefixes?: Array<'/' | '@'>
  disabled?: boolean
  run: () => void
}

const DB_NAME = 'memo-polycanva'
const DB_VERSION = 1
const STORE_NAME = 'workspace'
const STORE_KEY = 'default'
const MAX_SEARCH_RESULTS = 20
let fallbackIdCounter = 0

const defaultContent: PartialBlock[] = [
  {
    type: 'paragraph',
    content: 'ここにメモを書いてください。',
  },
]

function createPage(parentId: PageId | null = null, title = '新しいページ'): MemoPage {
  const fallbackId = `${Date.now()}-${Math.round((globalThis.performance?.now?.() ?? 0) * 1000)}-${fallbackIdCounter++}`
  const now = Date.now()
  return {
    id: globalThis.crypto?.randomUUID?.() ?? fallbackId,
    title,
    parentId,
    childrenIds: [],
    content: JSON.stringify(defaultContent),
    isPinned: false,
    updatedAt: now,
    isTrashed: false,
    trashedAt: null,
  }
}

function createDefaultWorkspace(): Workspace {
  const firstPage = createPage(null, 'ホーム')
  return {
    pages: { [firstPage.id]: firstPage },
    rootPageIds: [firstPage.id],
    selectedPageId: firstPage.id,
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME)
      }
    }
  })
}

async function loadWorkspaceFromIndexedDB(): Promise<Workspace | null> {
  const database = await openDatabase()

  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const request = store.get(STORE_KEY)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      resolve(normalizeWorkspace(request.result))
    }
  })
}

async function saveWorkspaceToIndexedDB(workspace: Workspace): Promise<void> {
  const database = await openDatabase()

  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)

    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)

    store.put(workspace, STORE_KEY)
  })
}

function normalizeWorkspace(value: unknown): Workspace | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const candidate = value as Partial<Workspace>
  if (!candidate.pages || typeof candidate.pages !== 'object' || !Array.isArray(candidate.rootPageIds) || typeof candidate.selectedPageId !== 'string') {
    return null
  }

  const pages: Record<string, MemoPage> = {}
  for (const [id, rawPage] of Object.entries(candidate.pages)) {
    if (!rawPage || typeof rawPage !== 'object') {
      continue
    }

    const page = rawPage as Partial<MemoPage>
    const updatedAt = typeof page.updatedAt === 'number' && Number.isFinite(page.updatedAt) ? page.updatedAt : Date.now()
    const isTrashed = page.isTrashed === true

    pages[id] = {
      id,
      title: typeof page.title === 'string' && page.title.trim() ? page.title : '無題',
      parentId: typeof page.parentId === 'string' ? page.parentId : null,
      childrenIds: Array.isArray(page.childrenIds) ? page.childrenIds.filter((childId): childId is string => typeof childId === 'string') : [],
      content: typeof page.content === 'string' ? page.content : JSON.stringify(defaultContent),
      isPinned: page.isPinned === true,
      updatedAt,
      isTrashed,
      trashedAt: isTrashed && typeof page.trashedAt === 'number' && Number.isFinite(page.trashedAt) ? page.trashedAt : null,
    }
  }

  const rootPageIds = candidate.rootPageIds.filter((id): id is string => typeof id === 'string' && Boolean(pages[id]))
  if (rootPageIds.length === 0) {
    return createDefaultWorkspace()
  }

  const selectedPageId = pages[candidate.selectedPageId] ? candidate.selectedPageId : rootPageIds[0]

  return {
    pages,
    rootPageIds,
    selectedPageId,
  }
}

function parseContent(raw: string): PartialBlock[] {
  if (!raw) {
    return defaultContent
  }

  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as PartialBlock[]) : defaultContent
  } catch {
    return defaultContent
  }
}

function collectDescendants(pages: Record<PageId, MemoPage>, targetId: PageId): PageId[] {
  const page = pages[targetId]
  if (!page) {
    return []
  }

  const collected: PageId[] = []
  for (const childId of page.childrenIds) {
    collected.push(childId, ...collectDescendants(pages, childId))
  }
  return collected
}

function findFirstPageId(workspace: Workspace, wantTrashed: boolean): PageId | null {
  for (const rootId of workspace.rootPageIds) {
    const rootPage = workspace.pages[rootId]
    if (rootPage && rootPage.isTrashed === wantTrashed) {
      return rootId
    }
  }

  for (const page of Object.values(workspace.pages)) {
    if (page.isTrashed === wantTrashed) {
      return page.id
    }
  }

  return null
}

function collectText(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value]
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectText(item))
  }

  if (value && typeof value === 'object') {
    return Object.values(value).flatMap((item) => collectText(item))
  }

  return []
}

function contentToText(raw: string): string {
  try {
    const parsed = JSON.parse(raw)
    return collectText(parsed).join(' ')
  } catch {
    return raw
  }
}

function formatDateTime(timestamp: number): string {
  if (!Number.isFinite(timestamp)) {
    return '不明'
  }

  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) {
    return '不明'
  }

  return date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  const tagName = target.tagName
  return target.isContentEditable
    || tagName === 'INPUT'
    || tagName === 'TEXTAREA'
    || tagName === 'SELECT'
    || target.closest('[contenteditable="true"]') !== null
}

function downloadJson(workspace: Workspace): void {
  const now = new Date()
  const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`
  const blob = new Blob([JSON.stringify(workspace, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `memo-workspace-${timestamp}.json`
  link.click()
  URL.revokeObjectURL(url)
}

function Editor({ content, onContentChange }: { content: string; onContentChange: (content: string) => void }) {
  const initialContent = useMemo(() => parseContent(content), [content])
  const editor = useCreateBlockNote({ initialContent })

  return (
    <BlockNoteView
      editor={editor}
      onChange={() => {
        onContentChange(JSON.stringify(editor.document))
      }}
      slashMenu
      sideMenu
      formattingToolbar
    />
  )
}

function App() {
  const [workspace, setWorkspace] = useState<Workspace>(() => createDefaultWorkspace())
  const [isLoaded, setIsLoaded] = useState(false)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showTrash, setShowTrash] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let mounted = true

    void loadWorkspaceFromIndexedDB()
      .then((savedWorkspace) => {
        if (mounted && savedWorkspace) {
          setWorkspace(savedWorkspace)
        }
      })
      .finally(() => {
        if (mounted) {
          setIsLoaded(true)
        }
      })

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (!isLoaded) {
      return
    }

    void saveWorkspaceToIndexedDB(workspace)
  }, [workspace, isLoaded])

  useEffect(() => {
    if (!contextMenu) {
      return
    }

    const hide = () => setContextMenu(null)
    window.addEventListener('click', hide)
    return () => {
      window.removeEventListener('click', hide)
    }
  }, [contextMenu])

  const addPage = useCallback((parentId: PageId | null) => {
    setWorkspace((previousWorkspace) => {
      const nextPage = createPage(parentId)
      const nextPages = {
        ...previousWorkspace.pages,
        [nextPage.id]: nextPage,
      }

      if (parentId && nextPages[parentId]) {
        nextPages[parentId] = {
          ...nextPages[parentId],
          childrenIds: [...nextPages[parentId].childrenIds, nextPage.id],
          updatedAt: Date.now(),
        }
      }

      return {
        ...previousWorkspace,
        pages: nextPages,
        rootPageIds: parentId ? previousWorkspace.rootPageIds : [...previousWorkspace.rootPageIds, nextPage.id],
        selectedPageId: nextPage.id,
      }
    })
    setShowTrash(false)
    setContextMenu(null)
  }, [])

  const renamePage = useCallback((pageId: PageId) => {
    const current = workspace.pages[pageId]
    if (!current || current.isTrashed) {
      return
    }

    const nextTitle = window.prompt('ページ名を入力してください', current.title)?.trim()
    if (!nextTitle) {
      return
    }

    setWorkspace((previousWorkspace) => ({
      ...previousWorkspace,
      pages: {
        ...previousWorkspace.pages,
        [pageId]: {
          ...previousWorkspace.pages[pageId],
          title: nextTitle,
          updatedAt: Date.now(),
        },
      },
    }))
    setContextMenu(null)
  }, [workspace.pages])

  const togglePin = useCallback((pageId: PageId) => {
    setWorkspace((previousWorkspace) => {
      const page = previousWorkspace.pages[pageId]
      if (!page || page.isTrashed) {
        return previousWorkspace
      }

      return {
        ...previousWorkspace,
        pages: {
          ...previousWorkspace.pages,
          [pageId]: {
            ...page,
            isPinned: !page.isPinned,
            updatedAt: Date.now(),
          },
        },
      }
    })
    setContextMenu(null)
  }, [])

  const movePageToRoot = useCallback((pageId: PageId) => {
    setWorkspace((previousWorkspace) => {
      const targetPage = previousWorkspace.pages[pageId]
      if (!targetPage || targetPage.parentId === null || targetPage.isTrashed) {
        return previousWorkspace
      }

      const parentPage = previousWorkspace.pages[targetPage.parentId]
      const now = Date.now()
      const nextPages = {
        ...previousWorkspace.pages,
        [pageId]: {
          ...targetPage,
          parentId: null,
          updatedAt: now,
        },
      }

      if (parentPage) {
        nextPages[parentPage.id] = {
          ...parentPage,
          childrenIds: parentPage.childrenIds.filter((childId) => childId !== pageId),
          updatedAt: now,
        }
      }

      const nextRootPageIds = previousWorkspace.rootPageIds.includes(pageId)
        ? previousWorkspace.rootPageIds
        : [...previousWorkspace.rootPageIds, pageId]

      return {
        ...previousWorkspace,
        pages: nextPages,
        rootPageIds: nextRootPageIds,
      }
    })
    setContextMenu(null)
  }, [])

  const movePageToTrash = useCallback((pageId: PageId) => {
    setWorkspace((previousWorkspace) => {
      const targetPage = previousWorkspace.pages[pageId]
      if (!targetPage || targetPage.isTrashed) {
        return previousWorkspace
      }

      const now = Date.now()
      const allTrashIds = [pageId, ...collectDescendants(previousWorkspace.pages, pageId)]
      const trashSet = new Set(allTrashIds)
      const nextPages = {
        ...previousWorkspace.pages,
      }

      for (const id of trashSet) {
        const page = previousWorkspace.pages[id]
        if (!page) {
          continue
        }

        nextPages[id] = {
          ...page,
          isTrashed: true,
          trashedAt: now,
          updatedAt: now,
        }
      }

      let nextSelectedPageId = previousWorkspace.selectedPageId
      if (trashSet.has(previousWorkspace.selectedPageId)) {
        nextSelectedPageId = findFirstPageId({ ...previousWorkspace, pages: nextPages }, false) ?? previousWorkspace.selectedPageId
      }

      return {
        ...previousWorkspace,
        pages: nextPages,
        selectedPageId: nextSelectedPageId,
      }
    })

    setShowTrash(true)
    setContextMenu(null)
  }, [])

  const restorePage = useCallback((pageId: PageId) => {
    setWorkspace((previousWorkspace) => {
      const targetPage = previousWorkspace.pages[pageId]
      if (!targetPage || !targetPage.isTrashed) {
        return previousWorkspace
      }

      const now = Date.now()
      const allRestoreIds = [pageId, ...collectDescendants(previousWorkspace.pages, pageId)]
      const restoreSet = new Set(allRestoreIds)
      const nextPages = {
        ...previousWorkspace.pages,
      }

      for (const id of restoreSet) {
        const page = previousWorkspace.pages[id]
        if (!page) {
          continue
        }

        nextPages[id] = {
          ...page,
          isTrashed: false,
          trashedAt: null,
          updatedAt: now,
        }
      }

      const restoredTarget = nextPages[pageId]
      if (restoredTarget.parentId) {
        const parent = nextPages[restoredTarget.parentId]
        if (!parent || parent.isTrashed) {
          nextPages[pageId] = {
            ...restoredTarget,
            parentId: null,
          }
          if (!previousWorkspace.rootPageIds.includes(pageId)) {
            return {
              ...previousWorkspace,
              pages: nextPages,
              rootPageIds: [...previousWorkspace.rootPageIds, pageId],
              selectedPageId: pageId,
            }
          }
        }
      }

      return {
        ...previousWorkspace,
        pages: nextPages,
        selectedPageId: pageId,
      }
    })

    setShowTrash(false)
    setContextMenu(null)
  }, [])

  const permanentlyDeletePage = useCallback((pageId: PageId) => {
    const accepted = window.confirm('このページと子ページを完全に削除します。元に戻せません。続行しますか？')
    if (!accepted) {
      return
    }

    setWorkspace((previousWorkspace) => {
      const targetPage = previousWorkspace.pages[pageId]
      if (!targetPage || !targetPage.isTrashed) {
        return previousWorkspace
      }

      const allDeleteIds = [pageId, ...collectDescendants(previousWorkspace.pages, pageId)]
      const deleteSet = new Set(allDeleteIds)
      const nextPages = Object.fromEntries(
        Object.entries(previousWorkspace.pages)
          .filter(([id]) => !deleteSet.has(id))
          .map(([id, page]) => [
            id,
            {
              ...page,
              childrenIds: page.childrenIds.filter((childId) => !deleteSet.has(childId)),
            },
          ]),
      )

      const nextRootPageIds = previousWorkspace.rootPageIds.filter((rootId) => !deleteSet.has(rootId))
      if (Object.keys(nextPages).length === 0 || nextRootPageIds.length === 0) {
        return createDefaultWorkspace()
      }

      let nextSelectedPageId = previousWorkspace.selectedPageId
      if (!nextPages[nextSelectedPageId]) {
        nextSelectedPageId = findFirstPageId({ pages: nextPages, rootPageIds: nextRootPageIds, selectedPageId: previousWorkspace.selectedPageId }, true)
          ?? findFirstPageId({ pages: nextPages, rootPageIds: nextRootPageIds, selectedPageId: previousWorkspace.selectedPageId }, false)
          ?? nextRootPageIds[0]
      }

      return {
        pages: nextPages,
        rootPageIds: nextRootPageIds,
        selectedPageId: nextSelectedPageId,
      }
    })

    setContextMenu(null)
  }, [])

  const onPageContentChange = useCallback((pageId: PageId, content: string) => {
    setWorkspace((previousWorkspace) => {
      const page = previousWorkspace.pages[pageId]
      if (!page || page.content === content) {
        return previousWorkspace
      }

      return {
        ...previousWorkspace,
        pages: {
          ...previousWorkspace.pages,
          [pageId]: {
            ...page,
            content,
            updatedAt: Date.now(),
          },
        },
      }
    })
  }, [])

  const importJson = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    try {
      const json = await file.text()
      const parsed = normalizeWorkspace(JSON.parse(json))
      if (parsed) {
        setWorkspace(parsed)
        setShowTrash(false)
      }
    } catch {
      window.alert('JSONの読み込みに失敗しました。')
    }

    event.target.value = ''
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const withMeta = event.ctrlKey || event.metaKey
      if (!withMeta) {
        return
      }

      const key = event.key.toLowerCase()
      if (key === 'k') {
        event.preventDefault()
        searchInputRef.current?.focus()
        return
      }

      if (event.shiftKey && key === 'n') {
        event.preventDefault()
        addPage(null)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [addPage])

  const nonTrashedRootPageIds = useMemo(
    () => workspace.rootPageIds.filter((rootId) => {
      const page = workspace.pages[rootId]
      return page && !page.isTrashed
    }),
    [workspace.pages, workspace.rootPageIds],
  )

  const pinnedPages = useMemo(
    () => Object.values(workspace.pages)
      .filter((page) => page.isPinned && !page.isTrashed)
      .sort((a, b) => b.updatedAt - a.updatedAt),
    [workspace.pages],
  )

  const trashedPages = useMemo(
    () => Object.values(workspace.pages)
      .filter((page) => page.isTrashed)
      .sort((a, b) => (b.trashedAt ?? 0) - (a.trashedAt ?? 0)),
    [workspace.pages],
  )

  const searchableTextByPageId = useMemo(
    () => Object.fromEntries(
      Object.values(workspace.pages).map((page) => [page.id, `${page.title} ${contentToText(page.content)}`.toLowerCase()]),
    ),
    [workspace.pages],
  )

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) {
      return []
    }

    return Object.values(workspace.pages)
      .filter((page) => {
        if (page.isTrashed) {
          return false
        }

        const searchable = searchableTextByPageId[page.id] ?? ''
        return searchable.includes(q)
      })
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_SEARCH_RESULTS)
  }, [searchQuery, searchableTextByPageId, workspace.pages])

  const activePage = workspace.pages[workspace.selectedPageId]
  const displayedPage = activePage && (showTrash ? activePage.isTrashed : !activePage.isTrashed) ? activePage : null

  const openContextMenu = useCallback((event: { clientX: number; clientY: number; preventDefault: () => void }, pageId: PageId) => {
    event.preventDefault()
    setContextMenu({
      pageId,
      x: event.clientX,
      y: event.clientY,
    })
  }, [])

  function renderPageTree(pageIds: PageId[], depth = 0): ReactNode {
    return pageIds.map((pageId) => {
      const page = workspace.pages[pageId]
      if (!page || page.isTrashed) {
        return null
      }

      const visibleChildren = page.childrenIds.filter((childId) => {
        const child = workspace.pages[childId]
        return child && !child.isTrashed
      })

      return (
        <li key={pageId}>
          <div
            className={`page-item${workspace.selectedPageId === pageId && !showTrash ? ' active' : ''}`}
            style={{ paddingInlineStart: `${depth * 16 + 8}px` }}
            onClick={() => {
              setShowTrash(false)
              setWorkspace((previousWorkspace) => ({ ...previousWorkspace, selectedPageId: pageId }))
            }}
            onContextMenu={(event) => {
              openContextMenu(event, pageId)
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(event: ReactKeyboardEvent<HTMLDivElement>) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                setShowTrash(false)
                setWorkspace((previousWorkspace) => ({ ...previousWorkspace, selectedPageId: pageId }))
              }
            }}
          >
            <span>{page.isPinned ? '📌 ' : ''}{page.title}</span>
            <button
              type="button"
              className="inline-add"
              onClick={(event) => {
                event.stopPropagation()
                addPage(page.id)
              }}
            >
              +
            </button>
          </div>
          {visibleChildren.length > 0 ? <ul>{renderPageTree(visibleChildren, depth + 1)}</ul> : null}
        </li>
      )
    })
  }

  if (!isLoaded) {
    return <div className="loading">読み込み中...</div>
  }

  return (
    <MantineProvider>
      <div className="app-layout">
        <aside className="sidebar">
          <div className="sidebar-header">
            <h1>Memo Polycanva</h1>
            <button type="button" onClick={() => addPage(null)}>
              ルートページ追加
            </button>
          </div>

          <div className="sidebar-actions">
            <button type="button" onClick={() => downloadJson(workspace)}>
              JSONエクスポート
            </button>
            <button type="button" onClick={() => importInputRef.current?.click()}>
              JSONインポート
            </button>
            <input
              ref={importInputRef}
              className="hidden-input"
              type="file"
              accept="application/json"
              onChange={(event) => {
                void importJson(event)
              }}
            />
          </div>

          <div className="search-box">
            <input
              ref={searchInputRef}
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="検索（タイトル＋本文）"
            />
          </div>

          <div className="view-toggle">
            <button type="button" className={!showTrash ? 'active' : ''} onClick={() => setShowTrash(false)}>
              通常表示
            </button>
            <button type="button" className={showTrash ? 'active' : ''} onClick={() => setShowTrash(true)}>
              ごみ箱 ({trashedPages.length})
            </button>
          </div>

          {searchQuery.trim() ? (
            <section className="sidebar-section">
              <h2>検索結果</h2>
              <ul className="flat-list">
                {searchResults.length === 0 ? <li className="muted">一致するページがありません</li> : null}
                {searchResults.map((page) => (
                  <li key={`search-${page.id}`}>
                    <button
                      type="button"
                      className={`list-item${workspace.selectedPageId === page.id && !showTrash ? ' active' : ''}`}
                      onClick={() => {
                        setShowTrash(false)
                        setWorkspace((previousWorkspace) => ({ ...previousWorkspace, selectedPageId: page.id }))
                      }}
                      onContextMenu={(event) => openContextMenu(event, page.id)}
                    >
                      {page.isPinned ? '📌 ' : ''}
                      {page.title}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {pinnedPages.length > 0 ? (
            <section className="sidebar-section">
              <h2>ピン留め</h2>
              <ul className="flat-list">
                {pinnedPages.map((page) => (
                  <li key={`pin-${page.id}`}>
                    <button
                      type="button"
                      className={`list-item${workspace.selectedPageId === page.id && !showTrash ? ' active' : ''}`}
                      onClick={() => {
                        setShowTrash(false)
                        setWorkspace((previousWorkspace) => ({ ...previousWorkspace, selectedPageId: page.id }))
                      }}
                      onContextMenu={(event) => openContextMenu(event, page.id)}
                    >
                      📌 {page.title}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {showTrash ? (
            <section className="sidebar-section">
              <h2>ごみ箱</h2>
              <ul className="flat-list">
                {trashedPages.length === 0 ? <li className="muted">ごみ箱は空です</li> : null}
                {trashedPages.map((page) => (
                  <li key={`trash-${page.id}`}>
                    <button
                      type="button"
                      className={`list-item${workspace.selectedPageId === page.id && showTrash ? ' active' : ''}`}
                      onClick={() => {
                        setShowTrash(true)
                        setWorkspace((previousWorkspace) => ({ ...previousWorkspace, selectedPageId: page.id }))
                      }}
                      onContextMenu={(event) => openContextMenu(event, page.id)}
                    >
                      🗑️ {page.title}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <section className="sidebar-section">
              <h2>ページ</h2>
              <ul className="page-tree">{renderPageTree(nonTrashedRootPageIds)}</ul>
            </section>
          )}
        </aside>

        <main className="editor-area">
          {displayedPage ? (
            <>
              <header className="editor-header">
                <h2>
                  {displayedPage.isPinned ? '📌 ' : ''}
                  {displayedPage.title}
                </h2>
                <p className="updated-at">最終更新: {formatDateTime(displayedPage.updatedAt)}</p>
                {displayedPage.isTrashed ? <p className="muted">このページはごみ箱にあります。右クリックメニューから復元できます。</p> : null}
              </header>
              <Editor
                key={displayedPage.id}
                content={displayedPage.content}
                onContentChange={(content) => onPageContentChange(displayedPage.id, content)}
              />
            </>
          ) : (
            <p>{showTrash ? 'ごみ箱からページを選択してください。' : 'ページを作成してください。'}</p>
          )}
        </main>

        {contextMenu ? (
          <div className="context-menu" style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}>
            {workspace.pages[contextMenu.pageId]?.isTrashed ? (
              <>
                <button type="button" onClick={() => restorePage(contextMenu.pageId)}>
                  復元
                </button>
                <button type="button" className="danger" onClick={() => permanentlyDeletePage(contextMenu.pageId)}>
                  完全削除
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => addPage(contextMenu.pageId)}>
                  子ページを作成
                </button>
                <button type="button" onClick={() => renamePage(contextMenu.pageId)}>
                  名前を変更
                </button>
                <button type="button" onClick={() => togglePin(contextMenu.pageId)}>
                  {workspace.pages[contextMenu.pageId]?.isPinned ? 'ピン留め解除' : 'ピン留め'}
                </button>
                <button type="button" onClick={() => movePageToRoot(contextMenu.pageId)}>
                  ルートへ移動
                </button>
                <button type="button" className="danger" onClick={() => movePageToTrash(contextMenu.pageId)}>
                  ごみ箱へ移動
                </button>
              </>
            )}
          </div>
        ) : null}
      </div>
    </MantineProvider>
  )
}

export default App
