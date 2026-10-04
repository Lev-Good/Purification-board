// Taharah Web & Desktop Interop Services
window.taharahInterop = {
  getTheme: function() {
    return localStorage.getItem('taharah_theme') || 'light';
  },
  setTheme: function(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('taharah_theme', theme);
  },
  printPage: function() {
    window.print();
  },
  downloadJson: function(filename, jsonContent) {
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
  scrollToElement: function(elementId) {
    var el = document.getElementById(elementId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  },
  // AES-GCM Encrypted LocalStorage for Browser mode
  saveEncrypted: async function(key, plaintext, pin) {
    try {
      const enc = new TextEncoder();
      const pwUtf8 = enc.encode(pin || "taharah_default_local_key");
      const pwHash = await crypto.subtle.digest('SHA-256', pwUtf8);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const alg = { name: 'AES-GCM', iv: iv };
      const keyObj = await crypto.subtle.importKey('raw', pwHash, alg, false, ['encrypt']);
      const ptBuf = enc.encode(plaintext);
      const ctBuf = await crypto.subtle.encrypt(alg, keyObj, ptBuf);
      
      const ctArr = Array.from(new Uint8Array(ctBuf));
      const ivArr = Array.from(iv);
      const bundle = JSON.stringify({ iv: ivArr, ct: ctArr });
      localStorage.setItem('taharah_' + key, bundle);
      return true;
    } catch (e) {
      console.error("Storage encryption error:", e);
      return false;
    }
  },
  loadEncrypted: async function(key, pin) {
    try {
      const raw = localStorage.getItem('taharah_' + key);
      if (!raw) return null;
      const bundle = JSON.parse(raw);
      const enc = new TextEncoder();
      const pwUtf8 = enc.encode(pin || "taharah_default_local_key");
      const pwHash = await crypto.subtle.digest('SHA-256', pwUtf8);
      const iv = new Uint8Array(bundle.iv);
      const alg = { name: 'AES-GCM', iv: iv };
      const keyObj = await crypto.subtle.importKey('raw', pwHash, alg, false, ['decrypt']);
      const ct = new Uint8Array(bundle.ct);
      const ptBuf = await crypto.subtle.decrypt(alg, keyObj, ct);
      return new TextDecoder().decode(ptBuf);
    } catch (e) {
      console.error("Storage decryption error:", e);
      return null;
    }
  },
  getPinHash: function() {
    return localStorage.getItem('taharah_pin_hash');
  },
  setPinHash: async function(pin) {
    if (!pin) {
      localStorage.removeItem('taharah_pin_hash');
      return true;
    }
    const enc = new TextEncoder();
    const hash = await crypto.subtle.digest('SHA-256', enc.encode(pin));
    const hashHex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem('taharah_pin_hash', hashHex);
    return true;
  },
  verifyPin: async function(pin) {
    const saved = localStorage.getItem('taharah_pin_hash');
    if (!saved) return true;
    const enc = new TextEncoder();
    const hash = await crypto.subtle.digest('SHA-256', enc.encode(pin));
    const hashHex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
    return saved === hashHex;
  },
  openExternalUrl: function(url) {
    if (url) {
      window.open(url, '_blank');
    }
  }
};

// Initialize theme and global listeners on script load
(function() {
  var saved = localStorage.getItem('taharah_theme');
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
  }

  window.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      const closeBtn = document.querySelector('.modal-backdrop-overlay .close-btn-circle, .drawer-sidebar .close-btn-circle');
      if (closeBtn) closeBtn.click();
    }
  });
})();
