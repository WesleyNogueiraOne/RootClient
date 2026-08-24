/**
 * rootapi.js — Integração Root Client <-> Site (PROCESSO MAIN).
 *
 * Guarda o token do launcher CRIPTOGRAFADO com safeStorage (nunca em texto puro,
 * nunca no config.json, nunca exposto ao renderer). O renderer fala com isto via IPC.
 *
 * Wiring (no index.js / main):
 *   const RootAPI = require('./app/assets/js/rootapi')
 *   RootAPI.register(ipcMain)   // registra os handlers IPC
 *
 * Preload (bridge segura):
 *   const { contextBridge, ipcRenderer } = require('electron')
 *   contextBridge.exposeInMainWorld('rootapi', {
 *     linkStart:   () => ipcRenderer.invoke('rc:link-start'),
 *     linkPoll:    (dc) => ipcRenderer.invoke('rc:link-poll', dc),
 *     me:          () => ipcRenderer.invoke('rc:me'),
 *     openTicket:  (data) => ipcRenderer.invoke('rc:ticket-open', data),
 *     listTickets: () => ipcRenderer.invoke('rc:tickets'),
 *     linkOffline: (username) => ipcRenderer.invoke('rc:mc-offline', username),
 *     linkPremium: (mcAccessToken) => ipcRenderer.invoke('rc:mc-premium', mcAccessToken),
 *     verifyOffline: (username) => ipcRenderer.invoke('rc:mc-verify', username),
 *     logout:      () => ipcRenderer.invoke('rc:logout'),
 *   })
 *
 * Renderer (exemplo do fluxo de vínculo):
 *   const { device_code, user_code, verification_url } = await window.rootapi.linkStart()
 *   // mostra user_code + abre verification_url; faz polling:
 *   const r = await window.rootapi.linkPoll(device_code)  // {status:'pending'|'ok'}
 */

const { app, safeStorage, shell } = require('electron')
const fs = require('fs')
const path = require('path')
const os = require('os')

const SITE = process.env.ROOT_SITE || 'https://rootrp-site.vercel.app'
const TOKEN_FILE = path.join(app.getPath('userData'), 'rc-token.bin')

// Assinatura HMAC opcional (se o site tiver LAUNCHER_APP_SECRET e você embutir o mesmo aqui).
const APP_SECRET = process.env.ROOT_APP_SECRET || ''
const crypto = require('crypto')

function sign(rawBody) {
    if (!APP_SECRET) return {}
    const ts = String(Date.now())
    const sig = crypto.createHmac('sha256', APP_SECRET).update(`${ts}.${rawBody}`).digest('hex')
    return { 'x-rc-timestamp': ts, 'x-rc-signature': sig }
}

// ---- token (safeStorage) ----
function saveToken(raw) {
    if (!safeStorage.isEncryptionAvailable()) {
        // fallback: ainda evita texto puro óbvio, mas o ideal é safeStorage disponível
        fs.writeFileSync(TOKEN_FILE, Buffer.from(raw, 'utf8'))
        return
    }
    fs.writeFileSync(TOKEN_FILE, safeStorage.encryptString(raw))
}
function loadToken() {
    try {
        const buf = fs.readFileSync(TOKEN_FILE)
        if (safeStorage.isEncryptionAvailable()) return safeStorage.decryptString(buf)
        return buf.toString('utf8')
    } catch { return null }
}
function clearToken() {
    try { fs.unlinkSync(TOKEN_FILE) } catch {}
}

// ---- fetch helper ----
async function api(pathname, { method = 'GET', body, auth = true } = {}) {
    const headers = { 'Content-Type': 'application/json' }
    if (auth) {
        const t = loadToken()
        if (t) headers['Authorization'] = `Bearer ${t}`
    }
    const raw = body ? JSON.stringify(body) : ''
    Object.assign(headers, sign(raw))
    const res = await fetch(`${SITE}${pathname}`, { method, headers, body: body ? raw : undefined })
    const json = await res.json().catch(() => ({}))
    return { ok: res.ok, status: res.status, json }
}

// ---- fluxo device-code ----
async function linkStart() {
    const { json } = await api('/api/launcher/device/start', { method: 'POST', body: {}, auth: false })
    if (json.verification_url) shell.openExternal(json.verification_url)
    return json // { device_code, user_code, verification_url, interval }
}
async function linkPoll(deviceCode) {
    const { json } = await api('/api/launcher/device/poll', { method: 'POST', body: { device_code: deviceCode }, auth: false })
    if (json.status === 'ok' && json.token) { saveToken(json.token); return { status: 'ok' } }
    return json // { status:'pending' } ou { error }
}

// ---- contas / tickets ----
async function me() { return (await api('/api/launcher/me')).json }
async function listTickets() { return (await api('/api/launcher/tickets')).json }
async function getTicket(id) { return (await api(`/api/launcher/tickets/${id}`)).json }
async function replyTicket(id, body, attachmentIds) { return (await api(`/api/launcher/tickets/${id}/reply`, { method: 'POST', body: { body, attachmentIds } })).json }
async function notifications() { return (await api('/api/launcher/notifications')).json }
async function markRead(id) { return (await api('/api/launcher/notifications', { method: 'POST', body: id ? { id } : {} })).json }

async function openTicket({ category, subject, body, mcAccount, logTail, attachmentIds }) {
    return (await api('/api/launcher/tickets', {
        method: 'POST',
        body: {
            category, subject, body, mcAccount, attachmentIds,
            clientVersion: app.getVersion(),
            os: `${os.platform()} ${os.release()}`,
            logTail,
        },
    })).json
}
// upload de imagem (base64) -> id do anexo
async function uploadImage(payload) {
    return (await api('/api/launcher/upload', { method: 'POST', body: payload })).json
}

async function linkOffline(username) {
    return (await api('/api/launcher/minecraft', { method: 'POST', body: { type: 'OFFLINE', username } })).json
}
async function linkPremium(mcAccessToken) {
    return (await api('/api/launcher/minecraft', { method: 'POST', body: { type: 'PREMIUM', mcAccessToken } })).json
}
async function verifyOffline(username) {
    return (await api('/api/launcher/minecraft/verify/start', { method: 'POST', body: { username } })).json
}
function logout() { clearToken(); return { ok: true } }

// ---- IPC ----
function register(ipcMain) {
    ipcMain.handle('rc:link-start', () => linkStart())
    ipcMain.handle('rc:link-poll', (_e, dc) => linkPoll(dc))
    ipcMain.handle('rc:me', () => me())
    ipcMain.handle('rc:tickets', () => listTickets())
    ipcMain.handle('rc:ticket-get', (_e, id) => getTicket(id))
    ipcMain.handle('rc:ticket-reply', (_e, id, body) => replyTicket(id, body))
    ipcMain.handle('rc:notifs', () => notifications())
    ipcMain.handle('rc:notifs-read', (_e, id) => markRead(id))
    ipcMain.handle('rc:ticket-open', (_e, data) => openTicket(data))
    ipcMain.handle('rc:upload', (_e, payload) => uploadImage(payload))
    ipcMain.handle('rc:mc-offline', (_e, u) => linkOffline(u))
    ipcMain.handle('rc:mc-premium', (_e, t) => linkPremium(t))
    ipcMain.handle('rc:mc-verify', (_e, u) => verifyOffline(u))
    ipcMain.handle('rc:logout', () => logout())
}

module.exports = { register, linkStart, linkPoll, me, listTickets, getTicket, replyTicket, notifications, markRead, openTicket, uploadImage, linkOffline, linkPremium, verifyOffline, logout, loadToken, clearToken }
