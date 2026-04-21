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

interface SyncSettings {
  gasUrl: string
  spreadsheetRef: string
  syncKey: string
  deviceId: string
}

interface CloudRecord {
  workspaceJson: string
  updatedAt: number
  deviceId: string
}

interface SyncApiResponse {
  ok: boolean
  message?: string
  data?: {
    workspaceJson?: string
    updatedAt?: number
    deviceId?: string
  } | null
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
}

const DB_NAME = 'memo-polycanva'
const DB_VERSION = 1
const STORE_NAME = 'workspace'
const STORE_KEY = 'default'
const SYNC_SETTINGS_STORAGE_KEY = 'memo-polycanva.sync-settings'
const MAX_SEARCH_RESULTS = 20
const SYNC_DEBOUNCE_MS = 1800
const MAX_SYNC_JSON_BYTES = 900000
const SYNC_CONFLICT_PROMPT_MESSAGE = '同じ更新時刻の競合を検知しました。\nOK: クラウドを採用\nキャンセル: ローカルを採用して上書き保存'
let fallbackIdCounter = 0

const defaultContent: PartialBlock[] = [
  {
    type: 'paragraph',
    content: 'ここにメモを書いてください。',
  },
]

function createDefaultSyncSettings(): SyncSettings {
  const randomSuffix = (() => {
    const values = new Uint32Array(4)
    if (globalThis.crypto?.getRandomValues) {
      globalThis.crypto.getRandomValues(values)
      return Array.from(values).map((value) => value.toString(36)).join('-')
    }
    return `${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
  })()
  const fallbackDeviceId = `device-${Date.now()}-${randomSuffix}`
  return {
    gasUrl: '',
    spreadsheetRef: '',
    syncKey: '',
    deviceId: globalThis.crypto?.randomUUID?.() ?? fallbackDeviceId,
  }
}

function normalizeSyncSettings(value: unknown): SyncSettings {
  const defaults = createDefaultSyncSettings()
  if (!value || typeof value !== 'object') {
    return defaults
  }

  const candidate = value as Partial<SyncSettings>
  return {
    gasUrl: typeof candidate.gasUrl === 'string' ? candidate.gasUrl.trim() : '',
    spreadsheetRef: typeof candidate.spreadsheetRef === 'string' ? candidate.spreadsheetRef.trim() : '',
    syncKey: typeof candidate.syncKey === 'string' ? candidate.syncKey.trim() : '',
    deviceId: typeof candidate.deviceId === 'string' && candidate.deviceId.trim() ? candidate.deviceId.trim() : defaults.deviceId,
  }
}

function extractSpreadsheetId(input: string): string {
  const value = input.trim()
  if (!value) {
    return ''
  }

  const match = value.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  if (match?.[1]) {
    return match[1]
  }

  if (/^[a-zA-Z0-9-_]{20,}$/.test(value)) {
    return value
  }

  return ''
}

function isSyncConfigured(settings: SyncSettings): boolean {
  return Boolean(
    settings.gasUrl.trim()
    && settings.syncKey.trim()
    && extractSpreadsheetId(settings.spreadsheetRef),
  )
}

function getWorkspaceUpdatedAt(workspace: Workspace): number {
  const values = Object.values(workspace.pages)
  if (values.length === 0) {
    return 0
  }
  return values.reduce((max, page) => Math.max(max, page.updatedAt), 0)
}

async function parseSyncResponse(response: Response): Promise<SyncApiResponse> {
  const raw = await response.text()
  try {
    return JSON.parse(raw) as SyncApiResponse
  } catch {
    return {
      ok: false,
      message: raw || 'サーバー応答がJSONではありません。',
    }
  }
}

function normalizeCloudRecord(value: SyncApiResponse['data']): CloudRecord | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const workspaceJson = typeof value.workspaceJson === 'string' ? value.workspaceJson : ''
  const updatedAt = typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt) ? value.updatedAt : -1
  const deviceId = typeof value.deviceId === 'string' ? value.deviceId : ''

  if (!workspaceJson || updatedAt <= 0) {
    return null
  }

  return {
    workspaceJson,
    updatedAt,
    deviceId,
  }
}

async function callSyncApiGet(settings: SyncSettings, action: 'get' | 'test'): Promise<SyncApiResponse> {
  const spreadsheetId = extractSpreadsheetId(settings.spreadsheetRef)
  const url = new URL(settings.gasUrl)
  url.searchParams.set('action', action)
  url.searchParams.set('syncKey', settings.syncKey.trim())
  url.searchParams.set('spreadsheetId', spreadsheetId)
  url.searchParams.set('deviceId', settings.deviceId.trim())

  const response = await fetch(url.toString(), {
    method: 'GET',
    cache: 'no-store',
  })
  return parseSyncResponse(response)
}

async function callSyncApiSave(
  settings: SyncSettings,
  workspaceJson: string,
  updatedAt: number,
): Promise<SyncApiResponse> {
  const spreadsheetId = extractSpreadsheetId(settings.spreadsheetRef)
  const jsonBytes = new TextEncoder().encode(workspaceJson).length
  if (jsonBytes > MAX_SYNC_JSON_BYTES) {
    return {
      ok: false,
      message: `同期データサイズが大きすぎます（${Math.round(jsonBytes / 1024)}KB）。`,
    }
  }

  const response = await fetch(settings.gasUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: JSON.stringify({
      action: 'save',
      syncKey: settings.syncKey.trim(),
      spreadsheetId,
      deviceId: settings.deviceId.trim(),
      updatedAt,
      workspaceJson,
    }),
  })

  return parseSyncResponse(response)
}

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

function chooseCloudOnConflict(): boolean {
  return window.confirm(SYNC_CONFLICT_PROMPT_MESSAGE)
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
  const [syncSettings, setSyncSettings] = useState<SyncSettings>(() => {
    try {
      const raw = localStorage.getItem(SYNC_SETTINGS_STORAGE_KEY)
      if (!raw) {
        return createDefaultSyncSettings()
      }
      return normalizeSyncSettings(JSON.parse(raw))
    } catch {
      return createDefaultSyncSettings()
    }
  })
  const [isLoaded, setIsLoaded] = useState(false)
  const [isSyncSettingsOpen, setIsSyncSettingsOpen] = useState(false)
  const [syncStatus, setSyncStatus] = useState('同期は未設定です。')
  const [syncError, setSyncError] = useState<string | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [needsRetry, setNeedsRetry] = useState(false)
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [isHelpOpen, setIsHelpOpen] = useState(false)
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false)
  const [commandQuery, setCommandQuery] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [showTrash, setShowTrash] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const commandInputRef = useRef<HTMLInputElement>(null)
  const workspaceRef = useRef(workspace)
  const startupSyncCompletedRef = useRef(false)
  const autoSyncTimerRef = useRef<number | null>(null)
  const lastSyncedWorkspaceSnapshotRef = useRef<string>('')

  useEffect(() => {
    workspaceRef.current = workspace
  }, [workspace])

  useEffect(() => {
    localStorage.setItem(SYNC_SETTINGS_STORAGE_KEY, JSON.stringify(syncSettings))
  }, [syncSettings])

  useEffect(() => {
    startupSyncCompletedRef.current = false
    lastSyncedWorkspaceSnapshotRef.current = ''
  }, [syncSettings.gasUrl, syncSettings.spreadsheetRef, syncSettings.syncKey])

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

  const loadCloudRecord = useCallback(async (): Promise<CloudRecord | null> => {
    if (!isSyncConfigured(syncSettings)) {
      return null
    }

    const response = await callSyncApiGet(syncSettings, 'get')
    if (!response.ok) {
      throw new Error(response.message || 'クラウドデータの取得に失敗しました。')
    }
    return normalizeCloudRecord(response.data)
  }, [syncSettings])

  const saveWorkspaceToCloud = useCallback(async (targetWorkspace: Workspace, label: string, skipIfUnchanged = false) => {
    if (!isSyncConfigured(syncSettings)) {
      return false
    }

    const workspaceSnapshot = JSON.stringify(targetWorkspace)
    const workspaceUpdatedAt = getWorkspaceUpdatedAt(targetWorkspace)
    if (skipIfUnchanged && workspaceSnapshot === lastSyncedWorkspaceSnapshotRef.current) {
      setSyncStatus('自動同期の差分はありません。')
      setNeedsRetry(false)
      return true
    }

    setIsSyncing(true)
    setSyncError(null)
    try {
      const response = await callSyncApiSave(syncSettings, workspaceSnapshot, workspaceUpdatedAt)
      if (!response.ok) {
        throw new Error(response.message || 'クラウド保存に失敗しました。')
      }

      const now = Date.now()
      setLastSyncAt(now)
      setNeedsRetry(false)
      lastSyncedWorkspaceSnapshotRef.current = workspaceSnapshot
      setSyncStatus(`${label}クラウドへ保存しました。`)
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'クラウド保存に失敗しました。'
      setSyncError(message)
      setNeedsRetry(true)
      setSyncStatus('同期に失敗しました。ローカルデータは保持されています。')
      return false
    } finally {
      setIsSyncing(false)
    }
  }, [syncSettings])

  const syncNow = useCallback(async () => {
    if (!isSyncConfigured(syncSettings)) {
      setSyncError('同期設定を完了してください。')
      return
    }

    setIsSyncing(true)
    setSyncError(null)
    try {
      const local = workspaceRef.current
      const cloud = await loadCloudRecord()
      if (!cloud) {
        await saveWorkspaceToCloud(local, '手動同期で')
        return
      }

      const localUpdatedAt = getWorkspaceUpdatedAt(local)
      const cloudWorkspace = normalizeWorkspace(JSON.parse(cloud.workspaceJson))
      if (!cloudWorkspace) {
        throw new Error('クラウドデータの形式が不正です。')
      }

      if (cloud.updatedAt > localUpdatedAt) {
        setWorkspace(cloudWorkspace)
        setLastSyncAt(Date.now())
        setNeedsRetry(false)
        setSyncStatus('手動同期でクラウドの新しいデータを反映しました。')
        return
      }

      if (localUpdatedAt > cloud.updatedAt) {
        await saveWorkspaceToCloud(local, '手動同期で')
        return
      }

      const localSnapshot = JSON.stringify(local)
      if (localSnapshot === cloud.workspaceJson) {
        setLastSyncAt(Date.now())
        setNeedsRetry(false)
        setSyncStatus('手動同期で差分はありませんでした。')
        return
      }

      const useCloud = chooseCloudOnConflict()
      if (useCloud) {
        setWorkspace(cloudWorkspace)
        setLastSyncAt(Date.now())
        setNeedsRetry(false)
        setSyncStatus('競合解決でクラウドデータを採用しました。')
      } else {
        await saveWorkspaceToCloud(local, '競合解決で')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '同期に失敗しました。'
      setSyncError(message)
      setNeedsRetry(true)
      setSyncStatus('同期に失敗しました。ローカルデータは保持されています。')
    } finally {
      setIsSyncing(false)
    }
  }, [loadCloudRecord, saveWorkspaceToCloud, syncSettings])

  const restoreFromCloud = useCallback(async () => {
    if (!isSyncConfigured(syncSettings)) {
      setSyncError('同期設定を完了してください。')
      return
    }

    setIsSyncing(true)
    setSyncError(null)
    try {
      const cloud = await loadCloudRecord()
      if (!cloud) {
        throw new Error('クラウドに復元可能なデータがありません。')
      }

      const parsed = normalizeWorkspace(JSON.parse(cloud.workspaceJson))
      if (!parsed) {
        throw new Error('クラウドデータの形式が不正です。')
      }

      const accepted = window.confirm('クラウドデータでローカルを上書きします。続行しますか？')
      if (!accepted) {
        setSyncStatus('クラウド復元をキャンセルしました。')
        return
      }

      setWorkspace(parsed)
      setShowTrash(false)
      setLastSyncAt(Date.now())
      setNeedsRetry(false)
      setSyncStatus('クラウドデータから復元しました。')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'クラウド復元に失敗しました。'
      setSyncError(message)
      setNeedsRetry(true)
      setSyncStatus('クラウド復元に失敗しました。')
    } finally {
      setIsSyncing(false)
    }
  }, [loadCloudRecord, syncSettings])

  const testSyncConnection = useCallback(async () => {
    if (!isSyncConfigured(syncSettings)) {
      setSyncError('同期設定を完了してください。')
      return
    }

    setIsSyncing(true)
    setSyncError(null)
    try {
      const response = await callSyncApiGet(syncSettings, 'test')
      if (!response.ok) {
        throw new Error(response.message || '接続テストに失敗しました。')
      }
      setSyncStatus('接続テスト成功: GASとスプレッドシートに接続できました。')
      setNeedsRetry(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : '接続テストに失敗しました。'
      setSyncError(message)
      setNeedsRetry(true)
      setSyncStatus('接続テストに失敗しました。')
    } finally {
      setIsSyncing(false)
    }
  }, [syncSettings])

  useEffect(() => {
    if (!isLoaded || startupSyncCompletedRef.current) {
      return
    }

    if (!isSyncConfigured(syncSettings)) {
      startupSyncCompletedRef.current = true
      return
    }

    let cancelled = false
    void Promise.resolve()
      .then(() => {
        if (cancelled) {
          return null
        }
        setIsSyncing(true)
        setSyncError(null)
        return loadCloudRecord()
      })
      .then(async (cloud) => {
        if (cancelled) {
          return
        }

        const local = workspaceRef.current
        const localUpdatedAt = getWorkspaceUpdatedAt(local)
        if (!cloud) {
          await saveWorkspaceToCloud(local, '初期同期で')
          return
        }

        const parsedCloud = normalizeWorkspace(JSON.parse(cloud.workspaceJson))
        if (!parsedCloud) {
          throw new Error('クラウドデータの形式が不正です。')
        }

        if (cloud.updatedAt > localUpdatedAt) {
          setWorkspace(parsedCloud)
          setLastSyncAt(Date.now())
          setNeedsRetry(false)
          setSyncStatus('初期同期でクラウドデータを反映しました。')
          return
        }

        if (localUpdatedAt > cloud.updatedAt) {
          await saveWorkspaceToCloud(local, '初期同期で')
          return
        }

        const localSnapshot = JSON.stringify(local)
        if (localSnapshot !== cloud.workspaceJson) {
          const useCloud = chooseCloudOnConflict()
          if (useCloud) {
            setWorkspace(parsedCloud)
            setLastSyncAt(Date.now())
            setNeedsRetry(false)
            setSyncStatus('競合解決でクラウドデータを採用しました。')
            return
          }
          await saveWorkspaceToCloud(local, '競合解決で')
          return
        }

        setLastSyncAt(Date.now())
        setNeedsRetry(false)
        setSyncStatus('初期同期が完了しました。')
      })
      .catch((error) => {
        if (cancelled) {
          return
        }
        const message = error instanceof Error ? error.message : '初期同期に失敗しました。'
        setSyncError(message)
        setNeedsRetry(true)
        setSyncStatus('初期同期に失敗しました。ローカルデータを使用しています。')
      })
      .finally(() => {
        if (!cancelled) {
          setIsSyncing(false)
          startupSyncCompletedRef.current = true
        }
      })

    return () => {
      cancelled = true
    }
  }, [isLoaded, loadCloudRecord, saveWorkspaceToCloud, syncSettings])

  useEffect(() => {
    if (!isLoaded || !startupSyncCompletedRef.current || !isSyncConfigured(syncSettings)) {
      return
    }

    if (autoSyncTimerRef.current) {
      window.clearTimeout(autoSyncTimerRef.current)
    }

    autoSyncTimerRef.current = window.setTimeout(() => {
      void saveWorkspaceToCloud(workspaceRef.current, '自動同期で', true)
    }, SYNC_DEBOUNCE_MS)

    return () => {
      if (autoSyncTimerRef.current) {
        window.clearTimeout(autoSyncTimerRef.current)
      }
    }
  }, [workspace, isLoaded, saveWorkspaceToCloud, syncSettings])

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

  useEffect(() => {
    if (!isCommandPaletteOpen) {
      return
    }

    commandInputRef.current?.focus()
    commandInputRef.current?.select()
  }, [isCommandPaletteOpen])

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

  const openHelpWindow = useCallback(() => {
    setIsHelpOpen(true)
    setContextMenu(null)
  }, [])

  const openCommandPalette = useCallback((prefix = '') => {
    setCommandQuery(prefix)
    setIsCommandPaletteOpen(true)
    setContextMenu(null)
  }, [])

  const selectedPage = workspace.pages[workspace.selectedPageId] ?? null

  const commandActions = useMemo<CommandAction[]>(() => {
    const canEditSelected = Boolean(selectedPage && !selectedPage.isTrashed)

    return [
      {
        id: 'create-root',
        label: '/new ルートページを作成',
        description: '新しいルートページを追加します',
        shortcut: 'Ctrl/Cmd + Shift + N',
        tags: ['new', 'root', 'page', 'ルート', '作成'],
        prefixes: ['/'],
      },
      {
        id: 'create-child',
        label: '@child 子ページを作成',
        description: '現在のページの子ページを追加します',
        shortcut: 'Ctrl/Cmd + N',
        tags: ['child', 'sub', '子ページ', '作成'],
        prefixes: ['@'],
        disabled: !canEditSelected,
      },
      {
        id: 'rename-page',
        label: '@rename ページ名を変更',
        description: '現在のページ名を変更します',
        shortcut: 'Ctrl/Cmd + R',
        tags: ['rename', 'title', '名前変更', 'ページ名'],
        prefixes: ['@'],
        disabled: !canEditSelected,
      },
      {
        id: 'toggle-pin',
        label: '@pin ピン留め切替',
        description: '現在のページのピン留めを切り替えます',
        shortcut: 'Ctrl/Cmd + Shift + P',
        tags: ['pin', 'favorite', 'ピン', '固定'],
        prefixes: ['@'],
        disabled: !canEditSelected,
      },
      {
        id: 'move-trash',
        label: '@trash ごみ箱へ移動',
        description: '現在のページをごみ箱に移動します',
        shortcut: 'Ctrl/Cmd + Delete',
        tags: ['trash', 'delete', 'ごみ箱', '削除'],
        prefixes: ['@'],
        disabled: !canEditSelected,
      },
      {
        id: 'focus-search',
        label: '/search 検索にフォーカス',
        description: '検索欄へフォーカスします',
        shortcut: 'Ctrl/Cmd + K',
        tags: ['search', 'find', '検索'],
        prefixes: ['/'],
      },
      {
        id: 'export-json',
        label: '/export JSONエクスポート',
        description: 'ワークスペースをJSON出力します',
        tags: ['export', 'json', 'backup', '出力'],
        prefixes: ['/'],
      },
      {
        id: 'import-json',
        label: '/import JSONインポート',
        description: 'JSONファイルを読み込みます',
        tags: ['import', 'json', '読み込み'],
        prefixes: ['/'],
      },
      {
        id: 'toggle-trash-view',
        label: '/trash ごみ箱表示切替',
        description: '通常表示とごみ箱表示を切り替えます',
        tags: ['trash', 'view', 'ごみ箱', '表示'],
        prefixes: ['/'],
      },
      {
        id: 'open-help',
        label: '/help ヘルプを開く',
        description: 'ショートカットとコマンド一覧を表示します',
        shortcut: 'Ctrl/Cmd + /',
        tags: ['help', 'shortcut', 'コマンド', 'ヘルプ'],
        prefixes: ['/'],
      },
    ]
  }, [selectedPage])

  const filteredCommands = useMemo(() => {
    const query = commandQuery.trim().toLowerCase()
    const prefix = query.startsWith('@') ? '@' : query.startsWith('/') ? '/' : null
    const normalized = query.replace(/^[@/]/, '')

    return commandActions.filter((action) => {
      if (action.disabled) {
        return false
      }

      if (prefix && action.prefixes && !action.prefixes.includes(prefix)) {
        return false
      }

      if (!normalized) {
        return true
      }

      return action.tags.some((tag) => tag.includes(normalized))
        || action.label.toLowerCase().includes(normalized)
        || action.description.toLowerCase().includes(normalized)
    })
  }, [commandActions, commandQuery])

  const executeCommand = useCallback((command: CommandAction) => {
    switch (command.id) {
      case 'create-root':
        addPage(null)
        break
      case 'create-child':
        if (selectedPage && !selectedPage.isTrashed) {
          addPage(selectedPage.id)
        }
        break
      case 'rename-page':
        if (selectedPage && !selectedPage.isTrashed) {
          renamePage(selectedPage.id)
        }
        break
      case 'toggle-pin':
        if (selectedPage && !selectedPage.isTrashed) {
          togglePin(selectedPage.id)
        }
        break
      case 'move-trash':
        if (selectedPage && !selectedPage.isTrashed) {
          movePageToTrash(selectedPage.id)
        }
        break
      case 'focus-search':
        searchInputRef.current?.focus()
        break
      case 'export-json':
        downloadJson(workspace)
        break
      case 'import-json':
        importInputRef.current?.click()
        break
      case 'toggle-trash-view':
        setShowTrash((previous) => !previous)
        break
      case 'open-help':
        openHelpWindow()
        break
      default:
        break
    }
    setIsCommandPaletteOpen(false)
    setCommandQuery('')
  }, [addPage, movePageToTrash, openHelpWindow, renamePage, selectedPage, togglePin, workspace])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setContextMenu(null)
        setIsHelpOpen(false)
        setIsCommandPaletteOpen(false)
        return
      }

      if (isCommandPaletteOpen || isHelpOpen) {
        return
      }

      if (!event.ctrlKey && !event.metaKey) {
        if ((event.key === '/' || event.key === '@') && !isEditableElement(event.target)) {
          event.preventDefault()
          openCommandPalette(event.key)
        }
        return
      }

      const withMeta = event.ctrlKey || event.metaKey
      if (!withMeta) {
        return
      }

      const key = event.key.toLowerCase()
      const targetIsEditable = isEditableElement(event.target)
      if (key === 'k') {
        event.preventDefault()
        searchInputRef.current?.focus()
        return
      }

      if (!targetIsEditable && event.shiftKey && key === 'p' && selectedPage && !selectedPage.isTrashed) {
        event.preventDefault()
        togglePin(selectedPage.id)
        return
      }

      if (!targetIsEditable && !event.shiftKey && key === 'p') {
        event.preventDefault()
        openCommandPalette()
        return
      }

      if (key === '/' || key === '?') {
        event.preventDefault()
        setIsHelpOpen((previous) => !previous)
        return
      }

      if (event.shiftKey && key === 'n') {
        event.preventDefault()
        addPage(null)
        return
      }

      if (!targetIsEditable && key === 'n' && selectedPage && !selectedPage.isTrashed) {
        event.preventDefault()
        addPage(selectedPage.id)
        return
      }

      if (!targetIsEditable && key === 'r' && selectedPage && !selectedPage.isTrashed) {
        event.preventDefault()
        renamePage(selectedPage.id)
        return
      }

      if (!targetIsEditable && (key === 'backspace' || key === 'delete') && selectedPage && !selectedPage.isTrashed) {
        event.preventDefault()
        movePageToTrash(selectedPage.id)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [addPage, isCommandPaletteOpen, isHelpOpen, movePageToTrash, openCommandPalette, renamePage, selectedPage, togglePin])

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

  const activePage = selectedPage
  const displayedPage = activePage && (showTrash ? activePage.isTrashed : !activePage.isTrashed) ? activePage : null
  const syncConfigured = isSyncConfigured(syncSettings)
  const lastSyncLabel = lastSyncAt ? formatDateTime(lastSyncAt) : '未実行'

  const openContextMenu = useCallback((event: { clientX: number; clientY: number; preventDefault: () => void }, target: ContextMenuTarget) => {
    event.preventDefault()
    setContextMenu({
      target,
      x: event.clientX,
      y: event.clientY,
    })
  }, [])

  const openPageContextMenu = useCallback((event: { clientX: number; clientY: number; preventDefault: () => void }, pageId: PageId) => {
    openContextMenu(event, { kind: 'page', pageId })
  }, [openContextMenu])

  const pageMenuTarget = contextMenu?.target.kind === 'page' ? contextMenu.target : null
  const editorMenuTarget = contextMenu?.target.kind === 'editor' ? contextMenu.target : null
  const editorMenuPageId = editorMenuTarget?.pageId ?? null
  const pageContextPage = pageMenuTarget ? workspace.pages[pageMenuTarget.pageId] : null
  const editorContextPage = editorMenuPageId ? workspace.pages[editorMenuPageId] : null

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
              openPageContextMenu(event, pageId)
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
        <aside
          className="sidebar"
          onContextMenu={(event) => {
            const target = event.target as HTMLElement
            if (target.closest('.page-item, .list-item, input, button')) {
              return
            }
            openContextMenu(event, { kind: 'sidebar' })
          }}
        >
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
            <button type="button" onClick={() => openCommandPalette('/')}>
              コマンド
            </button>
            <button type="button" onClick={openHelpWindow}>
              ヘルプ
            </button>
            <button type="button" onClick={() => setIsSyncSettingsOpen((previous) => !previous)}>
              {isSyncSettingsOpen ? '同期設定を閉じる' : '同期設定'}
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

          {isSyncSettingsOpen ? (
            <section className="sidebar-section sync-settings">
              <h2>Google同期設定</h2>
              <label>
                GAS WebアプリURL
                <input
                  type="url"
                  value={syncSettings.gasUrl}
                  onChange={(event) => {
                    setSyncSettings((prev) => ({ ...prev, gasUrl: event.target.value }))
                  }}
                  placeholder="https://script.google.com/macros/s/.../exec"
                />
              </label>
              <label>
                スプレッドシートURLまたはID
                <input
                  type="text"
                  value={syncSettings.spreadsheetRef}
                  onChange={(event) => {
                    setSyncSettings((prev) => ({ ...prev, spreadsheetRef: event.target.value }))
                  }}
                  placeholder="https://docs.google.com/spreadsheets/d/... または ID"
                />
              </label>
              <label>
                同期キー（共有キー）
                <input
                  type="text"
                  value={syncSettings.syncKey}
                  onChange={(event) => {
                    setSyncSettings((prev) => ({ ...prev, syncKey: event.target.value }))
                  }}
                  placeholder="同じ値を全端末で設定"
                />
              </label>
              <label>
                端末名（端末ID）
                <input
                  type="text"
                  value={syncSettings.deviceId}
                  onChange={(event) => {
                    setSyncSettings((prev) => ({ ...prev, deviceId: event.target.value }))
                  }}
                  placeholder="my-laptop"
                />
              </label>
              <p className="muted">
                {syncConfigured ? '同期設定は有効です。' : '未設定項目があります。既存のローカル保存のみ有効です。'}
              </p>
            </section>
          ) : null}

          <section className="sidebar-section sync-status-panel">
            <h2>同期ステータス</h2>
            <p className="muted">{isSyncing ? '同期処理中...' : syncStatus}</p>
            <p className="muted">最終同期: {lastSyncLabel}</p>
            {syncError ? <p className="muted sync-error">エラー: {syncError}</p> : null}
            <div className="sync-actions">
              <button type="button" disabled={!syncConfigured || isSyncing} onClick={() => void testSyncConnection()}>
                接続テスト
              </button>
              <button type="button" disabled={!syncConfigured || isSyncing} onClick={() => void syncNow()}>
                今すぐ同期
              </button>
              <button type="button" disabled={!syncConfigured || isSyncing} onClick={() => void restoreFromCloud()}>
                クラウドから復元
              </button>
              {needsRetry ? (
                <button type="button" disabled={!syncConfigured || isSyncing} onClick={() => void syncNow()}>
                  リトライ
                </button>
              ) : null}
            </div>
          </section>

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
                       onContextMenu={(event) => openPageContextMenu(event, page.id)}
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
                       onContextMenu={(event) => openPageContextMenu(event, page.id)}
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
                        onContextMenu={(event) => openPageContextMenu(event, page.id)}
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

        <main
          className="editor-area"
          onContextMenu={(event) => {
            const target = event.target as HTMLElement
            if (target.closest('.context-menu, .modal-panel')) {
              return
            }
            openContextMenu(event, { kind: 'editor', pageId: displayedPage?.id ?? null })
          }}
        >
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
            {pageMenuTarget && pageContextPage ? (
              pageContextPage.isTrashed ? (
                <>
                  <button type="button" onClick={() => restorePage(pageMenuTarget.pageId)}>
                    復元
                  </button>
                  <button type="button" className="danger" onClick={() => permanentlyDeletePage(pageMenuTarget.pageId)}>
                    完全削除
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => addPage(pageMenuTarget.pageId)}>
                    子ページを作成
                  </button>
                  <button type="button" onClick={() => renamePage(pageMenuTarget.pageId)}>
                    名前を変更
                  </button>
                  <button type="button" onClick={() => togglePin(pageMenuTarget.pageId)}>
                    {pageContextPage.isPinned ? 'ピン留め解除' : 'ピン留め'}
                  </button>
                  <button type="button" onClick={() => movePageToRoot(pageMenuTarget.pageId)}>
                    ルートへ移動
                  </button>
                  <button type="button" className="danger" onClick={() => movePageToTrash(pageMenuTarget.pageId)}>
                    ごみ箱へ移動
                  </button>
                </>
              )
            ) : null}

            {contextMenu.target.kind === 'sidebar' ? (
              <>
                <button type="button" onClick={() => addPage(null)}>
                  ルートページを作成
                </button>
                <button type="button" onClick={() => setShowTrash((previous) => !previous)}>
                  {showTrash ? '通常表示へ切替' : 'ごみ箱を表示'}
                </button>
                <button type="button" onClick={() => openCommandPalette('/')}>
                  コマンドを開く
                </button>
                <button type="button" onClick={openHelpWindow}>
                  ヘルプを開く
                </button>
              </>
            ) : null}

            {editorMenuTarget ? (
              editorMenuPageId ? (
                editorContextPage?.isTrashed ? (
                  <>
                    <button type="button" onClick={() => restorePage(editorMenuPageId)}>
                      復元
                    </button>
                    <button type="button" className="danger" onClick={() => permanentlyDeletePage(editorMenuPageId)}>
                      完全削除
                    </button>
                  </>
                ) : editorContextPage ? (
                  <>
                    <button type="button" onClick={() => addPage(editorMenuPageId)}>
                      子ページを作成
                    </button>
                    <button type="button" onClick={() => renamePage(editorMenuPageId)}>
                      名前を変更
                    </button>
                    <button type="button" onClick={() => togglePin(editorMenuPageId)}>
                      {editorContextPage?.isPinned ? 'ピン留め解除' : 'ピン留め'}
                    </button>
                    {editorContextPage?.parentId ? (
                      <button type="button" onClick={() => movePageToRoot(editorContextPage.id)}>
                        ルートへ移動
                      </button>
                    ) : null}
                    <button type="button" className="danger" onClick={() => movePageToTrash(editorMenuPageId)}>
                      ごみ箱へ移動
                    </button>
                  </>
                ) : null
              ) : (
                <button type="button" onClick={() => addPage(null)}>
                  ルートページを作成
                </button>
              )
            ) : null}
          </div>
        ) : null}

        {isCommandPaletteOpen ? (
          <div
            className="modal-backdrop"
            role="presentation"
            onClick={() => {
              setIsCommandPaletteOpen(false)
            }}
          >
            <div
              className="modal-panel command-palette"
              role="dialog"
              aria-modal="true"
              aria-labelledby="command-palette-title"
              onClick={(event) => event.stopPropagation()}
            >
              <h3 id="command-palette-title">コマンド</h3>
              <input
                ref={commandInputRef}
                type="text"
                value={commandQuery}
                placeholder="コマンドを入力（/ か @ で絞り込み）"
                onChange={(event) => setCommandQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && filteredCommands[0]) {
                    event.preventDefault()
                    executeCommand(filteredCommands[0])
                  }
                }}
              />
              <ul className="command-list">
                {filteredCommands.length === 0 ? <li className="muted">一致するコマンドがありません</li> : null}
                {filteredCommands.map((command) => (
                  <li key={command.id}>
                    <button type="button" onClick={() => executeCommand(command)}>
                      <span>{command.label}</span>
                      {command.shortcut ? <kbd>{command.shortcut}</kbd> : null}
                    </button>
                    <p className="muted">{command.description}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}

        {isHelpOpen ? (
          <div
            className="modal-backdrop"
            role="presentation"
            onClick={() => {
              setIsHelpOpen(false)
            }}
          >
            <div
              className="modal-panel help-window"
              role="dialog"
              aria-modal="true"
              aria-labelledby="help-dialog-title"
              onClick={(event) => event.stopPropagation()}
            >
              <button type="button" autoFocus onClick={() => setIsHelpOpen(false)}>
                閉じる
              </button>
              <h3 id="help-dialog-title">ショートカット / コマンドヘルプ</h3>
              <ul>
                <li><kbd>Ctrl/Cmd + K</kbd> 検索欄へフォーカス</li>
                <li><kbd>Ctrl/Cmd + Shift + N</kbd> ルートページ作成</li>
                <li><kbd>Ctrl/Cmd + N</kbd> 子ページ作成</li>
                <li><kbd>Ctrl/Cmd + R</kbd> 現在ページの名前変更</li>
                <li><kbd>Ctrl/Cmd + Shift + P</kbd> ピン留め切替</li>
                <li><kbd>Ctrl/Cmd + Delete</kbd> 現在ページをごみ箱へ移動</li>
                <li><kbd>Ctrl/Cmd + P</kbd> コマンドパレットを開く</li>
                <li><kbd>Ctrl/Cmd + /</kbd> ヘルプを開く</li>
                <li><kbd>/</kbd> または <kbd>@</kbd> コマンドパレットを接頭辞付きで開く</li>
              </ul>
              <p className="muted">例: <code>/new</code>, <code>/help</code>, <code>@rename</code>, <code>@trash</code></p>
            </div>
          </div>
        ) : null}
      </div>
    </MantineProvider>
  )
}

export default App
