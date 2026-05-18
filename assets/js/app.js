/**
 * Teacher Quiz — Homepage interactions (vanilla JS)
 * - Mobile navigation drawer
 * - Smooth in-page navigation (respects reduced motion via CSS)
 * - Subtle scroll-reveal animations
 * - Closes the mobile menu after a link is tapped
 */

(function () {
  "use strict";

  /**
   * Query helper scoped to a root element (defaults to document).
   * @param {string} selector
   * @param {ParentNode} [root]
   * @returns {HTMLElement | null}
   */
  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  /**
   * @param {string} selector
   * @param {ParentNode} [root]
   * @returns {NodeListOf<HTMLElement>}
   */
  function $all(selector, root) {
    return (root || document).querySelectorAll(selector);
  }

  /**
   * Mobile nav: toggle aria-expanded and panel visibility class.
   */
  function initNav() {
    var toggle = $("[data-nav-toggle]");
    var panel = $("[data-nav-panel]");
    if (!toggle || !panel) return;

    /** @param {boolean} open */
    function setOpen(open) {
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      panel.classList.toggle("is-open", open);
      document.body.style.overflow = open ? "hidden" : "";
    }

    toggle.addEventListener("click", function () {
      var expanded = toggle.getAttribute("aria-expanded") === "true";
      setOpen(!expanded);
    });

    // Close when a navigation link is activated (mobile drawer UX)
    $all("[data-nav-panel] a").forEach(function (link) {
      link.addEventListener("click", function () {
        setOpen(false);
      });
    });

    // Close on Escape
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") setOpen(false);
    });

    // Close when resizing to desktop layout
    window.addEventListener(
      "resize",
      function () {
        if (window.matchMedia("(min-width: 900px)").matches) {
          setOpen(false);
        }
      },
      { passive: true }
    );
  }

  /**
   * Scroll reveal: adds .is-visible when elements enter the viewport.
   */
  function initReveal() {
    var els = $all(".reveal");
    if (!els.length) return;

    if (!("IntersectionObserver" in window)) {
      els.forEach(function (el) {
        el.classList.add("is-visible");
      });
      return;
    }

    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        });
      },
      { root: null, threshold: 0.12, rootMargin: "0px 0px -10% 0px" }
    );

    els.forEach(function (el) {
      io.observe(el);
    });
  }

  /**
   * Bootstraps homepage behaviors once the DOM is ready.
   */
  function init() {
    initNav();
    initReveal();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
