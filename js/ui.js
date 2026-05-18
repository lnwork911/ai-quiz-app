/**
 * ui.js — lightweight UI helpers: toasts + global loading state.
 * Beginners: this file is plain browser JavaScript (no bundler required).
 */

(function (global) {
  "use strict";

  /** @type {number | null} */
  let loadingCount = 0;

  /**
   * Ensures toast + loading overlay containers exist in the DOM.
   */
  function ensureHosts() {
    if (!document.getElementById("tqs-toast-host")) {
      const host = document.createElement("div");
      host.id = "tqs-toast-host";
      host.className = "toast-host";
      document.body.appendChild(host);
    }

    if (!document.getElementById("tqs-loading-overlay")) {
      const overlay = document.createElement("div");
      overlay.id = "tqs-loading-overlay";
      overlay.className = "loading-overlay";
      overlay.setAttribute("role", "status");
      overlay.setAttribute("aria-live", "polite");
      overlay.innerHTML =
        '<div class="loading-card"><div><span class="spinner" aria-hidden="true"></span><strong id="tqs-loading-text">Loading…</strong></div><p class="field-hint" style="margin:0.5rem 0 0">Secure request in progress.</p></div>';
      document.body.appendChild(overlay);
    }
  }

  /**
   * Shows a short toast notification.
   * @param {string} message
   * @param {'info'|'success'|'error'} type
   * @param {number} [durationMs]
   */
  function showToast(message, type, durationMs) {
    ensureHosts();
    const host = document.getElementById("tqs-toast-host");
    if (!host) return;

    const el = document.createElement("div");
    el.className = "toast " + (type || "info");
    el.textContent = message;
    host.appendChild(el);

    const ttl = typeof durationMs === "number" ? durationMs : 4200;
    window.setTimeout(function () {
      el.remove();
    }, ttl);
  }

  /**
   * Increments a global loading counter so nested calls behave nicely.
   * @param {boolean} isLoading
   * @param {string} [message]
   */
  function setLoading(isLoading, message) {
    ensureHosts();
    const overlay = document.getElementById("tqs-loading-overlay");
    const label = document.getElementById("tqs-loading-text");
    if (!overlay) return;

    if (isLoading) {
      loadingCount += 1;
      if (label && message) {
        label.textContent = message;
      } else if (label && loadingCount === 1) {
        label.textContent = "Loading…";
      }
      overlay.classList.add("is-visible");
    } else {
      loadingCount = Math.max(0, loadingCount - 1);
      if (loadingCount === 0) {
        overlay.classList.remove("is-visible");
      }
    }
  }

  /**
   * Wraps an async function with automatic loading + error toast.
   * @template T
   * @param {() => Promise<T>} fn
   * @param {string} loadingMessage
   * @returns {Promise<T | undefined>}
   */
  async function withLoading(fn, loadingMessage) {
    setLoading(true, loadingMessage);
    try {
      return await fn();
    } catch (e) {
      const msg =
        e && typeof e === "object" && "message" in e
          ? String(/** @type {{message?:unknown}} */ (e).message)
          : "Something went wrong.";
      showToast(msg, "error");
      return undefined;
    } finally {
      setLoading(false);
    }
  }

  global.TeacherQuizUI = {
    showToast: showToast,
    setLoading: setLoading,
    withLoading: withLoading,
    ensureHosts: ensureHosts,
  };
})(window);
