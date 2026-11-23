(function () {
  var $ = function (id) { return document.getElementById(id); };
  var params = new URLSearchParams(location.search);
  var weiter = params.get("weiter");
  if (!weiter || weiter.charAt(0) !== "/" || weiter.charAt(1) === "/") weiter = null;
  var mailForCode = "";

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

  var views = ["k-laden", "k-aus", "k-pw", "k-ein", "k-weg"];
  function show(id) {
    views.forEach(function (v) { $(v).hidden = v !== id; });
  }

  var forms = ["anmelden", "neu", "code"];
  function showForm(name) {
    forms.forEach(function (f) { $("k-form-" + f).hidden = f !== name; });
    var tabbed = name === "anmelden" || name === "neu";
    document.querySelector(".gwc-k-tabs").hidden = !tabbed;
    document.querySelectorAll(".gwc-k-tab").forEach(function (b) {
      b.setAttribute("aria-selected", b.getAttribute("data-tab") === name ? "true" : "false");
    });
  }

  function wire(formId, build, run) {
    var form = $(formId);
    var status = form.querySelector(".gwc-status");
    var btn = form.querySelector(".gwc-submit");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var body = build(form, status);
      if (!body) return;
      btn.disabled = true;
      say(status, "Einen Moment ...", "");
      run(body)
        .catch(function () { say(status, "Der Dienst ist gerade nicht erreichbar.", "is-error"); })
        .then(function () { btn.disabled = false; });
    });
  }

  function fail(status, res) {
    say(status, (res.data && res.data.fehler) || "Das hat nicht geklappt. Bitte erneut versuchen.", "is-error");
  }

  function signedIn(me) {
    if (weiter) { location.href = weiter; return; }
    $("k-name").textContent = me.name;
    $("k-mail").textContent = me.email;
    show("k-ein");
  }

  function loadMe() {
    return api("ich", "GET").then(function (res) {
      if (res.status === 200 && res.data.ok) { signedIn(res.data); }
      else if (res.status === 401 && res.data.stufe === "passwort") { show("k-pw"); }
      else if (res.status === 401) { show("k-aus"); showForm("anmelden"); }
      else { show("k-weg"); }
    });
  }

  document.querySelectorAll(".gwc-k-tab").forEach(function (b) {
    b.addEventListener("click", function () { showForm(b.getAttribute("data-tab")); });
  });
  $("k-zu-vergessen").addEventListener("click", function () {
    $("k-neu-text").textContent = "Passwort vergessen? Geben Sie Ihre E-Mail-Adresse ein. Wir schicken Ihnen einen Code, mit dem Sie ein neues Passwort festlegen.";
    $("kn-mail").value = $("ka-mail").value;
    showForm("neu");
  });
  $("k-code-zurueck").addEventListener("click", function () { showForm("neu"); });

  wire("k-form-anmelden",
    function (f) { return { email: f.elements.email.value, passwort: f.elements.passwort.value }; },
    function (body) {
      var st = $("k-form-anmelden").querySelector(".gwc-status");
      return api("anmelden", "POST", body).then(function (res) {
        if (res.data && res.data.ok) { return loadMe(); }
        fail(st, res);
      });
    });

  wire("k-form-neu",
    function (f, st) {
      if (!f.elements.einwilligung.checked) { say(st, "Bitte stimmen Sie der Datenschutzerklärung zu.", "is-error"); return null; }
      return { email: f.elements.email.value, website: f.elements.website.value };
    },
    function (body) {
      var st = $("k-form-neu").querySelector(".gwc-status");
      return api("code-anfordern", "POST", body).then(function (res) {
        if (res.data && res.data.ok) {
          mailForCode = body.email.trim().toLowerCase();
          $("k-code-mail").textContent = mailForCode;
          say(st, "", "");
          showForm("code");
          $("kc-code").focus();
        } else { fail(st, res); }
      });
    });

  wire("k-form-code",
    function (f) { return { email: mailForCode, code: f.elements.code.value }; },
    function (body) {
      var st = $("k-form-code").querySelector(".gwc-status");
      return api("code-pruefen", "POST", body).then(function (res) {
        if (res.data && res.data.ok) { show("k-pw"); $("kp-pw").focus(); }
        else { fail(st, res); }
      });
    });

  wire("k-form-pw",
    function (f, st) {
      if (f.elements.passwort.value.length < 10) { say(st, "Das Passwort braucht mindestens 10 Zeichen.", "is-error"); return null; }
      if (f.elements.passwort.value !== f.elements.passwort2.value) { say(st, "Die beiden Passwörter sind nicht gleich.", "is-error"); return null; }
      return { passwort: f.elements.passwort.value };
    },
    function (body) {
      var st = $("k-form-pw").querySelector(".gwc-status");
      return api("passwort", "POST", body).then(function (res) {
        if (res.data && res.data.ok) { return loadMe(); }
        fail(st, res);
      });
    });

  $("k-abmelden").addEventListener("click", function () {
    api("abmelden", "POST", {}).then(function () { location.href = "/konto/"; });
  });

  var g = params.get("google");
  api("optionen", "GET").then(function (res) {
    if (res.data && res.data.google) {
      $("k-google").hidden = false;
      if (weiter) $("k-google-link").href = "/api/konto/google/start?weiter=" + encodeURIComponent(weiter);
    }
  }).catch(function () {}).then(function () {
    return loadMe().catch(function () { show("k-weg"); });
  }).then(function () {
    if (g === "fehler" && !$("k-aus").hidden) {
      say(document.querySelector("#k-form-anmelden .gwc-status"), "Die Anmeldung mit Google hat nicht geklappt. Bitte erneut versuchen.", "is-error");
    }
  });
})();
