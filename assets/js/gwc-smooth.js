/* Lenis smooth scroll for every page.

   - Wheel scrolling glides with inertia instead of jumping in steps.
   - Lenis drives GSAP's ticker, so ScrollTrigger animations (reveals, the
     pinned Aktuelles section) update in the same frame as the scroll.
   - Pages can claim scroll input for a section through window.gwcScrollGate
     (the homepage scene uses it to play chapter by chapter): it receives
     Lenis' virtual-scroll data and returns false to swallow the input.
   - Reduced motion: no Lenis at all, plain native scrolling. */
(function () {
  if (!window.Lenis) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var lenis = new Lenis({
    lerp: 0.1,
    smoothWheel: true,
    wheelMultiplier: 1.35,
    touchMultiplier: 1.2,
    autoRaf: false,
    virtualScroll: function (data) {
      return window.gwcScrollGate ? window.gwcScrollGate(data) !== false : true;
    },
    // let open overlays (lightbox, mobile menu) scroll on their own
    prevent: function (node) {
      return node.classList && (node.classList.contains("gwc-lightbox") || node.hasAttribute("data-lenis-prevent"));
    }
  });
  window.gwcLenis = lenis;

  // Lenis' lerp only finishes when round(value) === round(target). A wheel
  // target that lands on ~x.5 px is approached from below forever (x.4999…),
  // so the scroll never "ends" (isScrolling stays true). Keep user-wheel
  // targets off the half pixel; programmatic moves are unaffected.
  var scrollTo = lenis.scrollTo.bind(lenis);
  lenis.scrollTo = function (target, opts) {
    if (typeof target === "number" && opts && opts.programmatic === false) {
      var frac = target - Math.floor(target);
      if (frac > 0.45 && frac < 0.55) target = Math.round(target);
    }
    return scrollTo(target, opts);
  };

  if (window.gsap && window.ScrollTrigger) {
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
    gsap.ticker.lagSmoothing(0);
  } else {
    var raf = function (time) { lenis.raf(time); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
  }

  // Lightbox open → page behind it must not move
  var root = document.documentElement;
  new MutationObserver(function () {
    if (root.classList.contains("gwc-lightbox-lock")) lenis.stop();
    else lenis.start();
  }).observe(root, { attributes: true, attributeFilter: ["class"] });

  // In-page links (#kontakt, skip link): glide there, then move focus
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a || a.getAttribute("href").length < 2) return;
    var target = document.getElementById(a.getAttribute("href").slice(1));
    if (!target) return;
    e.preventDefault();
    var box = target.getBoundingClientRect();
    var to = box.height === 0 && box.top === 0 && getComputedStyle(target).display === "contents"
      ? target.firstElementChild || target : target;
    lenis.scrollTo(to, { offset: -96, duration: 1.2 });
    if (target.tabIndex < 0 && !target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
  });
})();
