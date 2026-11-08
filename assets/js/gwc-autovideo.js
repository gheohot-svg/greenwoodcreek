/* GREENWOODCREEK – selbst gehostete Videos: stummes Autoplay, sobald sichtbar, mit Knopf zum Zuschalten des Tons. */
(function () {
  function ready(fn) { if (document.readyState !== "loading") fn(); else document.addEventListener("DOMContentLoaded", fn); }
  var small = window.matchMedia("(max-width: 767px)").matches;
  ready(function () {
    document.querySelectorAll(".gwc-autovideo").forEach(function (box) {
      var v = box.querySelector("video"), btn = box.querySelector(".gwc-video-sound");
      if (!v) return;
      var src = small && v.getAttribute("data-src-mobile") ? v.getAttribute("data-src-mobile") : v.getAttribute("data-src");
      if (src) v.src = src;
      v.muted = true;
      if (btn) btn.addEventListener("click", function () {
        v.muted = !v.muted;
        if (!v.muted && v.paused) v.play().catch(function () {});
        btn.textContent = v.muted ? "Ton an" : "Ton aus";
        btn.setAttribute("aria-pressed", String(!v.muted));
      });
      function play() { v.preload = "auto"; var p = v.play(); if (p && p.catch) p.catch(function () {}); }
      if (!("IntersectionObserver" in window)) { play(); return; }
      new IntersectionObserver(function (e) { if (e[0].isIntersecting) play(); else v.pause(); }, { rootMargin: "100px 0px", threshold: .25 }).observe(box);
    });
  });
})();
