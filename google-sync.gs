/**
 * Memo Polycanva Google Sync API (GAS)
 *
 * 使い方:
 * 1) 新規 Apps Script プロジェクトにこのファイルを貼り付け
 * 2) Web アプリとしてデプロイ (アクセス: 全員)
 * 3) アプリ側に WebアプリURL / スプレッドシートURL(or ID) / 同期キー を設定
 */

const SHEET_NAME = 'memo_sync'
const HEADER = ['syncKey', 'workspaceJson', 'updatedAt', 'deviceId', 'createdAt', 'rowUpdatedAt']
const SHARE_SHEET_NAME = 'memo_shares'
const SHARE_HEADER = ['shareKey', 'type', 'pageId', 'data', 'permissions', 'isOwner', 'createdAt', 'updatedAt', 'accessedAt']
const MAX_JSON_BYTES = 900000

function doGet(e) {
  try {
    const action = getParam_(e, 'action')
    const spreadsheet = openSpreadsheetFromParam_(e)

    // 従来の同期キー処理
    if (action === 'test' || action === 'get') {
      const syncKey = requireParam_(e, 'syncKey')
      const sheet = ensureSheet_(spreadsheet)

      if (action === 'test') {
        return jsonResponse_({
          ok: true,
          message: '接続に成功しました。',
        })
      }

      const row = findRowBySyncKey_(sheet, syncKey)
      if (!row) {
        return jsonResponse_({
          ok: true,
          data: null,
          message: 'データはまだありません。',
        })
      }

      return jsonResponse_({
        ok: true,
        data: {
          workspaceJson: row.workspaceJson,
          updatedAt: row.updatedAt,
          deviceId: row.deviceId,
        },
      })
    }

    // 新: 共有データ取得
    if (action === 'get_share') {
      const shareKey = requireParam_(e, 'shareKey')
      const shareSheet = ensureShareSheet_(spreadsheet)
      const row = findRowByShareKey_(shareSheet, shareKey)

      if (!row) {
        return jsonResponse_({
          ok: true,
          data: null,
          message: '共有データが見つかりません。',
        })
      }

      touchShareAccessedAt_(shareSheet, row.rowIndex)

      return jsonResponse_({
        ok: true,
        data: {
          shareKey: row.shareKey,
          type: row.type,
          pageId: row.pageId,
          data: row.data,
          permissions: row.permissions,
          updatedAt: row.updatedAt,
        },
      })
    }

    throw new Error('action は get、test、または get_share を指定してください。')
  } catch (error) {
    return jsonResponse_({
      ok: false,
      message: getErrorMessage_(error),
    })
  }
}

function doPost(e) {
  try {
    const body = parsePostBody_(e)
    const action = String(body.action || '').trim()
    const spreadsheet = openSpreadsheetFromBody_(body)

    // 従来のワークスペース同期
    if (action === 'save') {
      const syncKey = requireBodyString_(body, 'syncKey')
      const workspaceJson = requireBodyString_(body, 'workspaceJson')
      const deviceId = requireBodyString_(body, 'deviceId')
      const updatedAt = requireBodyNumber_(body, 'updatedAt')
      validateJsonSize_(workspaceJson)
      validateJson_(workspaceJson)

      const sheet = ensureSheet_(spreadsheet)
      const nowIso = new Date().toISOString()
      const lock = LockService.getScriptLock()

      lock.waitLock(30000)
      try {
        const row = findRowBySyncKey_(sheet, syncKey)
        if (!row) {
          sheet.appendRow([syncKey, workspaceJson, updatedAt, deviceId, nowIso, nowIso])
        } else {
          sheet.getRange(row.rowIndex, 2).setValue(workspaceJson)
          sheet.getRange(row.rowIndex, 3).setValue(updatedAt)
          sheet.getRange(row.rowIndex, 4).setValue(deviceId)
          sheet.getRange(row.rowIndex, 6).setValue(nowIso)
        }
      } finally {
        lock.releaseLock()
      }

      return jsonResponse_({
        ok: true,
        message: '保存しました。',
      })
    }

    // 新: 共有キー生成
    if (action === 'generate_share') {
      const type = requireBodyString_(body, 'type')
      if (type !== 'page' && type !== 'workspace') {
        throw new Error('type は page または workspace を指定してください。')
      }

      const shareKey = generateShareKey_(type)
      const pageId = type === 'page' ? requireBodyString_(body, 'pageId') : ''
      const permissions = requireBodyString_(body, 'permissions')
      if (permissions !== 'viewer' && permissions !== 'editor') {
        throw new Error('permissions は viewer または editor を指定してください。')
      }

      const shareSheet = ensureShareSheet_(spreadsheet)
      const nowIso = new Date().toISOString()

      shareSheet.appendRow([
        shareKey,
        type,
        pageId,
        '{}',
        permissions,
        'true',
        nowIso,
        nowIso,
        nowIso,
      ])

      return jsonResponse_({
        ok: true,
        data: {
          shareKey: shareKey,
        },
        message: '共有キーを生成しました。',
      })
    }

    // 新: 共有データ保存
    if (action === 'save_share') {
      const shareKey = requireBodyString_(body, 'shareKey')
      const data = requireBodyString_(body, 'data')
      validateJsonSize_(data)
      validateJson_(data)

      const shareSheet = ensureShareSheet_(spreadsheet)
      const nowIso = new Date().toISOString()
      const lock = LockService.getScriptLock()

      lock.waitLock(30000)
      try {
        const row = findRowByShareKey_(shareSheet, shareKey)
        if (!row) {
          throw new Error('共有キーが見つかりません。')
        }

        // 権限確認: 書込権限がない場合はエラー
        if (row.permissions !== 'editor') {
          throw new Error('この共有には書込権限がありません。')
        }

        shareSheet.getRange(row.rowIndex, 4).setValue(data)
        shareSheet.getRange(row.rowIndex, 8).setValue(nowIso)
        shareSheet.getRange(row.rowIndex, 9).setValue(nowIso)
      } finally {
        lock.releaseLock()
      }

      return jsonResponse_({
        ok: true,
        message: '共有データを保存しました。',
      })
    }

    // 新: 共有権限更新
    if (action === 'update_share') {
      const shareKey = requireBodyString_(body, 'shareKey')
      const permissions = requireBodyString_(body, 'permissions')
      if (permissions !== 'viewer' && permissions !== 'editor') {
        throw new Error('permissions は viewer または editor を指定してください。')
      }

      const shareSheet = ensureShareSheet_(spreadsheet)
      const lock = LockService.getScriptLock()

      lock.waitLock(30000)
      try {
        const row = findRowByShareKey_(shareSheet, shareKey)
        if (!row) {
          throw new Error('共有キーが見つかりません。')
        }

        shareSheet.getRange(row.rowIndex, 5).setValue(permissions)
      } finally {
        lock.releaseLock()
      }

      return jsonResponse_({
        ok: true,
        message: '共有権限を更新しました。',
      })
    }

    // 新: 共有削除
    if (action === 'delete_share') {
      const shareKey = requireBodyString_(body, 'shareKey')
      const shareSheet = ensureShareSheet_(spreadsheet)
      const lock = LockService.getScriptLock()

      lock.waitLock(30000)
      try {
        const row = findRowByShareKey_(shareSheet, shareKey)
        if (!row) {
          throw new Error('共有キーが見つかりません。')
        }

        shareSheet.deleteRow(row.rowIndex)
      } finally {
        lock.releaseLock()
      }

      return jsonResponse_({
        ok: true,
        message: '共有を削除しました。',
      })
    }

    // 新: アクセス時刻更新
    if (action === 'touch_share') {
      const shareKey = requireBodyString_(body, 'shareKey')
      const shareSheet = ensureShareSheet_(spreadsheet)
      const nowIso = new Date().toISOString()
      const lock = LockService.getScriptLock()

      lock.waitLock(30000)
      try {
        const row = findRowByShareKey_(shareSheet, shareKey)
        if (!row) {
          throw new Error('共有キーが見つかりません。')
        }

        touchShareAccessedAt_(shareSheet, row.rowIndex)
      } finally {
        lock.releaseLock()
      }

      return jsonResponse_({
        ok: true,
        message: 'アクセス時刻を更新しました。',
      })
    }

    throw new Error('action は save、generate_share、save_share、update_share、delete_share、または touch_share を指定してください。')
  } catch (error) {
    return jsonResponse_({
      ok: false,
      message: getErrorMessage_(error),
    })
  }
}

function ensureSheet_(spreadsheet) {
  let sheet = spreadsheet.getSheetByName(SHEET_NAME)
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME)
  }

  const headerRange = sheet.getRange(1, 1, 1, HEADER.length)
  const current = headerRange.getValues()[0]
  const needsHeader = HEADER.some(function (name, index) {
    return current[index] !== name
  })
  if (needsHeader) {
    headerRange.setValues([HEADER])
  }
  return sheet
}

function ensureShareSheet_(spreadsheet) {
  let sheet = spreadsheet.getSheetByName(SHARE_SHEET_NAME)
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHARE_SHEET_NAME)
  }

  const headerRange = sheet.getRange(1, 1, 1, SHARE_HEADER.length)
  const current = headerRange.getValues()[0]
  const needsHeader = SHARE_HEADER.some(function (name, index) {
    return current[index] !== name
  })
  if (needsHeader) {
    headerRange.setValues([SHARE_HEADER])
  }
  return sheet
}

function generateShareKey_(type) {
  const prefix = type === 'page' ? 'page-' : 'workspace-'
  const uuid = Utilities.getUuid()
  return prefix + uuid
}

function findRowBySyncKey_(sheet, syncKey) {
  const lastRow = sheet.getLastRow()
  if (lastRow < 2) {
    return null
  }

  const keyRange = sheet.getRange(2, 1, lastRow - 1, 1)
  const match = keyRange
    .createTextFinder(syncKey)
    .matchEntireCell(true)
    .findNext()

  if (!match) {
    return null
  }

  const rowIndex = match.getRow()
  const rowValues = sheet.getRange(rowIndex, 1, 1, HEADER.length).getValues()[0]
  return {
    rowIndex: rowIndex,
    workspaceJson: String(rowValues[1] || ''),
    updatedAt: Number(rowValues[2] || 0),
    deviceId: String(rowValues[3] || ''),
  }
}

function findRowByShareKey_(sheet, shareKey) {
  const lastRow = sheet.getLastRow()
  if (lastRow < 2) {
    return null
  }

  const keyRange = sheet.getRange(2, 1, lastRow - 1, 1)
  const match = keyRange
    .createTextFinder(shareKey)
    .matchEntireCell(true)
    .findNext()

  if (!match) {
    return null
  }

  const rowIndex = match.getRow()
  const rowValues = sheet.getRange(rowIndex, 1, 1, SHARE_HEADER.length).getValues()[0]
  return {
    rowIndex: rowIndex,
    shareKey: String(rowValues[0] || ''),
    type: String(rowValues[1] || ''),
    pageId: String(rowValues[2] || ''),
    data: String(rowValues[3] || '{}'),
    permissions: String(rowValues[4] || 'viewer'),
    isOwner: String(rowValues[5] || 'true') === 'true',
    createdAt: String(rowValues[6] || ''),
    updatedAt: String(rowValues[7] || ''),
    accessedAt: String(rowValues[8] || ''),
  }
}

function touchShareAccessedAt_(sheet, rowIndex) {
  const nowIso = new Date().toISOString()
  sheet.getRange(rowIndex, 9).setValue(nowIso)
}

function parsePostBody_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error('POSTボディが空です。')
  }
  return JSON.parse(e.postData.contents)
}

function validateJsonSize_(jsonText) {
  const bytes = Utilities.newBlob(jsonText).getBytes().length
  if (bytes > MAX_JSON_BYTES) {
    throw new Error('同期データサイズが大きすぎます。')
  }
}

function validateJson_(jsonText) {
  JSON.parse(jsonText)
}

function openSpreadsheetFromParam_(e) {
  const spreadsheetId = getParam_(e, 'spreadsheetId')
  const spreadsheetUrl = getParam_(e, 'spreadsheetUrl')
  return openSpreadsheet_(spreadsheetId, spreadsheetUrl)
}

function openSpreadsheetFromBody_(body) {
  return openSpreadsheet_(body.spreadsheetId, body.spreadsheetUrl)
}

function openSpreadsheet_(spreadsheetId, spreadsheetUrl) {
  const id = String(spreadsheetId || '').trim()
  const url = String(spreadsheetUrl || '').trim()
  if (id) {
    return SpreadsheetApp.openById(id)
  }
  if (url) {
    return SpreadsheetApp.openByUrl(url)
  }
  throw new Error('spreadsheetId または spreadsheetUrl を指定してください。')
}

function requireParam_(e, key) {
  const value = getParam_(e, key).trim()
  if (!value) {
    throw new Error(key + ' は必須です。')
  }
  return value
}

function getParam_(e, key) {
  return (e && e.parameter && e.parameter[key]) ? String(e.parameter[key]) : ''
}

function requireBodyString_(body, key) {
  const value = String(body[key] || '').trim()
  if (!value) {
    throw new Error(key + ' は必須です。')
  }
  return value
}

function requireBodyNumber_(body, key) {
  const value = Number(body[key])
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(key + ' は正の数値で指定してください。')
  }
  return value
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON)
}

function getErrorMessage_(error) {
  return error && error.message ? String(error.message) : '不明なエラーが発生しました。'
}
