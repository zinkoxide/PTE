/* ==========================================
   PTE Trainer
   Theme Toggle (dark / light)
   ========================================== */

(function () {
  "use strict";

  var STORAGE_KEY = "pte.theme";

  function systemTheme() {
    return window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  }

  function apply(theme) {
    document.documentElement.setAttribute("data-theme", theme);
  }

  function refreshButton(btn) {
    if (!btn) return;
    var label = btn.querySelector(".theme-label");
    var theme = document.documentElement.getAttribute("data-theme");
    if (label) {
      label.textContent = theme === "light" ? "Light" : "Dark";
    }
    btn.setAttribute("aria-label", "Switch to " + (theme === "light" ? "dark" : "light") + " mode");
  }

  // Apply before first paint to avoid theme flash
  apply(localStorage.getItem(STORAGE_KEY) || systemTheme());

  // Follow system changes only when the user has not chosen explicitly
  if (window.matchMedia) {
    var mq = window.matchMedia("(prefers-color-scheme: light)");
    var onSystemChange = function (event) {
      if (!localStorage.getItem(STORAGE_KEY)) {
        apply(event.matches ? "light" : "dark");
        refreshButton(document.getElementById("theme-toggle"));
      }
    };
    if (mq.addEventListener) mq.addEventListener("change", onSystemChange);
    else if (mq.addListener) mq.addListener(onSystemChange);
  }

  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.getElementById("theme-toggle");
    if (!btn) return;

    btn.addEventListener("click", function () {
      var next =
        document.documentElement.getAttribute("data-theme") === "light"
          ? "dark"
          : "light";
      apply(next);
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch (error) {
        console.warn("Unable to save theme preference:", error);
      }
      refreshButton(btn);
    });

    refreshButton(btn);
  });
})();