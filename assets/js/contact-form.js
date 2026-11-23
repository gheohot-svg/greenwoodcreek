(function () {
  var FORMSPREE_ENDPOINT = "https://formspree.io/f/mrenayyq";

  // Replaces the form with a large confirmation panel + direct contact data.
  function showThanks(form) {
    var panel = form.nextElementSibling;
    if (!panel || !panel.classList.contains("gwc-thanks")) {
      panel = document.createElement("div");
      panel.className = "gwc-thanks";
      panel.setAttribute("role", "status");
      panel.tabIndex = -1;
      panel.innerHTML =
        '<svg class="gwc-thanks-icon" viewBox="0 0 48 48" fill="none" aria-hidden="true">' +
        '<circle cx="24" cy="24" r="22" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M14 25l7 7 13-15" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        '<h3 class="gwc-thanks-title">Vielen Dank für Ihre Nachricht!</h3>' +
        '<p class="gwc-thanks-text">Ihre Nachricht ist bei uns angekommen. Wir melden uns so schnell wie möglich bei Ihnen.</p>' +
        '<div class="gwc-thanks-urgent">' +
        '<p class="gwc-thanks-urgent-label">In dringenden Fällen erreichen Sie uns direkt</p>' +
        '<p class="gwc-thanks-links">' +
        '<a href="tel:+4915155828308">+49 151 55828308</a>' +
        '<a href="mailto:neumeyer.jan@web.de">neumeyer.jan@web.de</a></p></div>' +
        '<button type="button" class="gwc-thanks-again">Weitere Nachricht senden</button>';
      form.parentNode.insertBefore(panel, form.nextSibling);
      panel.querySelector(".gwc-thanks-again").addEventListener("click", function () {
        panel.hidden = true;
        form.hidden = false;
        var first = form.querySelector(".gwc-input");
        if (first) first.focus();
      });
    }
    // Black Week: exklusiven Rabattcode direkt im Danke-Fenster zeigen
    var deal = window.gwcDeal;
    if (deal && deal.active && !panel.querySelector(".gwc-deal-thanks")) {
      var box = document.createElement("div");
      box.className = "gwc-deal-thanks";
      var label = document.createElement("p");
      label.className = "gwc-deal-thanks-label";
      label.textContent = "Hier ist Ihr exklusiver Black-Week-Rabattcode:";
      var code = document.createElement("strong");
      code.className = "gwc-deal-code";
      code.textContent = deal.code;
      var note = document.createElement("p");
      note.className = "gwc-deal-thanks-note";
      note.textContent = "−20 % auf Dienstleistungen ab 2.000 €, −10 % unter 1.000 €. Nennen Sie den Code einfach bei der Buchung.";
      box.appendChild(label);
      box.appendChild(code);
      box.appendChild(note);
      var text = panel.querySelector(".gwc-thanks-text");
      text.parentNode.insertBefore(box, text.nextSibling);
    }
    form.hidden = true;
    panel.hidden = false;
    var rect = panel.getBoundingClientRect();
    if (rect.top < 0 || rect.bottom > window.innerHeight) {
      panel.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    panel.focus({ preventScroll: true });
  }

  function handleSubmit(form) {
    form.setAttribute("action", FORMSPREE_ENDPOINT);
    form.addEventListener("submit", function (e) {
      var honeypot = form.querySelector('input[name="_gotcha"]');
      if (honeypot && honeypot.value) {
        e.preventDefault();
        return;
      }

      e.preventDefault();
      var status = form.querySelector(".gwc-status");
      var button = form.querySelector(".gwc-submit");

      button.disabled = true;
      status.textContent = "Wird gesendet...";
      status.className = "gwc-status";

      fetch(FORMSPREE_ENDPOINT, {
        method: "POST",
        body: new FormData(form),
        headers: { Accept: "application/json" },
      })
        .then(function (response) {
          if (response.ok) {
            status.textContent = "";
            form.reset();
            showThanks(form);
          } else {
            return response.json().then(function (data) {
              var msg =
                (data && data.errors && data.errors.map(function (e) { return e.message; }).join(", ")) ||
                "Fehler beim Senden.";
              throw new Error(msg);
            });
          }
        })
        .catch(function () {
          status.textContent =
            "Die Nachricht konnte nicht gesendet werden. Bitte versuchen Sie es erneut oder schreiben Sie direkt an neumeyer.jan@web.de";
          status.classList.add("is-error");
        })
        .finally(function () {
          button.disabled = false;
        });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var forms = document.querySelectorAll(".gwc-form");
    forms.forEach(handleSubmit);
  });
})();
