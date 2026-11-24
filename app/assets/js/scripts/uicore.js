/**
 * Core UI functions are initialized in this file. This prevents
 * unexpected errors from breaking the core features. Specifically,
 * actions in this file should not require the usage of any internal
 * modules, excluding dependencies.
 */
// Requirements
const $                              = require('jquery')
const {ipcRenderer, shell, webFrame} = require('electron')
const remote                         = require('@electron/remote')
const isDev                          = require('./assets/js/isdev')
const { LoggerUtil }                 = require('helios-core')
const Lang                           = require('./assets/js/langloader')

const loggerUICore             = LoggerUtil.getLogger('UICore')
const loggerAutoUpdater        = LoggerUtil.getLogger('AutoUpdater')

// Log deprecation and process warnings.
process.traceProcessWarnings = true
process.traceDeprecation = true

// Disable eval function.
// eslint-disable-next-line
window.eval = global.eval = function () {
    throw new Error('Sorry, this app does not support window.eval().')
}

// Display warning when devtools window is opened.
remote.getCurrentWebContents().on('devtools-opened', () => {
    console.log('%cPARE!', 'color: #c98a3f; -webkit-text-stroke: 2px #21160a; font-size: 56px; font-weight: bold')
    console.log('%cSe alguém pediu pra você colar algo aqui, é golpe. Isso pode dar acesso à sua conta.', 'font-size: 15px')
    console.log('%cSe não sabe exatamente o que está fazendo, feche esta janela.', 'font-size: 15px')
})

// Disable zoom, needed for darwin.
webFrame.setZoomLevel(0)
webFrame.setVisualZoomLevelLimits(1, 1)

// Atualização obrigatória: com versão nova publicada, o launcher não deixa jogar
// até atualizar (servidor e launcher precisam andar juntos). Se a checagem falhar
// (sem internet, GitHub fora do ar), libera: ninguém pode ficar preso sem jogar.
// em produção já começa conferindo: um clique rápido em Jogar não passa antes da checagem
const rcUpdate = { status: isDev ? 'idle' : 'checking', version: null, percent: 0, darwinUrl: null, checkingSince: Date.now() }

function rcShowUpdateGate(){
    const v = rcUpdate.version ? ` v${rcUpdate.version}` : ''
    if(rcUpdate.status === 'downloaded'){
        setOverlayContent('Atualização obrigatória',
            `O Root Client${v} já foi baixado. Reinicie o launcher pra continuar jogando.`,
            'Reiniciar e atualizar')
        setOverlayHandler(() => ipcRenderer.send('autoUpdateAction', 'installUpdateNow'))
    } else if(rcUpdate.status === 'manual'){
        setOverlayContent('Atualização obrigatória',
            `Saiu o Root Client${v}. No Mac, baixe e instale a versão nova pra continuar jogando.`,
            'Baixar atualização')
        setOverlayHandler(() => shell.openExternal(rcUpdate.darwinUrl))
    } else {
        setOverlayContent('Atualização obrigatória',
            `Baixando o Root Client${v}: ${Math.floor(rcUpdate.percent)}%.<br>Assim que terminar, é só reiniciar o launcher.`,
            'Baixando...')
        setOverlayHandler(() => {})
    }
    if(!document.getElementById('main').hasAttribute('overlay')){
        toggleOverlay(true, false)
    }
}

/**
 * Chamado pelo botão Jogar: true quando o jogo não pode abrir por causa de atualização.
 */
window.rcUpdateBlocksLaunch = function(){
    if(['downloading', 'downloaded', 'manual'].includes(rcUpdate.status)){
        rcShowUpdateGate()
        return true
    }
    // ainda conferindo (até 20 s): espera o resultado em vez de abrir a versão velha
    if(rcUpdate.status === 'checking' && Date.now() - rcUpdate.checkingSince < 20000){
        if(typeof window.rcToast === 'function'){
            window.rcToast('Conferindo atualizações', 'Um instante, já libera o Jogar.', '⟳')
        }
        return true
    }
    return false
}

// Initialize auto updates in production environments.
let updateCheckListener
if(!isDev){
    ipcRenderer.on('autoUpdateNotification', (event, arg, info) => {
        switch(arg){
            case 'checking-for-update':
                loggerAutoUpdater.info('Checking for update..')
                settingsUpdateButtonStatus(Lang.queryJS('uicore.autoUpdate.checkingForUpdateButton'), true)
                if(rcUpdate.status === 'idle' || rcUpdate.status === 'none' || rcUpdate.status === 'error'){
                    rcUpdate.status = 'checking'
                    rcUpdate.checkingSince = Date.now()
                }
                break
            case 'update-available':
                loggerAutoUpdater.info('New update available', info.version)
                rcUpdate.version = info.version
                if(process.platform === 'darwin'){
                    // os instaladores ficam no repo público (o RootClient é privado)
                    info.darwindownload = `https://github.com/WesleyNogueiraOne/RootClient-releases/releases/download/v${info.version}/root-client-setup-${info.version}-${process.arch === 'arm64' ? 'arm64' : 'x64'}.dmg`
                    rcUpdate.status = 'manual'
                    rcUpdate.darwinUrl = info.darwindownload
                    showUpdateUI(info)
                } else if(rcUpdate.status !== 'downloaded'){
                    rcUpdate.status = 'downloading'
                }
                rcShowUpdateGate()
                populateSettingsUpdateInformation(info)
                break
            case 'download-progress':
                if(rcUpdate.status === 'downloading'){
                    rcUpdate.percent = info.percent || 0
                    rcShowUpdateGate()
                }
                break
            case 'update-downloaded':
                loggerAutoUpdater.info('Update ' + info.version + ' ready to be installed.')
                rcUpdate.status = 'downloaded'
                rcUpdate.version = info.version
                settingsUpdateButtonStatus(Lang.queryJS('uicore.autoUpdate.installNowButton'), false, () => {
                    if(!isDev){
                        ipcRenderer.send('autoUpdateAction', 'installUpdateNow')
                    }
                })
                showUpdateUI(info)
                rcShowUpdateGate()
                break
            case 'update-not-available':
                loggerAutoUpdater.info('No new update found.')
                if(rcUpdate.status === 'checking') rcUpdate.status = 'none'
                settingsUpdateButtonStatus(Lang.queryJS('uicore.autoUpdate.checkForUpdatesButton'))
                break
            case 'ready':
                updateCheckListener = setInterval(() => {
                    ipcRenderer.send('autoUpdateAction', 'checkForUpdate')
                }, 1800000)
                ipcRenderer.send('autoUpdateAction', 'checkForUpdate')
                break
            case 'realerror':
                // checagem ou download falhou: libera o Jogar (o que já foi baixado continua valendo)
                if(rcUpdate.status === 'checking' || rcUpdate.status === 'downloading'){
                    rcUpdate.status = 'error'
                    if(document.getElementById('main').hasAttribute('overlay') && document.getElementById('overlayTitle').innerHTML === 'Atualização obrigatória'){
                        toggleOverlay(false)
                    }
                }
                if(info != null && info.code != null){
                    if(info.code === 'ERR_UPDATER_INVALID_RELEASE_FEED'){
                        loggerAutoUpdater.info('No suitable releases found.')
                    } else if(info.code === 'ERR_XML_MISSED_ELEMENT'){
                        loggerAutoUpdater.info('No releases found.')
                    } else {
                        loggerAutoUpdater.error('Error during update check..', info)
                        loggerAutoUpdater.debug('Error Code:', info.code)
                    }
                }
                break
            default:
                loggerAutoUpdater.info('Unknown argument', arg)
                break
        }
    })
}

/**
 * Send a notification to the main process changing the value of
 * allowPrerelease. If we are running a prerelease version, then
 * this will always be set to true, regardless of the current value
 * of val.
 * 
 * @param {boolean} val The new allow prerelease value.
 */
function changeAllowPrerelease(val){
    ipcRenderer.send('autoUpdateAction', 'allowPrereleaseChange', val)
}

function showUpdateUI(info){
    //TODO Make this message a bit more informative `${info.version}`
    document.getElementById('image_seal_container').setAttribute('update', true)
    if(typeof window.rcToast === 'function'){
        window.rcToast('Atualização disponível', `Root Client v${info.version} está pronto.`, '⟳')
    }
    document.getElementById('image_seal_container').onclick = () => {
        /*setOverlayContent('Update Available', 'A new update for the launcher is available. Would you like to install now?', 'Install', 'Later')
        setOverlayHandler(() => {
            if(!isDev){
                ipcRenderer.send('autoUpdateAction', 'installUpdateNow')
            } else {
                console.error('Cannot install updates in development environment.')
                toggleOverlay(false)
            }
        })
        setDismissHandler(() => {
            toggleOverlay(false)
        })
        toggleOverlay(true, true)*/
        switchView(getCurrentView(), VIEWS.settings, 500, 500, () => {
            settingsNavItemListener(document.getElementById('settingsNavUpdate'), false)
        })
    }
}

/* jQuery Example
$(function(){
    loggerUICore.info('UICore Initialized');
})*/

document.addEventListener('readystatechange', function () {
    if (document.readyState === 'interactive'){
        loggerUICore.info('UICore Initializing..')

        // Bind close button.
        Array.from(document.getElementsByClassName('fCb')).map((val) => {
            val.addEventListener('click', e => {
                const window = remote.getCurrentWindow()
                window.close()
            })
        })

        // Bind restore down button.
        Array.from(document.getElementsByClassName('fRb')).map((val) => {
            val.addEventListener('click', e => {
                const window = remote.getCurrentWindow()
                if(window.isMaximized()){
                    window.unmaximize()
                } else {
                    window.maximize()
                }
                document.activeElement.blur()
            })
        })

        // Bind minimize button.
        Array.from(document.getElementsByClassName('fMb')).map((val) => {
            val.addEventListener('click', e => {
                const window = remote.getCurrentWindow()
                window.minimize()
                document.activeElement.blur()
            })
        })

        // Remove focus from social media buttons once they're clicked.
        Array.from(document.getElementsByClassName('mediaURL')).map(val => {
            val.addEventListener('click', e => {
                document.activeElement.blur()
            })
        })

    }

}, false)

/**
 * Ícone do servidor: URL https do distro, senão o logo do Root Client.
 *
 * @param {Object} rawServer Servidor cru do distribution.json.
 * @returns {string} src pra <img>.
 */
function serverIconSrc(rawServer){
    const icon = rawServer && rawServer.icon
    return typeof icon === 'string' && /^https:\/\//.test(icon) ? icon : 'assets/images/logo.png'
}

/**
 * Open web links in the user's default browser.
 */
$(document).on('click', 'a[href^="http"]', function(event) {
    event.preventDefault()
    shell.openExternal(this.href)
})

/**
 * Opens DevTools window if you hold (ctrl + shift + i).
 * This will crash the program if you are using multiple
 * DevTools, for example the chrome debugger in VS Code. 
 */
document.addEventListener('keydown', function (e) {
    if((e.key === 'I' || e.key === 'i') && e.ctrlKey && e.shiftKey){
        let window = remote.getCurrentWindow()
        window.toggleDevTools()
    }
})