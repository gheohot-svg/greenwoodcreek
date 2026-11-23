/* Black Week 2026: blendet die Aktion nach dem Ende aus und markiert
   Kontaktanfragen, damit in der Formspree-Mail "Black Week" steht.
   contact-form.js liest window.gwcDeal und zeigt nach dem Absenden den Code. */
(function () {
  var END = new Date("2026-12-01T00:00:00+01:00"); // nach Cyber Monday (30.11.)
  var active = Date.now() < END.getTime();
  window.gwcDeal = { active: active, code: "GWC-26" };

  function init() {
    document.querySelectorAll("[data-gwc-deal]").forEach(function (el) {
      if (active) el.removeAttribute("hidden");
      else el.parentNode && el.parentNode.removeChild(el);
    });
    if (!active) return;
    document.querySelectorAll(".gwc-form").forEach(function (form) {
      if (form.querySelector('input[name="aktion"]')) return;
      var f = document.createElement("input");
      f.type = "hidden";
      f.name = "aktion";
      f.setAttribute("value", "Black Week 2026 – Code GWC-26");
      form.appendChild(f);
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
