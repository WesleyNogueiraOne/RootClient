// ============================================================
// HOOT CLIENT - Script principal
// ============================================================

// Slideshow de fundo
const bgImages = [
    'assets/images/backgrounds/0.jpg',
    'assets/images/backgrounds/1.jpg',
    'assets/images/backgrounds/2.jpg'
]

const bgSlideshow = document.createElement('div')
bgSlideshow.id = 'bgSlideshow'
bgImages.forEach((src, i) => {
    const slide = document.createElement('div')
    slide.className = 'bgSlide' + (i === 0 ? ' active' : '')
    slide.style.backgroundImage = `url('${src}')`
    bgSlideshow.appendChild(slide)
})

// Alternar slides
let currentSlide = 0
setInterval(() => {
    const slides = document.querySelectorAll('.bgSlide')
    slides[currentSlide].classList.remove('active')
    currentSlide = (currentSlide + 1) % slides.length
    slides[currentSlide].classList.add('active')
}, 8000)

// Runas decorativas
const bgRunes = document.createElement('div')
bgRunes.id = 'bgRunes'
const runeChars = ['ᚱ', 'ᚦ', 'ᚷ', 'ᚹ', 'ᛗ', 'ᚾ', 'ᛁ', 'ᚻ']
runeChars.forEach(r => {
    const span = document.createElement('span')
    span.className = 'rune'
    span.textContent = r
    bgRunes.appendChild(span)
})

// Névoa


document.addEventListener('DOMContentLoaded', () => {

    // Inserir slideshow + runas no fundo (fixos, atrás de tudo)
    document.body.insertBefore(bgSlideshow, document.body.firstChild)
    document.body.insertBefore(bgRunes, document.body.firstChild)

    // Coruja GIF
    const seal = document.getElementById('image_seal')
    if (seal) {
        seal.src = 'assets/images/logo.png'
        seal.style.borderRadius = '0'
        seal.style.objectFit = 'contain'
    }

    // Sincronizar nome do jogador
    const userText = document.getElementById('user_text')
    const userTextMain = document.getElementById('user_text_main')
    if (userText && userTextMain) {
        userTextMain.textContent = userText.textContent
        const obs = new MutationObserver(() => {
            userTextMain.textContent = userText.textContent
        })
        obs.observe(userText, { childList: true, subtree: true, characterData: true })
    }

    // Sincronizar Java e RAM
    const syncSys = () => {
        try {
            const CM = require('./assets/js/configmanager')
            const srv = CM.getSelectedServer()
            if (!srv) return false
            const maxRAM = CM.getMaxRAM(srv)
            const javaExe = CM.getJavaExecutable(srv)
            const ramEl = document.getElementById('sysRamInfo')
            const javaEl = document.getElementById('sysJavaInfo')
            if (ramEl && maxRAM) ramEl.textContent = maxRAM + ' alocado'
            if (javaEl && javaExe) javaEl.textContent = javaExe.includes('21') ? 'Eclipse Adoptium 21' :
                                                         javaExe.includes('17') ? 'Eclipse Adoptium 17' : 'Java'
            return true
        } catch(e) { return false }
    }
    if (!syncSys()) {
        const t = setInterval(() => { if (syncSys()) clearInterval(t) }, 500)
    }

    // Botão JOGAR
    const hootPlay = document.getElementById('hootPlayBtn')
    if (hootPlay) {
        hootPlay.addEventListener('click', () => {
            const btn = document.getElementById('launch_button')
            if (btn && !btn.disabled) btn.click()
        })
    }

    // Abrir seleção de conta
    const openAccount = () => {
        try {
            prepareAccountSelectionList()
            bindOverlayKeys(true, 'accountSelectContent', true)
            $('#accountSelectContent').fadeIn(250)
        } catch(e) { console.log(e) }
    }

    const userNav = document.getElementById('hootUserNav')
    if (userNav) userNav.addEventListener('click', openAccount)

    const userContent = document.getElementById('user_content')
    if (userContent) userContent.addEventListener('click', openAccount)
})