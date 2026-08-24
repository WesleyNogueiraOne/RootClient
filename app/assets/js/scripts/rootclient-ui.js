/**
 * rootclient-ui.js — aba TICKETS no painel de notícias (renderer).
 * Cards inline expansíveis (vê sem abrir, clica pra expandir a thread + responder).
 * Fala com o main via IPC (rootapi.js).
 */
(function () {
    const { ipcRenderer } = require('electron')
    const G = '#eab94d', TEAL = '#57c7b8', BG = '#0b0f0c', BORDER = '#223029', TEXT = '#e8e6df', MUTED = '#9ba8a2'
    const CARD = `background:rgba(16,23,26,.55);border:1px solid ${BORDER};border-radius:12px;padding:12px 14px;overflow:visible;flex:none;`

    const rc = {
        me: () => ipcRenderer.invoke('rc:me'),
        tickets: () => ipcRenderer.invoke('rc:tickets'),
        getTicket: (id) => ipcRenderer.invoke('rc:ticket-get', id),
        reply: (id, body, att) => ipcRenderer.invoke('rc:ticket-reply', id, body, att),
        notifs: () => ipcRenderer.invoke('rc:notifs'),
        markRead: (id) => ipcRenderer.invoke('rc:notifs-read', id),
        linkStart: () => ipcRenderer.invoke('rc:link-start'),
        linkPoll: (dc) => ipcRenderer.invoke('rc:link-poll', dc),
        openTicket: (d) => ipcRenderer.invoke('rc:ticket-open', d),
        upload: (p) => ipcRenderer.invoke('rc:upload', p),
    }

    function el(tag, style, text) { const e = document.createElement(tag); if (style) e.setAttribute('style', style); if (text != null) e.textContent = text; return e }
    function field(tag, ph, extra) { const e = el(tag, `width:100%;box-sizing:border-box;border-radius:8px;padding:8px;font-size:12px;background:${BG};border:1px solid ${BORDER};color:${TEXT};${extra || ''}`); if (ph) e.placeholder = ph; return e }
    function button(label, primary) { return el('button', `cursor:pointer;border-radius:8px;padding:8px 14px;font-size:12px;border:1px solid ${primary ? G : BORDER};background:${primary ? G : 'transparent'};color:${primary ? '#201603' : TEXT};font-weight:${primary ? '700' : '500'};`, label) }
    function escapeHtml(s) { return String(s || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])) }
    function fileToDataUrl(f) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(f) }) }
    function listEl() { return document.getElementById('rcTicketsList') }

    function attachRow() {
        const ids = []
        const row = el('div', 'margin:6px 0;')
        const btn = button('Anexar imagem'); btn.style.fontSize = '11px'; btn.style.padding = '5px 10px'
        const thumbs = el('div', 'display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;')
        const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/png,image/jpeg,image/webp,image/gif'; inp.style.display = 'none'
        btn.onclick = () => inp.click()
        inp.onchange = async () => {
            const f = inp.files[0]; inp.value = ''; if (!f) return
            btn.textContent = 'Enviando…'
            const dataBase64 = await fileToDataUrl(f)
            const r = await rc.upload({ filename: f.name, mime: f.type, dataBase64 }).catch(() => ({ error: 'x' }))
            btn.textContent = 'Anexar imagem'
            if (r && r.id) { ids.push(r.id); const im = el('img'); im.src = URL.createObjectURL(f); im.setAttribute('style', `width:42px;height:42px;object-fit:cover;border-radius:6px;border:1px solid ${BORDER}`); thumbs.appendChild(im) }
        }
        row.appendChild(btn); row.appendChild(thumbs); row.appendChild(inp)
        return { row, ids }
    }

    async function loadTickets() {
        const list = listEl(); if (!list) return
        list.innerHTML = '<div class="hoot-news-placeholder">Carregando…</div>'
        const me = await rc.me().catch(() => null)
        list.innerHTML = ''
        if (!me || me.error) return list.appendChild(vincularCard())
        const data = await rc.tickets().catch(() => ({ categories: [], tickets: [] }))
        list.appendChild(newTicketCard(me, data))
        const tickets = data.tickets || []
        if (!tickets.length) list.appendChild(el('div', `color:${MUTED};font-size:12px;padding:8px 2px;`, 'Nenhum ticket ainda.'))
        tickets.forEach(t => list.appendChild(ticketCard(t)))
    }

    function vincularCard() {
        const c = el('div', CARD)
        c.appendChild(el('div', `font-size:13px;color:${TEXT};font-weight:600;margin-bottom:4px;`, 'Vincular ao site'))
        const p = el('div', `font-size:12px;color:${MUTED};margin-bottom:8px;`, 'Conecte o launcher pra abrir tickets e receber avisos.')
        c.appendChild(p)
        const b = button('Vincular conta', true)
        b.onclick = async () => {
            const r = await rc.linkStart().catch(() => null)
            if (!r || !r.user_code) return
            c.innerHTML = ''
            c.appendChild(el('div', `font-size:12px;color:${MUTED};`, 'Faça login no site (abrimos no navegador) e digite:'))
            c.appendChild(el('div', `text-align:center;font-size:24px;letter-spacing:5px;font-weight:700;color:${TEAL};margin:10px 0;`, r.user_code))
            c.appendChild(el('div', `font-size:11px;color:${MUTED};`, 'Aguardando…'))
            const timer = setInterval(async () => {
                const p2 = await rc.linkPoll(r.device_code).catch(() => ({}))
                if (p2.status === 'ok') { clearInterval(timer); loadTickets() }
                else if (p2.error) { clearInterval(timer); loadTickets() }
            }, (r.interval || 3) * 1000)
        }
        c.appendChild(b)
        return c
    }

    function newTicketCard(me, data) {
        const c = el('div', CARD)
        const head = el('div', `font-size:13px;color:${G};font-weight:700;cursor:pointer;`, '＋ Abrir novo ticket')
        const bodyWrap = el('div', 'display:none;margin-top:8px;')
        head.onclick = () => { bodyWrap.style.display = bodyWrap.style.display === 'none' ? 'block' : 'none' }
        c.appendChild(head); c.appendChild(bodyWrap)

        const cats = data.categories || []
        const sel = field('select', null, 'margin-bottom:6px;')
        cats.forEach(cat => { const o = el('option', null, cat.name); o.value = cat.slug; sel.appendChild(o) })
        const subj = field('input', 'Assunto', 'margin-bottom:6px;')
        const bodyEl = field('textarea', 'Descreva. Client, SO e log vão junto.', 'min-height:70px;')
        const att = attachRow()
        const msg = el('div', 'font-size:11px;margin:6px 0;')
        const send = button('Abrir ticket', true)
        send.onclick = async () => {
            msg.textContent = 'Enviando…'; msg.style.color = MUTED
            const logTail = (typeof window.RootClientLogTail === 'function' && window.RootClientLogTail()) || ''
            const mcName = (me.minecraft && me.minecraft[0] && me.minecraft[0].username) || ''
            const r = await rc.openTicket({ category: sel.value, subject: subj.value, body: bodyEl.value, mcAccount: mcName, logTail, attachmentIds: att.ids }).catch(() => ({ error: 'falha' }))
            if (r.error) { msg.textContent = r.error; msg.style.color = '#f87171' }
            else loadTickets()
        }
        bodyWrap.appendChild(sel); bodyWrap.appendChild(subj); bodyWrap.appendChild(bodyEl); bodyWrap.appendChild(att.row); bodyWrap.appendChild(send); bodyWrap.appendChild(msg)
        return c
    }

    function ticketCard(t) {
        const c = el('div', CARD)
        const head = el('div', 'cursor:pointer;')
        head.innerHTML = `<div style="font-size:13px;color:${TEXT}">#${t.code} ${escapeHtml(t.subject)}</div><div style="font-size:11px;color:${MUTED}">${t.status}</div>`
        const thread = el('div', 'display:none;margin-top:10px;')
        head.onclick = () => {
            if (thread.style.display === 'none') { thread.style.display = 'block'; expand(thread, t.id) }
            else thread.style.display = 'none'
        }
        c.appendChild(head); c.appendChild(thread)
        return c
    }

    async function expand(thread, id) {
        thread.innerHTML = `<div style="color:${MUTED};font-size:12px">Carregando…</div>`
        const t = await rc.getTicket(id).catch(() => null)
        if (!t || t.error) { thread.innerHTML = `<div style="color:#f87171;font-size:12px">Erro.</div>`; return }
        thread.innerHTML = ''
        updateBadge()
        ;(t.messages || []).forEach(m => {
            const b = el('div', `border:1px solid ${m.staff ? 'rgba(87,199,184,.3)' : BORDER};background:${m.staff ? 'rgba(87,199,184,.06)' : 'rgba(255,255,255,.02)'};border-radius:10px;padding:7px 9px;margin-bottom:6px;`)
            b.innerHTML = `<div style="font-size:10px;color:${m.staff ? TEAL : G};margin-bottom:2px">${escapeHtml(m.author || '—')}${m.staff ? ' · staff' : ''}</div><div style="font-size:12px;color:${TEXT};white-space:pre-wrap">${escapeHtml(m.body)}</div>`
            ;(m.attachments || []).forEach(a => { const im = el('img'); im.src = a.data; im.setAttribute('style', `margin-top:5px;max-width:150px;max-height:150px;border-radius:6px;border:1px solid ${BORDER};display:block`); b.appendChild(im) })
            thread.appendChild(b)
        })
        if (t.status === 'FECHADO') { thread.appendChild(el('div', `font-size:11px;color:${MUTED};`, 'Ticket fechado.')); return }
        const box = field('textarea', 'Responder…', 'min-height:56px;')
        const att = attachRow()
        const msg = el('div', 'font-size:11px;margin:5px 0;')
        const send = button('Responder', true)
        send.onclick = async () => {
            if (!box.value.trim() && att.ids.length === 0) return
            msg.textContent = 'Enviando…'; msg.style.color = MUTED
            const r = await rc.reply(id, box.value, att.ids).catch(() => ({ error: 'falha' }))
            if (r.error) { msg.textContent = r.error; msg.style.color = '#f87171' }
            else expand(thread, id)
        }
        thread.appendChild(box); thread.appendChild(att.row); thread.appendChild(send); thread.appendChild(msg)
    }

    async function updateBadge() {
        const badge = document.getElementById('rcTicketsBadge'); if (!badge) return
        const d = await rc.notifs().catch(() => null)
        const n = d && !d.error ? (d.count || 0) : 0
        if (n > 0) { badge.textContent = n > 9 ? '9+' : String(n); badge.style.display = 'inline-block' }
        else badge.style.display = 'none'
    }

    function setup() {
        const list = listEl()
        if (!list) return
        document.querySelectorAll('.news-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const target = tab.getAttribute('data-tab')
                if (target === 'tickets') { list.style.display = 'flex'; loadTickets() }
                else { list.style.display = 'none' }
            })
        })
        updateBadge()
        setInterval(updateBadge, 20000)
    }

    if (document.readyState !== 'loading') setup()
    else document.addEventListener('DOMContentLoaded', setup)
})()
