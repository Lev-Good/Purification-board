/**
 * Show a sleek floating toast notification.
 * @param {string} msg - The message to show.
 */
export function showToast(msg) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerText = msg;
    container.appendChild(toast);
    
    // Smooth exit
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(15px)';
        toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/**
 * Open a modal dialog.
 * @param {string} id - The ID of the modal overlay.
 */
export function openModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;

    modal.style.display = 'flex';
    const content = modal.querySelector('.modal-content');
    if (content) {
        // Reset animations
        content.style.animation = 'none';
        content.offsetHeight; // force reflow
        content.style.animation = '';
    }
}

/**
 * Close a modal dialog.
 * @param {string} id - The ID of the modal overlay.
 */
export function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.style.display = 'none';
    }
}

/**
 * Show a system alert modal.
 * @param {string} msg - The alert message.
 */
export function showAlert(msg) {
    const alertMsg = document.getElementById('alert-msg');
    if (alertMsg) {
        alertMsg.innerText = msg;
        openModal('custom-alert');
    } else {
        alert(msg); // Fallback
    }
}

/**
 * Show a confirmation modal.
 * @param {string} msg - The message to show.
 * @param {Function} onConfirm - Callback when user clicks confirm.
 * @param {Function} onCancel - Callback when user cancels.
 */
let currentConfirmCallback = null;
export function showConfirm(msg, onConfirm, onCancel = null) {
    const confirmMsg = document.getElementById('confirm-msg');
    if (confirmMsg) {
        confirmMsg.innerText = msg;
        currentConfirmCallback = onConfirm;
        openModal('custom-confirm');
    } else {
        if (confirm(msg)) {
            onConfirm();
        }
    }
}

// Bind the confirm button in window scope for the HTML button trigger
window.executeConfirm = function() {
    closeModal('custom-confirm');
    if (currentConfirmCallback) {
        currentConfirmCallback();
        currentConfirmCallback = null;
    }
};

// Listen to modal overlay backdrop clicks
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', function(e) {
            if (e.target === this) {
                // Prevent closing critical dialogs on backdrop click
                const nonCancellable = ['delete-all-modal', 'custom-confirm', 'setup-screen', 'email-first-time-modal', 'lock-screen'];
                if (!nonCancellable.includes(this.id)) {
                    closeModal(this.id);
                }
            }
        });
    });
});
