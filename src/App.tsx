import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
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
}

interface Workspace {
  pages: Record<PageId, MemoPage>
  rootPageIds: PageId[]
  selectedPageId: PageId
}

interface ContextMenuState {
  pageId: PageId
  x: number
  y: number
}

const DB_NAME = 'memo-polycanva'
const DB_VERSION = 1
const STORE_NAME = 'workspace'
const STORE_KEY = 'default'

const defaultContent: PartialBlock[] = [
  {
    type: 'paragraph',
    content: 'ここにメモを書いてください。',
  },
]

function createPage(parentId: PageId | null = null, title = '新しいページ'): MemoPage {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    title,
    parentId,
    childrenIds: [],
    content: JSON.stringify(defaultContent),
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
    pages[id] = {
      id,
      title: typeof page.title === 'string' && page.title.trim() ? page.title : '無題',
      parentId: typeof page.parentId === 'string' ? page.parentId : null,
      childrenIds: Array.isArray(page.childrenIds) ? page.childrenIds.filter((childId): childId is string => typeof childId === 'string') : [],
      content: typeof page.content === 'string' ? page.content : JSON.stringify(defaultContent),
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

function downloadJson(workspace: Workspace): void {
  const blob = new Blob([JSON.stringify(workspace, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `memo-workspace-${new Date().toISOString().replaceAll(':', '-')}.json`
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
  const importInputRef = useRef<HTMLInputElement>(null)

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
        }
      }

      return {
        ...previousWorkspace,
        pages: nextPages,
        rootPageIds: parentId ? previousWorkspace.rootPageIds : [...previousWorkspace.rootPageIds, nextPage.id],
        selectedPageId: nextPage.id,
      }
    })
    setContextMenu(null)
  }, [])

  const renamePage = useCallback((pageId: PageId) => {
    const current = workspace.pages[pageId]
    if (!current) {
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
        },
      },
    }))
    setContextMenu(null)
  }, [workspace.pages])

  const movePageToRoot = useCallback((pageId: PageId) => {
    setWorkspace((previousWorkspace) => {
      const targetPage = previousWorkspace.pages[pageId]
      if (!targetPage || targetPage.parentId === null) {
        return previousWorkspace
      }

      const parentPage = previousWorkspace.pages[targetPage.parentId]
      const nextPages = {
        ...previousWorkspace.pages,
        [pageId]: {
          ...targetPage,
          parentId: null,
        },
      }

      if (parentPage) {
        nextPages[parentPage.id] = {
          ...parentPage,
          childrenIds: parentPage.childrenIds.filter((childId) => childId !== pageId),
        }
      }

      return {
        ...previousWorkspace,
        pages: nextPages,
        rootPageIds: [...previousWorkspace.rootPageIds, pageId],
      }
    })
    setContextMenu(null)
  }, [])

  const deletePage = useCallback((pageId: PageId) => {
    setWorkspace((previousWorkspace) => {
      const targetPage = previousWorkspace.pages[pageId]
      if (!targetPage) {
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

      const nextSelectedPageId = deleteSet.has(previousWorkspace.selectedPageId)
        ? nextRootPageIds[0]
        : previousWorkspace.selectedPageId

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
      }
    } catch {
      window.alert('JSONの読み込みに失敗しました。')
    }

    event.target.value = ''
  }, [])

  const activePage = workspace.pages[workspace.selectedPageId]

  function renderPageTree(pageIds: PageId[], depth = 0): ReactNode {
    return pageIds.map((pageId) => {
      const page = workspace.pages[pageId]
      if (!page) {
        return null
      }

      return (
        <li key={pageId}>
          <div
            className={`page-item${workspace.selectedPageId === pageId ? ' active' : ''}`}
            style={{ paddingInlineStart: `${depth * 16 + 8}px` }}
            onClick={() => setWorkspace((previousWorkspace) => ({ ...previousWorkspace, selectedPageId: pageId }))}
            onContextMenu={(event) => {
              event.preventDefault()
              setContextMenu({
                pageId,
                x: event.clientX,
                y: event.clientY,
              })
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                setWorkspace((previousWorkspace) => ({ ...previousWorkspace, selectedPageId: pageId }))
              }
            }}
          >
            <span>{page.title}</span>
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
          {page.childrenIds.length > 0 ? <ul>{renderPageTree(page.childrenIds, depth + 1)}</ul> : null}
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
            <input ref={importInputRef} className="hidden-input" type="file" accept="application/json" onChange={(event) => {
              void importJson(event)
            }} />
          </div>
          <ul className="page-tree">{renderPageTree(workspace.rootPageIds)}</ul>
        </aside>

        <main className="editor-area">
          {activePage ? (
            <>
              <header className="editor-header">
                <h2>{activePage.title}</h2>
              </header>
              <Editor
                key={activePage.id}
                content={activePage.content}
                onContentChange={(content) => onPageContentChange(activePage.id, content)}
              />
            </>
          ) : (
            <p>ページを作成してください。</p>
          )}
        </main>

        {contextMenu ? (
          <div className="context-menu" style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}>
            <button type="button" onClick={() => addPage(contextMenu.pageId)}>
              子ページを作成
            </button>
            <button type="button" onClick={() => renamePage(contextMenu.pageId)}>
              名前を変更
            </button>
            <button type="button" onClick={() => movePageToRoot(contextMenu.pageId)}>
              ルートへ移動
            </button>
            <button type="button" className="danger" onClick={() => deletePage(contextMenu.pageId)}>
              削除
            </button>
          </div>
        ) : null}
      </div>
    </MantineProvider>
  )
}

export default App
