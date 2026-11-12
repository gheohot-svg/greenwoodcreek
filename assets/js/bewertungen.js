(function () {
  var FORMSPREE = "https://formspree.io/f/mrenayyq";
  var API = "/api/bewertung";
  var SOURCES = [
    "/assets/data/bewertungen.json?v=2026-11-12",
    "/assets/data/live/bewertungen.json"
  ];

  function stars(n) {
    var full = Math.max(0, Math.min(5, parseInt(n, 10) || 0));
    return "★★★★★".slice(0, full) + "☆☆☆☆☆".slice(0, 5 - full);
  }

  function formatDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    return m ? m[3] + "." + m[2] + "." + m[1] : "";
  }

  function fetchList(url) {
    return fetch(url, { headers: { Accept: "application/json" }, cache: "no-cache" })
      .then(function (r) { return r.ok ? r.json() : { bewertungen: [] }; })
      .catch(function () { return { bewertungen: [] }; })
      .then(function (d) { return (d && d.bewertungen) || []; });
  }

  function loadAll() {
    return Promise.all(SOURCES.map(fetchList)).then(function (lists) {
      var seen = {}, out = [];
      lists.forEach(function (l) {
        l.forEach(function (b) {
          var key = (b.name || "") + "|" + (b.text || "");
          if (!seen[key]) { seen[key] = 1; out.push(b); }
        });
      });
      return out.sort(function (a, b) { return (b.datum || "").localeCompare(a.datum || ""); });
    });
  }

  function renderSummary(items) {
    var els = document.querySelectorAll("[data-gwc-bw-summary]");
    if (!els.length || !items.length) return;
    var sum = 0;
    items.forEach(function (b) { sum += Math.max(1, Math.min(5, parseInt(b.sterne, 10) || 0)); });
    var avg = (Math.round((sum / items.length) * 10) / 10).toFixed(1).replace(".", ",");
    var label = items.length === 1 ? "1 Bewertung" : items.length + " Bewertungen";
    els.forEach(function (el) {
      el.textContent = "★ " + avg + " von 5 · " + label;
      el.setAttribute("aria-label", "Durchschnittlich " + avg + " von 5 Sternen aus " + label);
      el.hidden = false;
    });
  }

  function renderList(items) {
    var list = document.getElementById("gwc-bw-list");
    var empty = document.getElementById("gwc-bw-empty");
    if (!list) return;
    list.textContent = "";
    if (!items.length) {
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
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
  }

  function refresh() {
    return loadAll().then(function (items) {
      renderList(items);
      renderSummary(items);
    });
  }

  function setStatus(el, text, cls) {
    el.textContent = text;
    el.className = "gwc-status" + (cls ? " " + cls : "");
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

      var checked = form.querySelector('input[name="sterne"]:checked');
      if (!checked) {
        setStatus(status, "Bitte wählen Sie eine Sternebewertung aus.", "is-error");
        return;
      }

      var payload = {
        name: form.elements["name"].value,
        text: form.elements["bewertung"].value,
        sterne: parseInt(checked.value, 10),
        einwilligung: form.elements["einwilligung"].checked === true,
        website: honeypot ? honeypot.value : ""
      };
      var mailCopy = new FormData(form);

      button.disabled = true;
      setStatus(status, "Wird gesendet...", "");

      var sendMail = function () {
        return fetch(FORMSPREE, { method: "POST", body: mailCopy, headers: { Accept: "application/json" } });
      };

      fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload)
      })
        .then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (d) { return { status: r.status, data: d }; });
        })
        .then(function (res) {
          if (res.status === 400 || res.status === 429) {
            setStatus(status, (res.data && res.data.fehler) || "Bitte prüfen Sie Ihre Angaben.", "is-error");
            return;
          }
          if (res.status === 200 && res.data && res.data.ok) {
            sendMail().catch(function () {});
            form.reset();
            if (res.data.status === "veroeffentlicht") {
              setStatus(status, "Vielen Dank für Ihre Bewertung. Sie ist jetzt auf dieser Seite sichtbar.", "is-success");
              refresh();
            } else {
              setStatus(status, "Vielen Dank für Ihre Bewertung. Sie erscheint nach einer kurzen Prüfung auf dieser Seite.", "is-success");
            }
            return;
          }
          throw new Error("api");
        })
        .catch(function () {
          // Dienst nicht erreichbar: Bewertung geht per Mail an uns und wird nach Prüfung veröffentlicht
          return sendMail().then(function (r) {
            if (!r.ok) throw new Error("mail");
            form.reset();
            setStatus(status, "Vielen Dank für Ihre Bewertung. Sie erscheint nach einer kurzen Prüfung auf dieser Seite.", "is-success");
          });
        })
        .catch(function () {
          setStatus(status, "Die Bewertung konnte nicht gesendet werden. Bitte versuchen Sie es erneut oder schreiben Sie direkt an neumeyer.jan@web.de", "is-error");
        })
        .finally(function () {
          button.disabled = false;
        });
    });
  }

  function prefillName() {
    var field = document.getElementById("gwc-bw-name");
    if (!field) return;
    fetch("/api/konto/ich", { credentials: "same-origin", headers: { "X-GWC": "1", Accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && d.ok && d.name && !field.value) field.value = d.name; })
      .catch(function () {});
  }

  document.addEventListener("DOMContentLoaded", function () {
    refresh();
    initForm();
    prefillName();
  });
})();
