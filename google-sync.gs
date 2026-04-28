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
const SHARE_SHEET_NAME = 'share_records'
const SHARE_HEADER = ['shareKey', 'workspaceJson', 'publishedAt', 'publisherDeviceId']
const MAX_JSON_BYTES = 900000

function doGet(e) {
  try {
    const action = getParam_(e, 'action')
    const spreadsheet = openSpreadsheetFromParam_(e)

    if (action === 'test') {
      ensureSheet_(spreadsheet)
      ensureShareSheet_(spreadsheet)
      return jsonResponse_({
        ok: true,
        message: '接続に成功しました。',
      })
    }

    if (action === 'fetch_share') {
      const shareKey = requireParam_(e, 'shareKey')
      const sheet = ensureShareSheet_(spreadsheet)
      const row = findRowByShareKey_(sheet, shareKey)
      if (!row) {
        return jsonResponse_({
          ok: true,
          data: null,
          message: '共有データはまだありません。',
        })
      }
      return jsonResponse_({
        ok: true,
        data: {
          workspaceJson: row.workspaceJson,
          publishedAt: row.publishedAt,
          publisherDeviceId: row.publisherDeviceId,
        },
      })
    }

    if (action !== 'get') {
      throw new Error('action は get / fetch_share / test を指定してください。')
    }

    const syncKey = requireParam_(e, 'syncKey')
    const sheet = ensureSheet_(spreadsheet)
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

    if (body.action === 'publish') {
      const shareKey = requireBodyString_(body, 'shareKey')
      const workspaceJson = requireBodyString_(body, 'workspaceJson')
      const publisherDeviceId = requireBodyString_(body, 'publisherDeviceId')
      validateJsonSize_(workspaceJson)
      validateJson_(workspaceJson)

      const spreadsheet = openSpreadsheetFromBody_(body)
      const sheet = ensureShareSheet_(spreadsheet)
      const publishedAt = Date.now()
      const lock = LockService.getScriptLock()
      lock.waitLock(30000)
      try {
        const row = findRowByShareKey_(sheet, shareKey)
        if (!row) {
          sheet.appendRow([shareKey, workspaceJson, publishedAt, publisherDeviceId])
        } else {
          sheet.getRange(row.rowIndex, 2).setValue(workspaceJson)
          sheet.getRange(row.rowIndex, 3).setValue(publishedAt)
          sheet.getRange(row.rowIndex, 4).setValue(publisherDeviceId)
        }
      } finally {
        lock.releaseLock()
      }
      return jsonResponse_({ ok: true, message: '共有を発行しました。' })
    }

    if (body.action === 'delete_share') {
      const shareKey = requireBodyString_(body, 'shareKey')
      const spreadsheet = openSpreadsheetFromBody_(body)
      const sheet = ensureShareSheet_(spreadsheet)
      const lock = LockService.getScriptLock()
      lock.waitLock(30000)
      try {
        const row = findRowByShareKey_(sheet, shareKey)
        if (row) {
          sheet.deleteRow(row.rowIndex)
        }
      } finally {
        lock.releaseLock()
      }
      return jsonResponse_({ ok: true, message: '共有を取り消しました。' })
    }

    if (body.action !== 'save') {
      throw new Error('action は save / publish / delete_share を指定してください。')
    }

    const syncKey = requireBodyString_(body, 'syncKey')
    const workspaceJson = requireBodyString_(body, 'workspaceJson')
    const deviceId = requireBodyString_(body, 'deviceId')
    const updatedAt = requireBodyNumber_(body, 'updatedAt')
    validateJsonSize_(workspaceJson)
    validateJson_(workspaceJson)

    const spreadsheet = openSpreadsheetFromBody_(body)
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
    workspaceJson: String(rowValues[1] || ''),
    publishedAt: Number(rowValues[2] || 0),
    publisherDeviceId: String(rowValues[3] || ''),
  }
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
