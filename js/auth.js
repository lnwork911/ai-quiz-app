/**
 * auth.js — Netlify Identity bootstrap + JWT access for authenticated API calls.
 *
 * Prerequisites:
 * - Enable Identity in Netlify UI for this site.
 * - Add the Identity widget script on pages that use auth (see HTML files).
 */

(function (global) {
  "use strict";
  /** @type {boolean} */
  let identityInitialized = false;

  /** @type {Promise<void> | null} */
  let identityReadyPromise = null;

  /** @type {Array<(user: object | null) => void>} */
  const listeners = [];

  /**
   * Notifies subscribers when the logged-in user changes.
   * @param {object | null} user
   */
  function emit(user) {
    for (let i = 0; i < listeners.length; i++) {
      try {
        listeners[i](user);
      } catch {
        /* ignore subscriber errors */
      }
    }
  }

  /**
   * Initializes Netlify Identity (safe to call multiple times).
   * Returns a Promise so dashboards can wait for persisted sessions to hydrate.
   * @returns {Promise<void>}
   */
  function initIdentity() {
    if (!global.netlifyIdentity) {
      console.warn(
        "Netlify Identity widget not loaded. Add the script tag from login.html."
      );
      return Promise.resolve();
    }

    if (identityInitialized) {
      return identityReadyPromise || Promise.resolve();
    }

    identityInitialized = true;

    global.netlifyIdentity.on("login", function (user) {
      emit(user || null);
    });

    global.netlifyIdentity.on("logout", function () {
      emit(null);
    });

    global.netlifyIdentity.on("error", function (err) {
      console.error("Netlify Identity error:", err);
      if (global.TeacherQuizUI && global.TeacherQuizUI.showToast) {
        global.TeacherQuizUI.showToast("Authentication error", "error");
      }
    });

    identityReadyPromise = new Promise(function (resolve) {
      let settled = false;

      global.netlifyIdentity.on("init", function (user) {
        emit(user || null);
        if (!settled) {
          settled = true;
          resolve();
        }
      });

      /**
       * GoTrue endpoint. Prefer `localStorage.netlifySiteURL` when set (Netlify
       * Identity widget dev / preview flow), otherwise same-origin `/.netlify/identity`.
       */
      var stored = global.localStorage.getItem("netlifySiteURL");
      var base =
        stored && typeof stored === "string" && stored.indexOf("http") === 0
          ? stored.replace(/\/$/, "")
          : global.location.origin;
      var apiUrl = base + "/.netlify/identity";

      var initOpts = {
        locale: "en",
        APIUrl: apiUrl,
      };
      var mount = global.document.getElementById("netlify-identity-modal-root");
      if (mount) {
        initOpts.container = "#netlify-identity-modal-root";
      }

      global.netlifyIdentity.init(initOpts);
    });

    return identityReadyPromise;
  }

  /**
   * Returns the current Identity user or null.
   * @returns {object | null}
   */
  function getCurrentUser() {
    if (!global.netlifyIdentity) return null;
    return global.netlifyIdentity.currentUser() || null;
  }

  /**
   * Retrieves a fresh JWT for server-side verification.
   * @returns {Promise<string|null>}
   */
  async function getJwt() {
    const user = getCurrentUser();
    if (!user) return null;

    try {
      if (typeof user.jwt === "function") {
        const token = await user.jwt();
        return typeof token === "string" ? token : null;
      }
      if (typeof user.getJWT === "function") {
        const token = await user.getJWT();
        return typeof token === "string" ? token : null;
      }
    } catch (e) {
      console.error("Unable to read JWT:", e);
    }

    return null;
  }

  /**
   * Scrolls the document to the top so WebKit (iOS) lays out fixed Identity overlays predictably.
   */
  function scrollTopForModal() {
    try {
      global.window.scrollTo(0, 0);
      if (global.document.documentElement) {
        global.document.documentElement.scrollTop = 0;
      }
      if (global.document.body) {
        global.document.body.scrollTop = 0;
      }
    } catch {
      /* ignore */
    }
  }

  /**
   * Opens the Identity login modal.
   */
  function openLoginModal() {
    if (!global.netlifyIdentity) return;
    scrollTopForModal();
    global.netlifyIdentity.open("login");
    global.requestAnimationFrame(function () {
      scrollTopForModal();
    });
  }

  /**
   * Opens the Identity signup modal.
   */
  function openSignupModal() {
    if (!global.netlifyIdentity) return;
    scrollTopForModal();
    global.netlifyIdentity.open("signup");
    global.requestAnimationFrame(function () {
      scrollTopForModal();
    });
  }

  /**
   * Logs the user out and optionally navigates home.
   */
  function logout() {
    if (!global.netlifyIdentity) return;
    global.netlifyIdentity.logout();
    global.location.href = "/index.html";
  }

  /**
   * Redirects to login page if not authenticated.
   * @param {string} returnUrl
   * @returns {Promise<boolean>} true if authenticated
   */
  async function guard(returnUrl) {
    const user = getCurrentUser();
    if (user) return true;
    const target = returnUrl || global.location.pathname;
    global.location.href =
      "/login.html?return=" + encodeURIComponent(target);
    return false;
  }

  /**
   * @param {(user: object | null) => void} cb
   */
  function onAuthChange(cb) {
    listeners.push(cb);
  }

  global.TeacherQuizAuth = {
    initIdentity: initIdentity,
    getCurrentUser: getCurrentUser,
    getJwt: getJwt,
    openLoginModal: openLoginModal,
    openSignupModal: openSignupModal,
    logout: logout,
    guard: guard,
    onAuthChange: onAuthChange,
  };
})(window);
