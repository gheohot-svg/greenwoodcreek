(function () {
  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  ready(function () {
    var items = Array.prototype.slice.call(document.querySelectorAll(".accordion-item"));
    if (!items.length) return;

    items.forEach(function (item) {
      var question = item.querySelector(".question-3");
      if (!question) return;
      question.setAttribute("role", "button");
      question.setAttribute("tabindex", "0");
      question.setAttribute("aria-expanded", "false");

      function toggle() {
        var willOpen = !item.classList.contains("is-open");
        items.forEach(function (other) {
          other.classList.remove("is-open");
          var q = other.querySelector(".question-3");
          if (q) q.setAttribute("aria-expanded", "false");
        });
        if (willOpen) {
          item.classList.add("is-open");
          question.setAttribute("aria-expanded", "true");
        }
      }

      question.addEventListener("click", toggle);
      question.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      });
    });
  });
})();
