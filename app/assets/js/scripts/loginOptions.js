const loginOptionsCancelContainer = document.getElementById('loginOptionCancelContainer')
const loginOptionMicrosoft = document.getElementById('loginOptionMicrosoft')
const loginOptionOffline = document.getElementById('loginOptionOffline')
const loginOptionsCancelButton = document.getElementById('loginOptionCancelButton')
const offlineLoginForm = document.getElementById('offlineLoginForm')
const offlineUsernameInput = document.getElementById('offlineUsernameInput')
const offlineLoginConfirm = document.getElementById('offlineLoginConfirm')
const offlineLoginBack = document.getElementById('offlineLoginBack')

const loginOptionActions = document.querySelector('.loginOptionActions')

let loginOptionsCancellable = false

/**
 * Return the offline form to its initial state and show the provider buttons.
 * Must run whenever the loginOptions view is left, otherwise the view comes back
 * stuck on the offline form with no way to reach the other providers.
 */
function resetOfflineLoginForm(){
    offlineLoginForm.style.display = 'none'
    loginOptionActions.style.display = 'block'
    offlineUsernameInput.value = ''
    offlineUsernameInput.style.borderColor = '#444'
    offlineUsernameInput.placeholder = Lang.queryJS('loginOptions.offline.placeholder')
    offlineLoginConfirm.disabled = false
    offlineLoginConfirm.textContent = Lang.queryJS('loginOptions.offline.confirm')
}

function offlineLoginError(msg){
    offlineUsernameInput.style.borderColor = 'red'
    offlineUsernameInput.value = ''
    offlineUsernameInput.placeholder = msg
    offlineUsernameInput.focus()
}

let loginOptionsViewOnLoginSuccess
let loginOptionsViewOnLoginCancel
let loginOptionsViewOnCancel
let loginOptionsViewCancelHandler

function loginOptionsCancelEnabled(val){
    if(val){
        $(loginOptionsCancelContainer).show()
    } else {
        $(loginOptionsCancelContainer).hide()
    }
}

loginOptionMicrosoft.onclick = (e) => {
    switchView(getCurrentView(), VIEWS.waiting, 500, 500, () => {
        ipcRenderer.send(
            MSFT_OPCODE.OPEN_LOGIN,
            loginOptionsViewOnLoginSuccess,
            loginOptionsViewOnLoginCancel
        )
    })
}

loginOptionOffline.onclick = (e) => {
    loginOptionActions.style.display = 'none'
    offlineLoginForm.style.display = 'block'
    offlineUsernameInput.focus()
}

offlineLoginBack.onclick = (e) => {
    resetOfflineLoginForm()
}

offlineLoginConfirm.onclick = async (e) => {
    const username = offlineUsernameInput.value.trim()

    // Minecraft only accepts 3-16 chars of [a-zA-Z0-9_] as a name.
    if(username.length < 3) {
        offlineLoginError(Lang.queryJS('loginOptions.offline.errorTooShort'))
        return
    }
    if(username.length > 16) {
        offlineLoginError(Lang.queryJS('loginOptions.offline.errorTooLong'))
        return
    }
    if(!/^[a-zA-Z0-9_]+$/.test(username)) {
        offlineLoginError(Lang.queryJS('loginOptions.offline.errorInvalidChars'))
        return
    }

    offlineUsernameInput.style.borderColor = '#444'
    offlineLoginConfirm.disabled = true
    offlineLoginConfirm.textContent = Lang.queryJS('loginOptions.offline.loggingIn')

    try {
        const account = AuthManager.addOfflineAccount(username)
        updateSelectedAccount(account)
        const nextView = loginOptionsViewOnLoginSuccess
        resetOfflineLoginForm()
        switchView(getCurrentView(), nextView, 500, 500)
    } catch(err) {
        console.error('Offline login error:', err)
        offlineLoginConfirm.disabled = false
        offlineLoginConfirm.textContent = Lang.queryJS('loginOptions.offline.confirm')
        offlineLoginError(Lang.queryJS('loginOptions.offline.errorGeneric'))
    }
}

// Permite pressionar Enter para confirmar
offlineUsernameInput.addEventListener('keydown', (e) => {
    if(e.key === 'Enter') {
        offlineLoginConfirm.click()
    }
})

loginOptionsCancelButton.onclick = (e) => {
    switchView(getCurrentView(), loginOptionsViewOnCancel, 500, 500, () => {
        // No cleanup needed for Microsoft or offline login.
        if(loginOptionsViewCancelHandler != null){
            loginOptionsViewCancelHandler()
            loginOptionsViewCancelHandler = null
        }
    })
}