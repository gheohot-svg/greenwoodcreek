/* Alternative Startseite — the sections after the opening scene.

   The page scrolls freely after the contact form, so both sections play
   their entrance once, in full, when they come into view.

   1) Aktuelles: the three latest posts fly in from the left, from below
      and from the right (wide screens: together; phones, cards stacked:
      each card on its own as it comes into view).

   2) Abschlussbild (Siegestor): one slow zoom from the inside out
      (100 → 145 %). Pre-rendered light-trail layers sit on top
      in `screen` blend mode: when the picture comes into view, light pulses
      run along the trails once and the glow swells once (CSS); after that
      only two ghost copies react to scrolling — they smear sideways and
      fade back when it stops (afterglow). Only transform/opacity are
      animated. */
(function () {
  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  ready(function () {
    if (!window.gsap || !window.ScrollTrigger) return;
    gsap.registerPlugin(ScrollTrigger);
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // ---- 1) Aktuelles -------------------------------------------------------
    var news = document.querySelector(".gwc-news");
    if (news && !reduce) {
      var head = news.querySelector(".gwc-news-head");
      var cards = Array.prototype.slice.call(news.querySelectorAll(".gwc-news-card"));
      var mm = gsap.matchMedia();

      mm.add("(min-width: 900px)", function () {
        gsap.set(cards, { transformPerspective: 1200 });
        // plays once, in full, when the section comes into view (the page
        // scrolls freely here, so nothing is tied to the scroll position)
        var tl = gsap.timeline({
          paused: true,
          scrollTrigger: { trigger: news, start: "top 65%", once: true, onEnter: function () { tl.play(); } },
        });
        tl.from(head, { y: 70, opacity: 0, filter: "blur(10px)", duration: 0.8, ease: "power3.out" }, 0);
        var from = [
          { x: "-70vw", y: "8vh", rotate: -18, scale: 0.72 },
          { y: "95vh", rotateX: 50, scale: 0.6 },
          { x: "70vw", y: "8vh", rotate: 18, scale: 0.72 },
        ];
        cards.forEach(function (card, i) {
          if (!from[i]) return;
          tl.from(card, Object.assign({
            opacity: 0,
            filter: "blur(16px)",
            duration: 1.5,
            ease: "expo.out",
          }, from[i]), 0.25 + i * 0.28);
        });
      });

      mm.add("(max-width: 899px)", function () {
        var from = [{ x: "-60vw", rotate: -10 }, { y: "40vh", scale: 0.8 }, { x: "60vw", rotate: 10 }];
        cards.forEach(function (card, i) {
          var tw = gsap.from(card, Object.assign({
            opacity: 0,
            filter: "blur(10px)",
            duration: 1.2,
            ease: "power3.out",
            paused: true,
          }, from[i % 3]));
          ScrollTrigger.create({ trigger: card, start: "top 88%", once: true, onEnter: function () { tw.play(); } });
        });
      });
    }

    // ---- 2) Abschlussbild ---------------------------------------------------
    var finale = document.querySelector(".alt-finale");
    if (!finale) return;
    var zoom = finale.querySelector(".alt-finale-zoom");
    var ghosts = Array.prototype.slice.call(finale.querySelectorAll(".alt-trail--ghost"));

    if (!reduce) {
      // one slow push out of the picture, played once when it is in view
      var zt = gsap.fromTo(zoom, { scale: 1 }, { scale: 1.45, duration: 7, ease: "sine.inOut", paused: true });
      ScrollTrigger.create({ trigger: finale, start: "top 70%", once: true, onEnter: function () { zt.play(); } });
    }

    // Light pulses + glow swell play ONCE when the picture is well in view,
    // then the pulse layers are removed (CSS .is-done). `inView` also gates
    // the scroll afterglow below.
    var inView = false;
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
      }, { rootMargin: "100px 0px" }).observe(finale);
      var playOnce = new IntersectionObserver(function (entries) {
        if (!entries[0].isIntersecting) return;
        playOnce.disconnect();
        finale.classList.add("is-played");
        var red = finale.querySelector(".alt-flow--red");
        var finish = function () { finale.classList.add("is-done"); };
        if (red && !reduce) red.addEventListener("animationend", finish, { once: true });
        setTimeout(finish, 4000); // safety net if animationend never fires
      }, { threshold: 0.45 });
      playOnce.observe(finale);
    } else {
      inView = true;
    }

    if (reduce) return;

    // Afterglow while scrolling: two pre-rendered ghost copies of the trails
    // smear sideways with scroll speed and fade back when scrolling stops.
    // Only transform + opacity change (composited); the loop runs only
    // while there is something to animate.
    var lastY = window.scrollY, lastT = performance.now();
    var vel = 0, energy = 0, raf = 0;
    var GHOST_OPACITY = [1, 0.65];

    function frame(now) {
      var dt = Math.max(1, now - lastT);
      var y = window.scrollY;
      var v = (y - lastY) / dt * 1000; // px per second
      lastY = y; lastT = now;
      vel += (v - vel) * 0.25;
      var e = Math.min(1, Math.abs(vel) / 600);
      energy = e > energy ? energy + (e - energy) * 0.45 : energy * 0.95;

      var dir = vel >= 0 ? -1 : 1; // trails stretch against the scroll
      ghosts.forEach(function (g, i) {
        var off = dir * energy * (i + 1) * 7; // % of the frame width
        g.style.transform = "translate3d(" + off.toFixed(2) + "%,0,0) scaleX(" + (1 + energy * 0.08 * (i + 1)).toFixed(3) + ")";
        g.style.opacity = (energy * GHOST_OPACITY[i]).toFixed(3);
      });

      if (energy > 0.005 || Math.abs(vel) > 5) {
        raf = requestAnimationFrame(frame);
      } else {
        energy = 0;
        ghosts.forEach(function (g) { g.style.opacity = "0"; });
        raf = 0;
      }
    }

    window.addEventListener("scroll", function () {
      if (raf || !inView) return;
      lastY = window.scrollY; lastT = performance.now();
      raf = requestAnimationFrame(frame);
    }, { passive: true });
  });
})();
