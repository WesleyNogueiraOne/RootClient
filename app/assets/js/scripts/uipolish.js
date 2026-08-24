/**
 * uipolish.js — micro-interações que dão "vida" ao cliente.
 * Ripple dourado no clique de elementos interativos. Sem dependências.
 */
(function () {
    'use strict'

    // Seletores que ganham ripple. Fora: botões da barra de janela (pequenos demais).
    const RIPPLE_SELECTOR = 'button:not(.frameButton), .hootNavItem, .news-tab, .settingsNavItem, .mediaURL, .settingsAuthAccountSelect'

    document.addEventListener('click', (e) => {
        const el = e.target.closest(RIPPLE_SELECTOR)
        if (!el || el.disabled) return

        const cs = getComputedStyle(el)
        if (cs.position === 'static') el.style.position = 'relative'
        if (cs.overflow === 'visible') el.style.overflow = 'hidden'

        const rect = el.getBoundingClientRect()
        const span = document.createElement('span')
        span.className = 'ui-ripple'
        span.style.left = (e.clientX - rect.left) + 'px'
        span.style.top = (e.clientY - rect.top) + 'px'
        el.appendChild(span)
        setTimeout(() => span.remove(), 560)
    }, true)
})()
