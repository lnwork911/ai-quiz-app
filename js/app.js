/**
 * app.js — page wiring: navigation helpers, dashboard quiz flow, pricing checkout.
 */

(function (global) {
  "use strict";

  /**
   * Marks the active navigation link for the current page.
   */
  function highlightNav() {
    const path = global.location.pathname.split("/").pop() || "index.html";
    const links = document.querySelectorAll("[data-nav]");
    links.forEach(function (link) {
      const href = link.getAttribute("href") || "";
      if (href === path || (path === "" && href === "index.html")) {
        link.classList.add("is-active");
      }
    });
  }

  /**
   * Updates the small user chip in the header (if present).
   */
  function renderUserChip() {
    const auth = global.TeacherQuizAuth;
    const el = document.getElementById("tqs-user-chip");
    if (!el || !auth) return;

    const user = auth.getCurrentUser();
    if (!user) {
      el.textContent = "";
      return;
    }

    const email =
      user.email ||
      (user.user_metadata && user.user_metadata.email) ||
      "Signed in";
    el.textContent = email;
  }

  /**
   * Landing page interactions (public).
   */
  function initLanding() {
    function goDashboard() {
      global.location.href = "/dashboard.html";
    }

    const goDash = document.getElementById("tqs-go-dashboard");
    if (goDash) {
      goDash.addEventListener("click", goDashboard);
    }

    const goDashCta = document.getElementById("tqs-go-dashboard-cta");
    if (goDashCta) {
      goDashCta.addEventListener("click", goDashboard);
    }
  }

  /**
   * Verifies the JWT with the backend and shows friendly status text.
   */
  async function refreshSessionBanner() {
    const banner = document.getElementById("tqs-session");
    const auth = global.TeacherQuizAuth;
    const api = global.TeacherQuizApi;
    const ui = global.TeacherQuizUI;
    if (!banner || !auth || !api) return;

    try {
      const data = await api.apiGet("/.netlify/functions/verifyUser");
      if (data && data.user) {
        banner.textContent =
          "Session verified for " + (data.user.email || data.user.id) + ".";
      }
    } catch (e) {
      banner.textContent =
        "We could not verify your session yet. Try refreshing after login.";
      if (ui && ui.showToast) {
        ui.showToast(
          e && e.message ? e.message : "Session verification failed",
          "error"
        );
      }
    }
  }

  /**
   * Teacher dashboard: AI quiz generation + preview.
   */
  function initDashboard() {
    const auth = global.TeacherQuizAuth;
    const api = global.TeacherQuizApi;
    const ui = global.TeacherQuizUI;
    const form = document.getElementById("tqs-quiz-form");
    const out = document.getElementById("tqs-quiz-output");

    if (!auth || !api || !form || !out) return;

    auth.onAuthChange(function () {
      renderUserChip();
    });

    form.addEventListener("submit", async function (ev) {
      ev.preventDefault();
      const topic = /** @type {HTMLInputElement} */ (
        document.getElementById("tqs-topic")
      ).value.trim();
      const gradeLevel = /** @type {HTMLInputElement} */ (
        document.getElementById("tqs-grade")
      ).value.trim();
      const questionCount = parseInt(
        /** @type {HTMLSelectElement} */ (document.getElementById("tqs-count"))
          .value,
        10
      );
      const difficulty = /** @type {HTMLSelectElement} */ (
        document.getElementById("tqs-difficulty")
      ).value;

      const run = async function () {
        const payload = {
          topic: topic,
          gradeLevel: gradeLevel,
          questionCount: questionCount,
          difficulty: difficulty,
        };

        const data = await api.apiPostJson(
          "/.netlify/functions/generateQuiz",
          payload
        );

        if (!data || !data.quiz) {
          throw new Error("Unexpected response from generateQuiz");
        }

        if (ui && ui.showToast) {
          ui.showToast(
            data.cached ? "Loaded a cached quiz (fast!)" : "New quiz generated",
            "success"
          );
        }

        renderQuiz(out, data.quiz);
      };

      if (ui && ui.withLoading) {
        await ui.withLoading(run, "Generating your quiz…");
      } else {
        await run();
      }
    });

    const logoutBtn = document.getElementById("tqs-logout");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", function () {
        auth.logout();
      });
    }
  }

  /**
   * Renders a quiz object into a DOM node.
   * @param {HTMLElement} container
   * @param {{ title: string, questions: Array<{ id: string, question: string, options: string[], correctIndex: number, explanation: string }> }} quiz
   */
  function renderQuiz(container, quiz) {
    const parts = [];
    parts.push('<div class="card">');
    parts.push("<h3>" + escapeHtml(quiz.title) + "</h3>");
    parts.push(
      '<p class="field-hint">Tip: export to your LMS or print for class — Phase 2 can add PDFs, classes, and analytics.</p>'
    );
    parts.push("</div>");

    quiz.questions.forEach(function (q, idx) {
      parts.push('<div class="question">');
      parts.push(
        '<div class="pill">Question ' +
          (idx + 1) +
          "</div><h4>" +
          escapeHtml(q.question) +
          "</h4>"
      );
      parts.push('<div class="options">');
      q.options.forEach(function (opt, i) {
        const isCorrect = i === q.correctIndex;
        parts.push(
          '<div class="option"><strong>' +
            String.fromCharCode(65 + i) +
            ".</strong> " +
            escapeHtml(opt) +
            (isCorrect ? ' <span style="color:#15803d;font-weight:800">(answer)</span>' : "") +
            "</div>"
        );
      });
      parts.push("</div>");
      parts.push(
        '<p class="field-hint" style="margin-top:0.75rem"><strong>Explanation:</strong> ' +
          escapeHtml(q.explanation) +
          "</p>"
      );
      parts.push("</div>");
    });

    container.innerHTML = parts.join("");
  }

  /**
   * Minimal HTML escaping for safely inserting model text.
   * @param {string} text
   */
  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /**
   * Login page: open modal or auto-redirect after login.
   */
  function initLogin() {
    const auth = global.TeacherQuizAuth;
    if (!auth) return;

    const params = new URLSearchParams(global.location.search);
    const returnUrl = params.get("return") || "/dashboard.html";

    const openBtn = document.getElementById("tqs-open-login");
    const signupBtn = document.getElementById("tqs-open-signup");

    if (openBtn) {
      openBtn.addEventListener("click", function () {
        auth.openLoginModal();
      });
    }
    if (signupBtn) {
      signupBtn.addEventListener("click", function () {
        auth.openSignupModal();
      });
    }

    auth.onAuthChange(function (user) {
      if (user) {
        global.location.href = returnUrl;
      }
    });

    if (auth.getCurrentUser()) {
      global.location.href = returnUrl;
    }
  }

  /**
   * Pricing page: authenticated Stripe Checkout via generateQuiz action branch.
   */
  function initPricing() {
    const auth = global.TeacherQuizAuth;
    const api = global.TeacherQuizApi;
    const ui = global.TeacherQuizUI;

    document.querySelectorAll("[data-checkout-plan]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        if (!auth || !api) return;

        const plan = btn.getAttribute("data-checkout-plan");
        if (!plan) return;

        if (!auth.getCurrentUser()) {
          global.location.href =
            "/login.html?return=" +
            encodeURIComponent(global.location.pathname);
          return;
        }

        const run = async function () {
          const data = await api.apiPostJson(
            "/.netlify/functions/generateQuiz",
            {
              action: "create_checkout_session",
              plan: plan,
            }
          );

          if (!data || !data.url) {
            throw new Error("Checkout URL missing from server response");
          }

          global.location.href = data.url;
        };

        if (ui && ui.withLoading) {
          await ui.withLoading(run, "Starting secure checkout…");
        } else {
          await run();
        }
      });
    });
  }

  /**
   * Boots the correct page controller after DOM is ready.
   */
  async function boot() {
    if (global.TeacherQuizUI && global.TeacherQuizUI.ensureHosts) {
      global.TeacherQuizUI.ensureHosts();
    }

    if (global.TeacherQuizAuth && global.TeacherQuizAuth.initIdentity) {
      await global.TeacherQuizAuth.initIdentity();
    }

    highlightNav();
    renderUserChip();

    if (global.TeacherQuizAuth && global.TeacherQuizAuth.onAuthChange) {
      global.TeacherQuizAuth.onAuthChange(function () {
        renderUserChip();
      });
    }

    const page = document.body.getAttribute("data-page");
    if (page === "landing") {
      initLanding();
    } else if (page === "dashboard") {
      const ok = await global.TeacherQuizAuth.guard(
        global.location.pathname + global.location.search
      );
      if (ok) {
        initDashboard();
        await refreshSessionBanner();
      }
    } else if (page === "login") {
      initLogin();
    } else if (page === "pricing") {
      initPricing();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window);
