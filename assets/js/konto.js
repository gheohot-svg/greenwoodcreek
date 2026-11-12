(function () {
  var $ = function (id) { return document.getElementById(id); };

  function api(path, method, body) {
    return fetch("/api/konto/" + path, {
      method: method,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-GWC": "1", Accept: "application/json" },
      body: method === "POST" ? JSON.stringify(body || {}) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) { return { status: r.status, data: d }; });
    });
  }

  function say(el, text, cls) {
    el.textContent = text;
    el.className = "gwc-status" + (cls ? " " + cls : "");
  }

  var views = ["k-laden", "k-aus", "k-ein", "k-weg", "k-neu"];
  function show(id) {
    views.forEach(function (v) { $(v).hidden = v !== id; });
  }

  function tab(name) {
    ["anmelden", "registrieren", "vergessen"].forEach(function (t) {
      $("k-form-" + t).hidden = t !== name;
    });
    document.querySelectorAll(".gwc-k-tab").forEach(function (b) {
      b.setAttribute("aria-selected", b.getAttribute("data-tab") === name ? "true" : "false");
    });
  }

  function wire(formId, path, build, done) {
    var form = $(formId);
    var status = form.querySelector(".gwc-status");
    var btn = form.querySelector(".gwc-submit");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      btn.disabled = true;
      say(status, "Einen Moment ...", "");
      api(path, "POST", build(form))
        .then(function (res) {
          if (res.data && res.data.ok) { done(res.data, form, status); }
          else { say(status, (res.data && res.data.fehler) || "Das hat nicht geklappt. Bitte erneut versuchen.", "is-error"); }
        })
        .catch(function () { say(status, "Der Dienst ist gerade nicht erreichbar.", "is-error"); })
        .finally(function () { btn.disabled = false; });
    });
  }

  function loadMe() {
    return api("ich", "GET").then(function (res) {
      if (res.status === 200 && res.data.ok) {
        $("k-name").textContent = res.data.name;
        $("k-mail").textContent = res.data.email;
        show("k-ein");
      } else if (res.status === 401) {
        show("k-aus");
      } else {
        show("k-weg");
      }
    }).catch(function () { show("k-weg"); });
  }

  function init() {
    document.querySelectorAll(".gwc-k-tab").forEach(function (b) {
      b.addEventListener("click", function () { tab(b.getAttribute("data-tab")); });
    });
    $("k-zu-vergessen").addEventListener("click", function () { tab("vergessen"); });
    $("k-zu-anmelden").addEventListener("click", function () { tab("anmelden"); });

    wire("k-form-anmelden", "anmelden",
      function (f) { return { email: f.elements.email.value, passwort: f.elements.passwort.value }; },
      function () { window.location.reload(); });

    wire("k-form-registrieren", "registrieren",
      function (f) {
        return { name: f.elements.name.value, email: f.elements.email.value,
                 passwort: f.elements.passwort.value, einwilligung: f.elements.einwilligung.checked === true };
      },
      function (d, f, st) {
        f.reset();
        say(st, d.status === "bestaetigen"
          ? "Fast geschafft: Wir haben Ihnen eine E-Mail mit einem Bestätigungslink geschickt."
          : "Ihr Konto ist angelegt. Sie können sich jetzt anmelden.", "is-success");
        if (d.status !== "bestaetigen") { tab("anmelden"); }
      });

    wire("k-form-vergessen", "passwort-vergessen",
      function (f) { return { email: f.elements.email.value }; },
      function (d, f, st) {
        f.reset();
        say(st, "Wenn zu dieser Adresse ein Konto existiert, haben wir Ihnen einen Link zum Zurücksetzen geschickt.", "is-success");
      });

    var resetToken = "";
    wire("k-form-neu", "passwort-neu",
      function (f) { return { token: resetToken, passwort: f.elements.passwort.value }; },
      function () { show("k-aus"); tab("anmelden"); say($("k-form-anmelden").querySelector(".gwc-status"), "Passwort geändert. Bitte melden Sie sich neu an.", "is-success"); });

    $("k-abmelden").addEventListener("click", function () {
      api("abmelden", "POST", {}).then(function () { window.location.reload(); });
    });

    wire("k-form-loeschen", "loeschen",
      function (f) { return { passwort: f.elements.passwort.value }; },
      function () { window.location.href = "/"; });

    var q = new URLSearchParams(window.location.search);
    var verify = q.get("bestaetigen");
    var reset = q.get("zuruecksetzen");
    if (verify || reset) { window.history.replaceState(null, "", window.location.pathname); }

    if (reset) {
      resetToken = reset;
      show("k-neu");
    } else if (verify) {
      api("bestaetigen", "POST", { token: verify }).then(function (res) {
        loadMe().then(function () {
          var st = $("k-form-anmelden").querySelector(".gwc-status");
          if (res.data && res.data.ok) { say(st, "E-Mail-Adresse bestätigt. Sie können sich jetzt anmelden.", "is-success"); }
          else { say(st, (res.data && res.data.fehler) || "Der Link ist ungültig oder abgelaufen.", "is-error"); }
        });
      });
    } else {
      loadMe();
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
