import { getSavedPin, savePin, hasSavedPin } from './storage.js';
import { showToast } from './notifications.js';

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
            // Focus movement on typing
            input.addEventListener('input', (e) => {
                if (input.value.length === 1 && index < inputs.length - 1) {
                    inputs[index + 1].focus();
                }
            });
            
            // Backspace handling
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
export function checkInitialLock() {
    if (hasSavedPin()) {
        document.getElementById('lock-screen').style.display = 'flex';
        document.getElementById('setup-screen').style.display = 'none';
        
        // Auto focus first PIN digit
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
 * Save passcode from the setup screen.
 * @param {Function} onUnlockedCallback - Callback after successful passcode registration.
 */
export function setupNewPin(onUnlockedCallback) {
    const inputs = document.querySelectorAll('#setup-pin-container .pin-digit');
    const pin = Array.from(inputs).map(i => i.value).join('');
    
    if (pin.length === 6) {
        savePin(pin);
        
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
    } else {
        const errorEl = document.getElementById('setup-pin-error');
        errorEl.innerText = "יש להזין 6 ספרות בדיוק.";
        inputs.forEach(i => { i.style.borderColor = 'var(--red)'; });
        setTimeout(() => { inputs.forEach(i => i.style.borderColor = 'var(--border-color)'); }, 1000);
    }
}

/**
 * Verifies passcode on the lock screen.
 * @param {Function} onUnlockedCallback - Callback after successful passcode validation.
 */
export function verifyPin(onUnlockedCallback) {
    const inputs = document.querySelectorAll('#unlock-pin-container .pin-digit');
    const enteredPin = Array.from(inputs).map(i => i.value).join('');
    const savedPin = getSavedPin();
    
    if (enteredPin === savedPin) {
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
export function updatePinSetting() {
    const inputs = document.querySelectorAll('#setting-pin-container .pin-digit');
    const pin = Array.from(inputs).map(i => i.value).join('');
    
    if (pin.length === 6) {
        savePin(pin);
        showToast("הקוד התעדכן בהצלחה. היומן יינעל בכניסה הבאה.");
        inputs.forEach(i => i.value = '');
    } else {
        alert("יש להזין 6 ספרות בדיוק.");
    }
}
