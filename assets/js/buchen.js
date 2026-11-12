(function () {
  var FORMSPREE = "https://formspree.io/f/mrenayyq";
  var $ = function (id) { return document.getElementById(id); };
  var q = new URLSearchParams(window.location.search);
  var paket = (q.get("paket") || "").slice(0, 80);
  var kategorie = (q.get("kategorie") || "").slice(0, 80);
  var preis = (q.get("preis") || "").slice(0, 60);
  var offline = false;
  var cfg = null, stunden = 0;
  var eur = function (n) { return n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €"; };

  function basePrice() {
    var m = /(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?\s*€/.exec(preis);
    if (!m) return null;
    return parseFloat(m[1].replace(/\./g, "") + (m[2] ? "." + m[2] : ""));
  }

  function zusatzArt() {
    if (!cfg || /\/\s*Monat/i.test(preis) || (cfg.ohne_zusatz || []).indexOf(paket) >= 0) return null;
    return cfg.kategorien[kategorie] || null;
  }

  function renderCart() {
    var art = zusatzArt(), f = $("b-form"), li = [], extra = 0;
    var base = basePrice(), ab = /^\s*ab\b/i.test(preis);
    li.push([paket, preis || "Preis auf Anfrage"]);
    if (art) {
      var satz = cfg.stundensatz[art];
      if (stunden) { li.push([stunden + " zusätzliche Stunde" + (stunden > 1 ? "n" : "") + " vor Ort (" + eur(satz) + " je Std.)", eur(stunden * satz)]); extra += stunden * satz; }
      if ($("b-drohne").checked) { li.push(["Drohne", eur(cfg.drohne)]); extra += cfg.drohne; }
      if ($("b-wunsch").value.trim()) li.push(["Wunschoption", "Preis auf Anfrage"]);
    }
    var ul = $("b-cart-lines"); ul.textContent = "";
    li.forEach(function (r) {
      var e = document.createElement("li"), a = document.createElement("span"), b = document.createElement("span");
      a.textContent = r[0]; b.textContent = r[1]; e.appendChild(a); e.appendChild(b); ul.appendChild(e);
    });
    $("b-std").textContent = stunden;
    $("b-std-minus").disabled = stunden <= 0;
    $("b-std-plus").disabled = !cfg || stunden >= cfg.max_stunden;
    var sum = $("b-sum");
    if (base === null) { sum.hidden = true; $("b-sum-note").textContent = ""; return; }
    var netto = base + extra, ust = netto * cfg_ust();
    sum.hidden = false;
    $("b-netto").textContent = (ab ? "ab " : "") + eur(netto);
    $("b-ust").textContent = (ab ? "ab " : "") + eur(ust);
    $("b-brutto").textContent = (ab ? "ab " : "") + eur(netto + ust);
    $("b-sum-note").textContent = (ab ? "Bei „ab“-Preisen nennen wir Ihnen den genauen Preis vor der Bestätigung. " : "") + "Bezahlung vor Ort. Zusätzliche Stunden werden nur in vollen Stunden gebucht.";
  }

  function cfg_ust() { return ((cfg && cfg.ust) || 19) / 100; }

  function initCart() {
    fetch("/assets/data/zusatz.json?v=2026-11-12", { cache: "no-cache" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (c) {
        cfg = c;
        var art = zusatzArt();
        if (art) {
          $("b-extras").hidden = false;
          $("b-std-note").textContent = "Nur ganze Stunden, mindestens 1 Stunde, wenn Sie Zeit hinzubuchen (bis " + cfg.max_stunden + "). " + eur(cfg.stundensatz[art]) + " netto je Stunde, ohne weitere Anfahrt.";
          $("b-drohne-preis").textContent = "+ " + eur(cfg.drohne) + " netto pro Einsatz";
        }
        renderCart();
      });
    $("b-std-minus").addEventListener("click", function () { if (stunden > 0) { stunden--; renderCart(); } });
    $("b-std-plus").addEventListener("click", function () { if (cfg && stunden < cfg.max_stunden) { stunden++; renderCart(); } });
    $("b-drohne").addEventListener("change", renderCart);
    $("b-wunsch").addEventListener("input", renderCart);
  }

  function api(path, method, body) {
    return fetch("/api/konto/" + path, {
      method: method, credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-GWC": "1", Accept: "application/json" },
      body: method === "POST" ? JSON.stringify(body || {}) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) { return { status: r.status, data: d }; });
    });
  }

  function say(el, text, cls) { el.textContent = text; el.className = "gwc-status" + (cls ? " " + cls : ""); }

  function prefill(me) {
    var f = $("b-form");
    if (me) {
      $("b-hallo").textContent = "Angemeldet als " + me.name + " (" + me.email + ").";
      if (!f.elements.name.value) f.elements.name.value = me.name;
      return api("buchungen", "GET").then(function (res) {
        var last = res.data && res.data.buchungen && res.data.buchungen[0];
        if (!last || !last.adresse) return;
        ["firma", "strasse", "plz", "ort", "telefon"].forEach(function (k) {
          if (last.adresse[k] && !f.elements[k].value) f.elements[k].value = last.adresse[k];
        });
      }).catch(function () {});
    }
  }

  function showForm(me) {
    $("b-laden").hidden = true;
    $("b-form").hidden = false;
    if (offline) { $("b-offline").hidden = false; $("b-mail-row").hidden = false; $("b-mail").required = true; }
    prefill(me);
  }

  function collect(f) {
    var d = {};
    ["name", "firma", "strasse", "plz", "ort", "telefon", "wunschtermin", "einsatzort", "nachricht"].forEach(function (k) {
      d[k] = (f.elements[k].value || "").trim();
    });
    d.vorgespraech = f.elements.vorgespraech.checked;
    d.agb = f.elements.agb.checked;
    d.paket = paket; d.kategorie = kategorie; d.preis = preis;
    var art = zusatzArt();
    d.stunden = art ? stunden : 0;
    d.drohne = art ? $("b-drohne").checked : false;
    d.wunschoption = art ? $("b-wunsch").value.trim() : "";
    return d;
  }

  function check(d, f) {
    if (!d.name || !d.strasse || !d.ort) return "Bitte Name und Adresse vollständig angeben.";
    if (!/^\d{4,5}$/.test(d.plz)) return "Bitte eine gültige Postleitzahl angeben.";
    if (d.telefon.replace(/\D/g, "").length < 6) return "Bitte eine Telefonnummer angeben.";
    if (offline && !/^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/.test(f.elements.email.value.trim())) return "Bitte eine gültige E-Mail-Adresse angeben.";
    if (!d.agb) return "Bitte bestätigen Sie die AGB und die Datenschutzerklärung.";
    return "";
  }

  function mail(d, nr, email) {
    var fd = new FormData();
    fd.append("_subject", "Neue Buchung: " + d.paket + (nr ? " (" + nr + ")" : ""));
    fd.append("formular", "Paketbuchung");
    fd.append("buchungsnummer", nr || "ohne Konto (Dienst nicht erreichbar)");
    fd.append("paket", d.paket); fd.append("kategorie", d.kategorie); fd.append("preis", d.preis + " (laut Website)");
    fd.append("name", d.name); fd.append("email", email); fd.append("firma", d.firma);
    fd.append("adresse", d.strasse + ", " + d.plz + " " + d.ort); fd.append("telefon", d.telefon);
    fd.append("wunschtermin", d.wunschtermin || "-"); fd.append("einsatzort", d.einsatzort || "-");
    fd.append("vorgespraech", d.vorgespraech ? "Ja, Vorgespräch gewünscht" : "Nein, direkt so buchen");
    fd.append("zusatzstunden", d.stunden ? d.stunden + " Std. (volle Stunden)" : "keine");
    fd.append("drohne", d.drohne ? "Ja" : "Nein"); fd.append("wunschoption", d.wunschoption || "-");
    fd.append("nachricht", d.nachricht || "-"); fd.append("bezahlung", "vor Ort");
    return fetch(FORMSPREE, { method: "POST", body: fd, headers: { Accept: "application/json" } })
      .then(function (r) { if (!r.ok) throw new Error("mail"); });
  }

  function done(nr) {
    $("b-form").hidden = true;
    $("b-nr").textContent = nr || "folgt per E-Mail";
    $("b-fertig").hidden = false;
    $("b-fertig").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function init() {
    if (!paket) {
      $("b-laden").textContent = "Bitte wählen Sie zuerst ein Paket auf der Preisseite.";
      return;
    }
    initCart();
    $("b-kat").textContent = kategorie;
    $("b-paket").textContent = paket;
    $("b-preis").textContent = preis ? "Ihr Preis: " + preis + " · Bezahlung vor Ort" : "Bezahlung vor Ort";
    document.title = paket + " buchen – GREENWOODCREEK";
    $("b-login-link").href = "/konto/?weiter=" + encodeURIComponent(location.pathname + location.search);

    var me = null;
    api("ich", "GET").then(function (res) {
      if (res.status === 200 && res.data.ok) { me = res.data; showForm(me); }
      else if (res.status === 401) { $("b-laden").hidden = true; $("b-login").hidden = false; }
      else { offline = true; showForm(null); }
    }).catch(function () { offline = true; showForm(null); });

    var f = $("b-form"), st = f.querySelector(".gwc-status"), btn = f.querySelector(".gwc-submit");
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var d = collect(f), err = check(d, f);
      if (err) { say(st, err, "is-error"); return; }
      btn.disabled = true; say(st, "Buchung wird gesendet ...", "");
      var p = offline
        ? mail(d, "", f.elements.email.value.trim()).then(function () { done(""); })
        : api("buchen", "POST", d).then(function (res) {
            if (res.data && res.data.ok) {
              return mail(d, res.data.nr, me.email).catch(function () {}).then(function () { done(res.data.nr); });
            }
            if (res.status === 401) { window.location.href = $("b-login-link").href; return; }
            say(st, (res.data && res.data.fehler) || "Die Buchung hat nicht geklappt. Bitte erneut versuchen.", "is-error");
          });
      p.catch(function () {
        say(st, "Die Buchung konnte nicht gesendet werden. Bitte rufen Sie uns an: +49 151 55828308", "is-error");
      }).finally(function () { btn.disabled = false; });
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
