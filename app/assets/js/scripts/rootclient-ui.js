/**
 * rootclient-ui.js: aba TICKETS da Gazeta (renderer).
 * Cards inline expansíveis (vê sem abrir, clica pra expandir a thread + responder).
 * Fala com o main via IPC (rootapi.js). Visual nas classes .rc-ticket* (landing.css).
 */
(function () {
    const { ipcRenderer } = require('electron')

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

    function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e }
    function field(tag, ph) { const e = el(tag, 'rc-input rc-ticket-field'); if (ph) e.placeholder = ph; return e }
    function button(label, primary) { return el('button', (primary ? 'rc-btn-gold' : 'rc-btn-ghost') + ' rc-btn-sm', label) }
    function msgLine() { return el('div', 'rc-ticket-msg') }
    function setMsg(m, text, isError) { m.textContent = text; m.classList.toggle('is-error', !!isError) }
    function fileToDataUrl(f) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(f) }) }
    function listEl() { return document.getElementById('rcTicketsList') }

    const STATUS_CHIP = { ABERTO: 'teal', RESPONDIDO: 'gold', AGUARDANDO: 'arcane', FECHADO: '' }

    function attachRow() {
        const ids = []
        const row = el('div', 'rc-ticket-attach')
        const btn = button('Anexar imagem')
        const thumbs = el('div', 'rc-ticket-thumbs')
        const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/png,image/jpeg,image/webp,image/gif'; inp.style.display = 'none'
        btn.onclick = () => inp.click()
        inp.onchange = async () => {
            const f = inp.files[0]; inp.value = ''; if (!f) return
            btn.textContent = 'Enviando…'
            const dataBase64 = await fileToDataUrl(f)
            const r = await rc.upload({ filename: f.name, mime: f.type, dataBase64 }).catch(() => ({ error: 'x' }))
            btn.textContent = 'Anexar imagem'
            if (r && r.id) { ids.push(r.id); const im = el('img'); im.src = URL.createObjectURL(f); thumbs.appendChild(im) }
        }
        row.append(btn, thumbs, inp)
        return { row, ids }
    }

    async function loadTickets() {
        const list = listEl(); if (!list) return
        list.innerHTML = '<div class="rc-news-placeholder"><span class="rc-spinner"></span>Carregando tickets…</div>'
        const me = await rc.me().catch(() => null)
        list.innerHTML = ''
        if (!me || me.error) return list.appendChild(vincularCard())
        const data = await rc.tickets().catch(() => ({ categories: [], tickets: [] }))
        list.appendChild(newTicketCard(me, data))
        const tickets = data.tickets || []
        if (!tickets.length) list.appendChild(el('div', 'rc-empty', 'Nenhum ticket ainda. Se algo der errado, abra um acima.'))
        tickets.forEach(t => list.appendChild(ticketCard(t)))
    }
    window.rcLoadTickets = loadTickets

    function vincularCard() {
        const c = el('div', 'rc-ticket rc-ticket--link')
        c.appendChild(el('span', 'rc-eyebrow', 'Vincular ao site'))
        c.appendChild(el('h3', 'rc-ticket-heading', 'Conecte o launcher à sua conta Root'))
        c.appendChild(el('p', 'rc-ticket-text', 'O vínculo libera o Root RP para apoiadores e as versões da staff. Também abre tickets direto daqui, com respostas da staff e avisos importantes.'))
        const b = button('Vincular conta', true)
        b.onclick = async () => {
            const r = await rc.linkStart().catch(() => null)
            if (!r || !r.user_code) return
            c.innerHTML = ''
            c.appendChild(el('span', 'rc-eyebrow', 'Quase lá'))
            c.appendChild(el('p', 'rc-ticket-text', 'Abrimos o site no navegador. Faça login e digite este código:'))
            c.appendChild(el('div', 'rc-ticket-code', r.user_code))
            const wait = el('div', 'rc-ticket-msg'); wait.innerHTML = '<span class="rc-spinner"></span> Aguardando confirmação…'
            c.appendChild(wait)
            const timer = setInterval(async () => {
                const p2 = await rc.linkPoll(r.device_code).catch(() => ({}))
                if (p2.status === 'ok' || p2.error) {
                    clearInterval(timer)
                    if (p2.status === 'ok' && typeof refreshSiteLink === 'function') refreshSiteLink()
                    loadTickets()
                }
            }, (r.interval || 3) * 1000)
        }
        c.appendChild(b)
        return c
    }

    function newTicketCard(me, data) {
        const c = el('div', 'rc-ticket rc-ticket--new')
        const head = el('button', 'rc-ticket-head')
        head.innerHTML = '<span class="rc-ticket-plus">＋</span><span><b>Abrir novo ticket</b><small>Bug, denúncia, dúvida ou pedido para a staff</small></span>'
        const bodyWrap = el('div', 'rc-ticket-body'); bodyWrap.hidden = true
        head.onclick = () => { bodyWrap.hidden = !bodyWrap.hidden; c.classList.toggle('is-open', !bodyWrap.hidden) }
        c.append(head, bodyWrap)

        const cats = data.categories || []
        const sel = field('select')
        cats.forEach(cat => { const o = el('option', null, cat.name); o.value = cat.slug; sel.appendChild(o) })
        const subj = field('input', 'Assunto')
        const bodyEl = field('textarea', 'Descreva o que aconteceu. Versão do client, sistema e log vão junto automaticamente.')
        const att = attachRow()
        const msg = msgLine()
        const send = button('Enviar ticket', true)
        send.onclick = async () => {
            setMsg(msg, 'Enviando…')
            const logTail = (typeof window.RootClientLogTail === 'function' && window.RootClientLogTail()) || ''
            const mcName = (me.minecraft && me.minecraft[0] && me.minecraft[0].username) || ''
            const r = await rc.openTicket({ category: sel.value, subject: subj.value, body: bodyEl.value, mcAccount: mcName, logTail, attachmentIds: att.ids }).catch(() => ({ error: 'Falha ao enviar.' }))
            if (r.error) setMsg(msg, r.error, true)
            else { window.rcToast && window.rcToast('Ticket enviado', subj.value || 'A staff vai responder por aqui.', '✉'); loadTickets() }
        }
        const actions = el('div', 'rc-ticket-actions'); actions.append(att.row, send)
        bodyWrap.append(sel, subj, bodyEl, actions, msg)
        return c
    }

    function ticketCard(t) {
        const c = el('div', 'rc-ticket')
        const head = el('button', 'rc-ticket-head')
        const chip = STATUS_CHIP[t.status] != null ? STATUS_CHIP[t.status] : ''
        const code = el('span', 'rc-ticket-code-sm', '#' + t.code)
        const title = el('b', null, t.subject || 'Sem assunto')
        const st = el('span', 'rc-chip' + (chip ? ' rc-chip--' + chip : ''), t.status || '')
        const left = el('span', 'rc-ticket-title'); left.append(code, title)
        head.append(left, st)
        const thread = el('div', 'rc-ticket-body'); thread.hidden = true
        head.onclick = () => {
            thread.hidden = !thread.hidden
            c.classList.toggle('is-open', !thread.hidden)
            if (!thread.hidden) expand(thread, t.id)
        }
        c.append(head, thread)
        return c
    }

    async function expand(thread, id) {
        thread.innerHTML = '<div class="rc-ticket-msg"><span class="rc-spinner"></span> Carregando…</div>'
        const t = await rc.getTicket(id).catch(() => null)
        if (!t || t.error) { thread.innerHTML = '<div class="rc-ticket-msg is-error">Não deu pra abrir este ticket.</div>'; return }
        thread.innerHTML = ''
        updateBadge()
        ;(t.messages || []).forEach(m => {
            const b = el('div', 'rc-ticket-bubble' + (m.staff ? ' is-staff' : ''))
            b.appendChild(el('div', 'rc-ticket-author', (m.author || '—') + (m.staff ? ' · staff' : '')))
            b.appendChild(el('div', 'rc-ticket-text', m.body))
            ;(m.attachments || []).forEach(a => { const im = el('img', 'rc-ticket-img'); im.src = a.data; b.appendChild(im) })
            thread.appendChild(b)
        })
        if (t.status === 'FECHADO') { thread.appendChild(el('div', 'rc-ticket-msg', 'Ticket fechado.')); return }
        const box = field('textarea', 'Responder…')
        const att = attachRow()
        const msg = msgLine()
        const send = button('Responder', true)
        send.onclick = async () => {
            if (!box.value.trim() && att.ids.length === 0) return
            setMsg(msg, 'Enviando…')
            const r = await rc.reply(id, box.value, att.ids).catch(() => ({ error: 'Falha ao enviar.' }))
            if (r.error) setMsg(msg, r.error, true)
            else expand(thread, id)
        }
        const actions = el('div', 'rc-ticket-actions'); actions.append(att.row, send)
        thread.append(box, actions, msg)
    }

    async function updateBadge() {
        const badge = document.getElementById('rcTicketsBadge'); if (!badge) return
        const d = await rc.notifs().catch(() => null)
        const n = d && !d.error ? (d.count || 0) : 0
        if (n > 0) { badge.textContent = n > 9 ? '9+' : String(n); badge.style.display = 'inline-block' }
        else badge.style.display = 'none'
    }

    function setup() {
        if (!listEl()) return
        updateBadge()
        setInterval(updateBadge, 20000)
    }

    if (document.readyState !== 'loading') setup()
    else document.addEventListener('DOMContentLoaded', setup)
})()
