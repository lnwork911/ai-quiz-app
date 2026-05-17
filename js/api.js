/**
 * api.js — centralized JSON fetch helper with Identity JWT + consistent errors.
 */

(function (global) {
  "use strict";

  /**
   * Performs an authenticated JSON request to a Netlify Function (or same-origin path).
   * @param {string} path Example: "/.netlify/functions/generateQuiz"
   * @param {RequestInit & { json?: unknown }} options
   * @returns {Promise<any>}
   */
  async function apiRequest(path, options) {
    const auth = global.TeacherQuizAuth;
    if (!auth || typeof auth.getJwt !== "function") {
      throw new Error("TeacherQuizAuth is not available. Load auth.js before api.js.");
    }

    const token = await auth.getJwt();
    if (!token) {
      throw new Error("You must be signed in to call this API.");
    }

    /** @type {RequestInit} */
    const init = Object.assign({}, options);
    const headers = new Headers(init.headers || {});

    headers.set("Authorization", "Bearer " + token);

    let body = init.body;
    if (options && options.json !== undefined) {
      headers.set("Content-Type", "application/json;charset=utf-8");
      body = JSON.stringify(options.json);
    }

    init.headers = headers;
    init.body = body;

    const res = await fetch(path, init);
    const text = await res.text();
    let data = null;

    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { error: "Non-JSON response from server", raw: text };
      }
    }

    if (!res.ok) {
      const message =
        data && typeof data === "object" && data.error
          ? String(data.error)
          : "Request failed (" + res.status + ")";
      const err = new Error(message);
      /** @type {{ status?: number, data?: unknown }} */
      const enriched = err;
      enriched.status = res.status;
      enriched.data = data;
      throw err;
    }

    return data;
  }

  /**
   * GET helper (verify session, future analytics endpoints, etc.).
   * @param {string} path
   */
  async function apiGet(path) {
    return apiRequest(path, { method: "GET" });
  }

  /**
   * POST helper with JSON body.
   * @param {string} path
   * @param {unknown} json
   */
  async function apiPostJson(path, json) {
    return apiRequest(path, { method: "POST", json: json });
  }

  global.TeacherQuizApi = {
    apiRequest: apiRequest,
    apiGet: apiGet,
    apiPostJson: apiPostJson,
  };
})(window);
