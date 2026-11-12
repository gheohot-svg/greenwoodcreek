(function () {
  var ENDPOINT = "https://formspree.io/f/mrenayyq";
  var DATA_URL = "/assets/data/bewertungen.json?v=2026-11-12";

  function stars(n) {
    var full = Math.max(0, Math.min(5, parseInt(n, 10) || 0));
    return "★★★★★".slice(0, full) + "☆☆☆☆☆".slice(0, 5 - full);
  }

  function formatDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    return m ? m[3] + "." + m[2] + "." + m[1] : "";
  }

  function renderList() {
    var list = document.getElementById("gwc-bw-list");
    var empty = document.getElementById("gwc-bw-empty");
    if (!list) return;

    fetch(DATA_URL, { headers: { Accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : { bewertungen: [] }; })
      .catch(function () { return { bewertungen: [] }; })
      .then(function (data) {
        var items = (data && data.bewertungen) || [];
        if (!items.length) {
          if (empty) empty.hidden = false;
          return;
        }
        items = items.slice().sort(function (a, b) { return (b.datum || "").localeCompare(a.datum || ""); });
        items.forEach(function (b) {
          var li = document.createElement("li");
          li.className = "gwc-bw-item";

          var s = document.createElement("p");
          s.className = "gwc-bw-stars";
          s.setAttribute("aria-label", (parseInt(b.sterne, 10) || 0) + " von 5 Sternen");
          s.textContent = stars(b.sterne);

          var t = document.createElement("p");
          t.className = "gwc-bw-text";
          t.textContent = b.text || "";

          var m = document.createElement("p");
          m.className = "gwc-bw-meta";
          m.textContent = (b.name || "") + (b.datum ? ", " + formatDate(b.datum) : "");

          li.appendChild(s);
          li.appendChild(t);
          li.appendChild(m);
          list.appendChild(li);
        });
      });
  }

  function initForm() {
    var form = document.getElementById("gwc-bw-form");
    if (!form) return;
    var status = form.querySelector(".gwc-status");
    var button = form.querySelector(".gwc-submit");

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var honeypot = form.querySelector('input[name="_gotcha"]');
      if (honeypot && honeypot.value) return;

      if (!form.querySelector('input[name="sterne"]:checked')) {
        status.textContent = "Bitte wählen Sie eine Sternebewertung aus.";
        status.className = "gwc-status is-error";
        return;
      }

      button.disabled = true;
      status.textContent = "Wird gesendet...";
      status.className = "gwc-status";

      fetch(ENDPOINT, {
        method: "POST",
        body: new FormData(form),
        headers: { Accept: "application/json" }
      })
        .then(function (response) {
          if (!response.ok) throw new Error("send failed");
          status.textContent = "Vielen Dank für Ihre Bewertung. Sie erscheint nach einer kurzen Prüfung auf dieser Seite.";
          status.className = "gwc-status is-success";
          form.reset();
        })
        .catch(function () {
          status.textContent = "Die Bewertung konnte nicht gesendet werden. Bitte versuchen Sie es erneut oder schreiben Sie direkt an neumeyer.jan@web.de";
          status.className = "gwc-status is-error";
        })
        .finally(function () {
          button.disabled = false;
        });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    renderList();
    initForm();
  });
})();
