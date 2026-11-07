(function () {
  var FORMSPREE_ENDPOINT = "https://formspree.io/f/mrenayyq";

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
            status.textContent = "Vielen Dank, Ihre Nachricht ist bei uns angekommen. Wir melden uns in Kürze.";
            status.classList.add("is-success");
            form.reset();
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
