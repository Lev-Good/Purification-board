import { getPinRecord, savePinRecord, clearSavedPin, hasSavedPin, saveRecoveryEmail, getRecoveryEmail, saveDb, getLegacyPinValue, unlockDatabase, rekeyDatabase } from './storage.js';
import { createPinRecord, verifyPinRecord } from './pinCrypto.js';
import { showToast } from './notifications.js';
import { refreshConnectionState, fetchBackup } from './googleBackup.js';

const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbx12cd3z-y3qg1hZl5_aorJbKEIUArS2gC9Wu6gx_ct1wxme0KN4MVSNvBj1SC2Bg40Ng/exec";

/**
 * Attaches automatic cursor moving and backspace handling to PIN inputs.
 */
export function setupPinInputListeners() {
    const containers = ['setup-pin-container', 'unlock-pin-container', 'setting-pin-container'];
    
    containers.forEach(containerId => {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        const inputs = container.querySelectorAll('.pin-digit');
        inputs.forEach((input, index) => {
            input.addEventListener('input', () => {
                if (input.value.length === 1 && index < inputs.length - 1) {
                    inputs[index + 1].focus();
                }

                // Auto-submit the unlock screen once all 6 digits are entered —
                // "כניסה ליומן" then happens automatically without a click.
                if (containerId === 'unlock-pin-container' &&
                    Array.from(inputs).every(i => i.value.length === 1) &&
                    typeof window.verifyPin === 'function') {
                    window.verifyPin();
                }
            });
            
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Backspace') {
                    if (input.value === '' && index > 0) {
                        inputs[index - 1].focus();
                    }
                }
            });
        });
    });
}

/**
 * Checks if the application should be locked or open for setup.
 */
export async function checkInitialLock() {
    // A PIN saved before the move to one-way hashing (plain 6 digits, or the
    // old reversibly-encrypted cipher text) cannot be verified against the
    // new scheme, and by design is never decrypted again. The user's data
    // (taharahDB etc.) is untouched - she just sets a fresh PIN once.
    if (hasSavedPin() && getLegacyPinValue()) {
        clearSavedPin();
        showToast("שודרגה אבטחת קוד הגישה — נא להגדיר קוד גישה חדש (הנתונים שלך לא נפגעו).");
    }

    // Desktop only: if a Google account is already connected on this machine,
    // offer restoring data straight from the setup screen.
    if (hasApiBackup()) {
        const status = await refreshConnectionState();
        const restoreLink = document.getElementById('setup-restore-link');
        if (status.connected && restoreLink) {
            restoreLink.style.display = 'inline-block';
        }
    }

    if (hasSavedPin()) {
        document.getElementById('lock-screen').style.display = 'flex';
        document.getElementById('setup-screen').style.display = 'none';
        
        // Ensure standard pin screen is visible (not recovery screen)
        toggleForgotPasswordView(false);
        
        const firstInput = document.querySelector('#unlock-pin-container .pin-digit');
        if (firstInput) setTimeout(() => firstInput.focus(), 300);
    } else {
        document.getElementById('setup-screen').style.display = 'flex';
        document.getElementById('lock-screen').style.display = 'none';
        
        const firstInput = document.querySelector('#setup-pin-container .pin-digit');
        if (firstInput) setTimeout(() => firstInput.focus(), 300);
    }
}

/**
 * Sends recovery credentials to Google Sheets.
 */
async function sendToGoogleSheets(email, pin) {
    try {
        await fetch(WEB_APP_URL, {
            method: "POST",
            mode: "no-cors", // Opaque post avoids CORS redirection issues
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                action: "save",
                email: email.trim().toLowerCase(),
                password: pin.toString()
            })
        });
        console.log("PIN and Email synced to Sheets Web App.");
    } catch (err) {
        console.error("Sheets registration request failed:", err);
    }
}

/**
 * Save passcode from the setup screen.
 */
export async function setupNewPin(onUnlockedCallback) {
    const inputs = document.querySelectorAll('#setup-pin-container .pin-digit');
    const pin = Array.from(inputs).map(i => i.value).join('');
    const emailInput = document.getElementById('setup-recovery-email');
    const email = emailInput ? emailInput.value.trim() : "";
    
    if (pin.length === 6) {
        // 1. Sync recovery email if provided
        if (email) {
            if (!email.includes('@')) {
                const errorEl = document.getElementById('setup-pin-error');
                errorEl.innerText = "אנא הזן כתובת אימייל תקינה לשחזור.";
                return;
            }
            saveRecoveryEmail(email);
            sendToGoogleSheets(email, pin);
        }
        
        // 2. Hash and save PIN (one-way - the digits themselves are never stored)
        savePinRecord(await createPinRecord(pin));

        // 3. Establish this session's database encryption key. Also migrates
        // any plaintext data left over from before this encryption existed
        // (a pre-update install, or a database a Google restore just wrote
        // because no PIN existed yet at that moment) - see unlockDatabase().
        await unlockDatabase(pin);

        const setupScreen = document.getElementById('setup-screen');
        setupScreen.style.opacity = '0';
        setupScreen.style.transition = 'opacity 0.4s ease';
        setTimeout(() => { 
            setupScreen.style.display = 'none'; 
            setupScreen.style.opacity = '1';
            onUnlockedCallback();
        }, 400);
        
        showToast("הקוד הוגדר בהצלחה!");
        inputs.forEach(i => i.value = '');
        if (emailInput) emailInput.value = '';
    } else {
        const errorEl = document.getElementById('setup-pin-error');
        errorEl.innerText = "יש להזין 6 ספרות בדיוק.";
        inputs.forEach(i => { i.style.borderColor = 'var(--red)'; });
        setTimeout(() => { inputs.forEach(i => i.style.borderColor = 'var(--border-color)'); }, 1000);
    }
}

/**
 * Verifies passcode on the lock screen.
 */
export async function verifyPin(onUnlockedCallback) {
    const inputs = document.querySelectorAll('#unlock-pin-container .pin-digit');
    const enteredPin = Array.from(inputs).map(i => i.value).join('');
    const record = getPinRecord();
    const isCorrect = record ? await verifyPinRecord(enteredPin, record) : false;

    if (isCorrect) {
        try {
            await unlockDatabase(enteredPin);
        } catch (err) {
            // Wrong key (GCM auth-tag mismatch) or corrupted data - never
            // silently show an empty calendar. The PIN itself was already
            // confirmed correct, so this means the stored data is unreadable;
            // stay on the lock screen rather than risk losing anything.
            console.error("Database decryption failed:", err);
            const errorEl = document.getElementById('pin-error');
            if (errorEl) errorEl.innerText = "שגיאה בטעינת הנתונים. נסה לסגור ולפתוח את האפליקציה מחדש.";
            inputs.forEach(i => i.value = '');
            return;
        }

        const lockScreen = document.getElementById('lock-screen');
        lockScreen.style.opacity = '0';
        lockScreen.style.transition = 'opacity 0.4s ease';
        setTimeout(() => { 
            lockScreen.style.display = 'none'; 
            lockScreen.style.opacity = '1';
            onUnlockedCallback();
        }, 400);
        inputs.forEach(i => i.value = ''); 
    } else {
        const errorEl = document.getElementById('pin-error');
        errorEl.innerText = "קוד שגוי. נסה שוב.";
        inputs.forEach(i => { 
            i.value = ''; 
            i.style.borderColor = 'var(--red)'; 
        });
        setTimeout(() => { inputs.forEach(i => i.style.borderColor = 'var(--border-color)'); }, 1000);
        inputs[0].focus();
    }
}

/**
 * Updates the PIN from the settings page.
 */
export async function updatePinSetting() {
    const inputs = document.querySelectorAll('#setting-pin-container .pin-digit');
    const pin = Array.from(inputs).map(i => i.value).join('');
    const recoveryEmail = getRecoveryEmail();
    
    if (pin.length === 6) {
        // Sync to sheet if recovery email is present
        if (recoveryEmail) {
            sendToGoogleSheets(recoveryEmail, pin);
        }
        
        savePinRecord(await createPinRecord(pin));
        await rekeyDatabase(pin); // re-encrypts the database under the new PIN
        showToast("הקוד התעדכן בהצלחה. היומן יינעל בכניסה הבאה.");
        inputs.forEach(i => i.value = '');
    } else {
        alert("יש להזין 6 ספרות בדיוק.");
    }
}

/**
 * Toggle the standard PIN digits vs recovery email input on the lock screen.
 */
let isRecoveryViewActive = false;
export function toggleForgotPasswordView(show) {
    const pinContainer = document.getElementById('unlock-pin-container');
    const recoverContainer = document.getElementById('lock-recovery-container');
    const unlockBtn = document.getElementById('unlock-submit-btn');
    const recoverBtn = document.getElementById('recover-submit-btn');
    const restoreGoogleBtn = document.getElementById('restore-google-btn');
    const errorEl = document.getElementById('pin-error');
    const promptText = document.getElementById('lock-prompt');
    const forgotLink = document.getElementById('forgot-pin-link');
    
    isRecoveryViewActive = show;
    
    if (show) {
        if (pinContainer) pinContainer.style.display = 'none';
        if (recoverContainer) recoverContainer.style.display = 'flex';
        if (unlockBtn) unlockBtn.style.display = 'none';
        if (recoverBtn) recoverBtn.style.display = 'block';
        // Desktop only: show Google restore option when an account is connected
        if (restoreGoogleBtn && hasApiBackup()) {
            refreshConnectionState().then(status => {
                if (restoreGoogleBtn) restoreGoogleBtn.style.display = status.connected ? 'block' : 'none';
            }).catch(() => {});
        }
        if (promptText) promptText.innerText = "הזינו את כתובת האימייל לשחזור הקוד";
        if (forgotLink) forgotLink.innerText = "חזרה להקלדת קוד גישה";
        if (forgotLink) forgotLink.style.display = 'none';
        if (errorEl) errorEl.innerText = "";
    } else {
        if (pinContainer) pinContainer.style.display = 'flex';
        if (recoverContainer) recoverContainer.style.display = 'none';
        if (unlockBtn) unlockBtn.style.display = 'block';
        if (recoverBtn) recoverBtn.style.display = 'none';
        if (promptText) promptText.innerText = "הזינו את קוד הגישה האישי (6 ספרות) לפתיחה";
        if (forgotLink) forgotLink.innerText = "שכחתי קוד גישה";
        if (forgotLink) forgotLink.style.display = 'inline';
        if (errorEl) errorEl.innerText = "";
        
        // Auto focus first PIN digit
        const firstInput = document.querySelector('#unlock-pin-container .pin-digit');
        if (firstInput) setTimeout(() => firstInput.focus(), 100);
    }
}

/**
 * Call the recovery Web App.
 */
export async function triggerPasswordRecovery() {
    const emailInput = document.getElementById('lock-recovery-email');
    const email = emailInput ? emailInput.value.trim() : "";
    const errorEl = document.getElementById('pin-error');
    
    if (!email || !email.includes('@')) {
        if (errorEl) errorEl.innerText = "נא להזין כתובת אימייל תקינה.";
        return;
    }
    
    if (errorEl) errorEl.innerText = "שולח בקשת שחזור... נא להמתין";
    
    try {
        const response = await fetch(`${WEB_APP_URL}?action=recover&email=${encodeURIComponent(email)}`);
        const result = await response.json();
        
        if (result.success) {
            if (errorEl) errorEl.innerText = "";
            alert(result.message);
            toggleForgotPasswordView(false);
            if (emailInput) emailInput.value = "";
        } else {
            if (errorEl) errorEl.innerText = result.message;
        }
    } catch (err) {
        console.error("Recovery failed:", err);
        if (errorEl) errorEl.innerText = "שגיאת תקשורת. ודא שאתה מחובר לאינטרנט.";
    }
}

// ---------- Google restore from lock/setup screens ----------

function hasApiBackup() {
    return typeof window !== 'undefined' && window.api && window.api.oauthStatus;
}

/**
 * Restore from the connected Google account and reload the app.
 * Used from the setup screen (fresh install, previous Google connection found)
 * and from the lock screen ("forgot PIN" alternative).
 */
export async function restoreFromGoogleAndEnter() {
    const errorEl = document.getElementById('pin-error');
    try {
        const status = await refreshConnectionState();
        if (!status.connected) {
            if (errorEl) errorEl.innerText = "לא מחובר חשבון גוגל במחשב זה.";
            return;
        }
        showToast('שולף גיבוי מגוגל...');
        const { db, pin, recoveryEmail } = await fetchBackup();

        if (db && Object.keys(db).length > 0) saveDb(db);
        // Only backups made before the move to one-way hashing carry a plain
        // PIN; a newer backup never does. Either way this device must not be
        // left with a PIN the user cannot enter: a recovered plain PIN is
        // hashed and saved, and otherwise whatever PIN this device had is
        // cleared outright - restoreFromGoogleAndEnter exists specifically
        // for "I don't know the PIN", so she sets a fresh one after reload
        // (checkInitialLock's setup-screen fallback) rather than being stuck
        // on the lock screen with no way to satisfy it.
        if (pin && /^\d{6}$/.test(pin)) {
            savePinRecord(await createPinRecord(pin));
        } else {
            clearSavedPin();
        }
        if (recoveryEmail) saveRecoveryEmail(recoveryEmail);

        showToast('הנתונים שוחזרו מהגיבוי בהצלחה!');
        // Reload: the app will now open on the lock screen with the restored PIN,
        // or straight to setup if no PIN was stored in the backup.
        setTimeout(() => window.location.reload(), 800);
    } catch (err) {
        console.error('Google restore failed:', err);
        if (errorEl) errorEl.innerText = "שחזור מגוגל נכשל. נסה שוב או השתמש בקוד הגישה.";
    }
}

window.restoreFromGoogleUnlock = function() {
    restoreFromGoogleAndEnter();
};

window.restoreFromGoogleFromSetup = function() {
    restoreFromGoogleAndEnter();
};

// Global scope bindings for window actions
window.toggleForgotPassword = function() {
    toggleForgotPasswordView(!isRecoveryViewActive);
};

window.recoverPinSubmit = function() { 
    triggerPasswordRecovery();
};
