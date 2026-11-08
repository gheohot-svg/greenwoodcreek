/* GREENWOODCREEK – Apple-Design-Ebene: Navigation beim Scrollen + sanftes Einblenden */
(function () {
  var root = document.documentElement;
  var onScroll = function () { root.classList.toggle("a-scrolled", window.scrollY > 8); };
  window.addEventListener("scroll", onScroll, { passive: true }); onScroll();
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
  var els = document.querySelectorAll(".gwc-svc-section, .gwc-svc-grid li, .gwc-svc-steps li, .gwc-gallery-item, .gwc-pf-item, .gwc-card");
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      var el = e.target, sib = el.parentElement ? [].indexOf.call(el.parentElement.children, el) : 0;
      el.style.transitionDelay = Math.min(sib, 5) * 60 + "ms";   // Kacheln nacheinander, max. 300 ms
      el.classList.add("a-in"); io.unobserve(el);
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
  els.forEach(function (el) {
    if (el.getBoundingClientRect().top < window.innerHeight) return;   // was schon sichtbar ist, bleibt sofort da
    el.classList.add("a-reveal"); io.observe(el);
  });
})();
