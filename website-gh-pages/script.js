/**
 * Taharah Board - Landing Page & Auto-Release Handler
 * Features:
 * - Theme Switcher: System (default) / Light / Dark
 * - Dynamic GitHub Releases direct download fetcher
 */

(function () {
  'use strict';

  // --- Configuration ---
  const REPO_OWNER = 'Lev-Good';
  const REPO_NAME = 'Purification-board';
  const FALLBACK_DOWNLOAD_URL = https://github.com///releases/latest;

  // --- Theme Management ---
  const THEME_STORAGE_KEY = 'taharah_theme';
  const themeButtons = document.querySelectorAll('[data-theme-value]');

  function getStoredTheme() {
    return localStorage.getItem(THEME_STORAGE_KEY) || 'system';
  }

  function applyTheme(theme) {
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }

    themeButtons.forEach(btn => {
      const val = btn.getAttribute('data-theme-value');
      const isActive = val === theme;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  function initTheme() {
    const currentTheme = getStoredTheme();
    applyTheme(currentTheme);

    themeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const selected = btn.getAttribute('data-theme-value');
        if (selected === 'system') {
          localStorage.removeItem(THEME_STORAGE_KEY);
        } else {
          localStorage.setItem(THEME_STORAGE_KEY, selected);
        }
        applyTheme(selected);
      });
    });

    // Listen to OS system color-scheme changes when in 'system' mode
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (getStoredTheme() === 'system') {
          applyTheme('system');
        }
      });
    }
  }

  // --- GitHub Releases Fetcher ---
  async function fetchLatestRelease() {
    const btnDownload = document.getElementById('primary-download-btn');
    const metaContainer = document.getElementById('download-meta-info');
    const portableLink = document.getElementById('portable-download-link');
    const specVersion = document.getElementById('spec-current-version');

    if (!btnDownload) return;

    try {
      const response = await fetch(https://api.github.com/repos///releases, {
        headers: { Accept: 'application/vnd.github.v3+json' }
      });

      if (!response.ok) {
        throw new Error(GitHub API error: );
      }

      const releases = await response.json();
      if (!Array.isArray(releases) || releases.length === 0) {
        throw new Error('No releases found');
      }

      // Find newest release that contains .exe assets
      let targetRelease = null;
      let installerAsset = null;
      let portableAsset = null;

      for (const rel of releases) {
        if (rel.assets && rel.assets.length > 0) {
          const exes = rel.assets.filter(a => a.name.toLowerCase().endsWith('.exe'));
          if (exes.length > 0) {
            targetRelease = rel;
            installerAsset = exes.find(a => a.name.toLowerCase().includes('setup')) || exes[0];
            portableAsset = exes.find(a => a !== installerAsset && a.name.toLowerCase().endsWith('.exe')) || null;
            break;
          }
        }
      }

      if (!targetRelease || !installerAsset) {
        // Fallback to latest tag if no exe found
        targetRelease = releases[0];
      }

      const version = targetRelease.tag_name || 'v3.1.0';
      const cleanVer = version.replace(/^v/, '');

      // Set direct installer link
      if (installerAsset && installerAsset.browser_download_url) {
        btnDownload.href = installerAsset.browser_download_url;
        btnDownload.setAttribute('download', installerAsset.name);

        const sizeMB = installerAsset.size ? (installerAsset.size / (1024 * 1024)).toFixed(0) + ' MB' : '';
        if (metaContainer) {
          metaContainer.innerHTML = 
            <span class=status-dot></span>
            <span>גרסה  • Windows 10/11 (64-bit)</span>
          ;
        }
      } else {
        btnDownload.href = targetRelease.html_url || FALLBACK_DOWNLOAD_URL;
      }

      // Set portable link if available
      if (portableLink && portableAsset && portableAsset.browser_download_url) {
        portableLink.href = portableAsset.browser_download_url;
        portableLink.setAttribute('download', portableAsset.name);
        portableLink.style.display = 'inline-flex';
      }

      // Update specs version
      if (specVersion) {
        specVersion.textContent = גרסה ;
      }

    } catch (err) {
      console.warn('Unable to retrieve dynamic release data from GitHub:', err);
      // Fallback stays as default defined in HTML
    }
  }

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initTheme();
      fetchLatestRelease();
    });
  } else {
    initTheme();
    fetchLatestRelease();
  }
})();
