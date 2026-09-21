/**
 * Taharah Board - Landing Page & Auto-Release Handler
 * Features:
 * - Theme Switcher: System (default) / Light / Dark
 * - Dynamic GitHub Releases direct download fetcher
 */

(function () {
  'use strict';

  // --- Configuration ---
  var REPO_OWNER = 'Lev-Good';
  var REPO_NAME = 'Purification-board';
  var FALLBACK_DOWNLOAD_URL = 'https://github.com/' + REPO_OWNER + '/' + REPO_NAME + '/releases/latest';

  // --- Theme Management ---
  var THEME_STORAGE_KEY = 'taharah_theme';
  var themeButtons = document.querySelectorAll('[data-theme-value]');

  function getStoredTheme() {
    try {
      return localStorage.getItem(THEME_STORAGE_KEY) || 'system';
    } catch (e) {
      return 'system';
    }
  }

  function applyTheme(theme) {
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }

    themeButtons.forEach(function (btn) {
      var val = btn.getAttribute('data-theme-value');
      var isActive = (val === theme);
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  function initTheme() {
    var currentTheme = getStoredTheme();
    applyTheme(currentTheme);

    themeButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var selected = btn.getAttribute('data-theme-value');
        try {
          if (selected === 'system') {
            localStorage.removeItem(THEME_STORAGE_KEY);
          } else {
            localStorage.setItem(THEME_STORAGE_KEY, selected);
          }
        } catch (e) {}
        applyTheme(selected);
      });
    });

    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
        if (getStoredTheme() === 'system') {
          applyTheme('system');
        }
      });
    }
  }

  // --- GitHub Releases Fetcher ---
  async function fetchLatestRelease() {
    var btnDownload = document.getElementById('primary-download-btn');
    var metaContainer = document.getElementById('download-meta-info');
    var portableLink = document.getElementById('portable-download-link');
    var specVersion = document.getElementById('spec-current-version');

    if (!btnDownload) return;

    try {
      var apiUrl = 'https://api.github.com/repos/' + REPO_OWNER + '/' + REPO_NAME + '/releases';
      var response = await fetch(apiUrl, {
        headers: { 'Accept': 'application/vnd.github.v3+json' }
      });

      if (!response.ok) {
        throw new Error('GitHub API HTTP error: ' + response.status);
      }

      var releases = await response.json();
      if (!Array.isArray(releases) || releases.length === 0) {
        throw new Error('No releases found');
      }

      // Find newest release that contains .exe assets
      var targetRelease = null;
      var installerAsset = null;
      var portableAsset = null;

      for (var i = 0; i < releases.length; i++) {
        var rel = releases[i];
        if (rel.assets && rel.assets.length > 0) {
          var exes = rel.assets.filter(function (a) {
            return a.name && a.name.toLowerCase().endsWith('.exe');
          });
          if (exes.length > 0) {
            targetRelease = rel;
            installerAsset = exes.find(function (a) {
              return a.name.toLowerCase().includes('setup');
            }) || exes[0];
            portableAsset = exes.find(function (a) {
              return a !== installerAsset && a.name.toLowerCase().endsWith('.exe');
            }) || null;
            break;
          }
        }
      }

      if (!targetRelease || !installerAsset) {
        targetRelease = releases[0];
      }

      var version = targetRelease.tag_name || 'v3.1.0';
      var cleanVer = version.replace(/^v/, '');

      // Set direct installer link
      if (installerAsset && installerAsset.browser_download_url) {
        btnDownload.href = installerAsset.browser_download_url;
        btnDownload.setAttribute('download', installerAsset.name);

        var sizeMB = installerAsset.size ? (installerAsset.size / (1024 * 1024)).toFixed(0) + ' MB' : '';
        if (metaContainer) {
          metaContainer.innerHTML = '<span class="status-dot"></span><span>גרסה ' + cleanVer + (sizeMB ? ' • ' + sizeMB : '') + ' • Windows 10/11 (64-bit)</span>';
        }
      } else {
        btnDownload.href = targetRelease.html_url || FALLBACK_DOWNLOAD_URL;
        if (metaContainer) {
          metaContainer.innerHTML = '<span class="status-dot"></span><span>גרסה ' + cleanVer + ' • Windows 10/11 (64-bit)</span>';
        }
      }

      // Set portable link if available
      if (portableLink && portableAsset && portableAsset.browser_download_url) {
        portableLink.href = portableAsset.browser_download_url;
        portableLink.setAttribute('download', portableAsset.name);
        portableLink.style.display = 'inline-flex';
      }

      // Update specs version
      if (specVersion) {
        specVersion.textContent = 'גרסה ' + cleanVer;
      }

    } catch (err) {
      console.warn('Unable to retrieve dynamic release data from GitHub:', err);
      // Fallback display
      if (metaContainer) {
        metaContainer.innerHTML = '<span class="status-dot"></span><span>גרסה 3.1.0 • 108 MB • Windows 10/11 (64-bit)</span>';
      }
    }
  }

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initTheme();
      fetchLatestRelease();
    });
  } else {
    initTheme();
    fetchLatestRelease();
  }
})();
