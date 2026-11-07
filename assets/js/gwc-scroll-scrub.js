/* Scroll-scrubbed video: the section is taller than the viewport and its
   inner frame is sticky, so the video stays in place while the visitor
   scrolls through the section. Scroll position maps straight onto
   currentTime, so the clip plays as fast (or as slowly, or backwards) as
   the visitor scrolls. Markup: section[data-gwc-scrub] > … > video.
   The video must be encoded with a keyframe on every frame (-g 1), or
   seeking backwards stutters. */
(function () {
  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  ready(function () {
    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    Array.prototype.forEach.call(document.querySelectorAll("[data-gwc-scrub]"), function (section) {
      var video = section.querySelector("video");
      if (!video) return;

      video.pause();
      video.loop = false;

      // Reduced motion: no scroll-jacking feel, just the still poster with a
      // normal-height section (see CSS) and native controls to play it.
      if (reduceMotion) {
        section.classList.add("is-static");
        video.controls = true;
        return;
      }

      // Only metadata at first so the 4–5 MB file doesn't compete with the
      // gallery images; buffer fully once the page has loaded.
      var buffer = function () { video.preload = "auto"; };
      if (document.readyState === "complete") buffer();
      else window.addEventListener("load", buffer, { once: true });

      var lastTime = -1;
      var ticking = false;
      var sticky = section.firstElementChild;
      var PHONE = window.matchMedia("(max-width: 767px)");
      var stickyTop = 0;

      // Desktop: full-screen sticky frame, section height from CSS.
      // Phones: the frame is only as tall as the clip (CSS), so centre it on
      // screen and give the section just enough height for the scroll travel.
      function layout() {
        if (PHONE.matches) {
          var h = sticky.offsetHeight;
          stickyTop = Math.max(0, Math.round((window.innerHeight - h) / 2));
          sticky.style.top = stickyTop + "px";
          section.style.height = Math.round(h + window.innerHeight * 0.9) + "px";
        } else {
          stickyTop = 0;
          sticky.style.top = "";
          section.style.height = "";
        }
      }

      function update() {
        ticking = false;
        if (!video.duration) return;
        // progress runs while the frame is stuck: from the moment it reaches
        // its sticky position until the section scrolls it away
        var rect = section.getBoundingClientRect();
        var travel = section.offsetHeight - sticky.offsetHeight;
        var progress = travel > 0 ? (stickyTop - rect.top) / travel : 0;
        progress = Math.max(0, Math.min(1, progress));
        var time = progress * Math.max(0, video.duration - 0.04);
        if (Math.abs(time - lastTime) > 0.02) {
          video.currentTime = time;
          lastTime = time;
        }
      }

      function requestUpdate() {
        if (!ticking) {
          ticking = true;
          requestAnimationFrame(update);
        }
      }

      video.addEventListener("loadedmetadata", update);
      video.addEventListener("loadeddata", update);
      window.addEventListener("scroll", requestUpdate, { passive: true });
      window.addEventListener("resize", function () { layout(); requestUpdate(); });
      layout();
      update();
      if (window.ScrollTrigger) ScrollTrigger.refresh();

      // iOS Safari doesn't buffer a video that has never played, so seeking
      // shows nothing. Play muted for a moment and pause straight away; if the
      // browser refuses (e.g. Low Power Mode), retry on the first touch/scroll.
      var primed = false;
      function prime() {
        if (primed) return;
        primed = true;
        var done = function () {
          video.pause();
          lastTime = -1;
          update();
        };
        var p = video.play();
        if (p && p.then) p.then(done).catch(function () { primed = false; });
        else done();
      }
      prime();
      ["touchstart", "touchend", "scroll"].forEach(function (name) {
        window.addEventListener(name, prime, { passive: true });
      });
    });
  });
})();
