/* Alternative Startseite — scroll-driven opening scene.

   Two progress values drive everything:

   p (0..1) — scrolling through .alt-track (the stage is sticky meanwhile)
     0.00–0.26  Isar clip plays under the headline (standing in the water;
                visible from load, with a short CSS sharpen-in)
     0.31–0.50  camera pushes into the beach, headline flies past
     0.40–0.56  beach clip dissolves in full-bleed, as if the camera had
                arrived on the beach
     0.55–0.615 intro "Handwerk mit Haltung"
     0.615      step 01 (beach clip 1)
     0.675–0.715 hand-over to beach clip 2 → step 02
     0.755–0.795 hand-over to the flight clip → steps 03–04 (flight clip
                plays to its last frame)
     0.95–0.975 copy fades; the last frame stays as a still

   q (0..1) — scrolling through .alt-contact, which slides up over the
     stage: the still zooms out (shrinks into the dark) behind the form.

   All clips are encoded with a keyframe every 6 frames and no B-frames
   (near-lossless, see the commit messages for PSNR) so seeking in either
   direction stays smooth. Each <video> carries data-src / data-src-mobile /
   data-poster; the matching encode is picked when the clip is needed. */
(function () {
  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  // ---- helpers ------------------------------------------------------------
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  // 0..1 progress of p within [a, b]
  function seg(p, a, b) { return clamp((p - a) / (b - a), 0, 1); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function easeInCubic(t) { return t * t * t; }
  function easeInOutSine(t) { return -(Math.cos(Math.PI * t) - 1) / 2; }
  function easeOutExpo(t) { return t === 1 ? 1 : 1 - Math.pow(2, -10 * t); }

  // Beach position in the last frame of the Isar clip (fraction of 1280x720).
  var BEACH_X = 0.5;
  var BEACH_Y = 0.615;
  // Phones show a narrow, right-hand slice of the clip (object-position in
  // alt-scene.css) so St. Lukas is fully in view; the camera then pushes
  // into the beach in front of the weir below the church.
  var ISAR_POS_X_PHONE = 0.86;
  var BEACH_X_PHONE = 0.70;
  var ISAR_W = 1280, ISAR_H = 720;
  // How see-through the clips stay behind the copy.
  var CLIP_OPACITY = 0.78;
  // Beach clip 1 is only used up to the close-up of the camera (fraction of
  // its duration); beach clip 2 takes over from there.
  var STRAND_USE = 0.40;
  var PHONE = window.matchMedia("(max-width: 899px)");
  // The flight clip starts 2 s in (skips the camera close-up).
  var FLUG_FROM = 2;

  var T = {
    isarEnd: 0.26,
    zoomStart: 0.31, zoomEnd: 0.50,
    dissolve: [0.40, 0.56],
    strand: [0.50, 0.70],
    handover: [0.675, 0.715],
    strand2: [0.69, 0.785],
    handover2: [0.755, 0.795],
    flug: [0.775, 0.95],
    introIn: [0.55, 0.585], introOut: [0.60, 0.615],
    steps: [0.615, 0.70, 0.78, 0.86], stepEnd: [0.685, 0.775, 0.855],
    end: [0.95, 0.975]
  };

  ready(function () {
    var scene = document.querySelector("[data-gwc-scene]");
    if (!scene) return;

    var stage = scene.querySelector(".alt-stage");
    var track = scene.querySelector(".alt-track");
    var contact = scene.querySelector(".alt-contact");
    var isar = scene.querySelector(".alt-isar");
    var isarVideo = isar.querySelector("video");
    var hero = scene.querySelector(".alt-hero");
    var hint = scene.querySelector(".alt-hint");
    var strand = scene.querySelector(".alt-strand");
    var strandVideo = strand.querySelector("video");
    var strand2 = scene.querySelector(".alt-strand2");
    var strand2Video = strand2.querySelector("video");
    var flug = scene.querySelector(".alt-flug");
    var flugVideo = flug.querySelector("video");
    var intro = scene.querySelector(".alt-intro");
    var steps = Array.prototype.slice.call(scene.querySelectorAll(".alt-step"));
    var rail = scene.querySelector(".alt-rail");
    var railBars = Array.prototype.slice.call(rail.querySelectorAll("span"));
    var videos = [isarVideo, strandVideo, strand2Video, flugVideo];

    // Every clip comes in two encodes of the same source: a near-lossless one
    // for larger screens and a lighter (still visually lossless) one for
    // phones. "#t=0.001" makes iOS paint the first frame.
    function pickSource(video) {
      if (video.getAttribute("src")) return;
      var src = PHONE.matches ? video.getAttribute("data-src-mobile") : video.getAttribute("data-src");
      var poster = video.getAttribute("data-poster");
      if (poster) video.poster = poster;
      if (src) video.src = src + "#t=0.001";
    }
    pickSource(isarVideo);

    videos.forEach(function (v) { v.pause(); v.loop = false; });

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      scene.classList.add("is-static");
      pickSource(strandVideo); // shown as a plain clip in the static layout
      return;
    }

    // Loading: the Isar clip buffers once the page has loaded; the beach and
    // flight clips only once the visitor is on the way to them (see
    // wakeLater in render), so a quick visit doesn't pull ~6 MB extra.
    // The Isar clip (10–15 MB, near-lossless) starts buffering once the
    // browser is idle after load, or on the first scroll/touch — whichever
    // comes first — so it doesn't compete with the first paint and the
    // first interactions. Until then the poster shows the same frame.
    var isarBuffering = false;
    function bufferIsar() {
      if (isarBuffering) return;
      isarBuffering = true;
      isarVideo.preload = "auto";
    }
    function bufferWhenIdle() {
      if ("requestIdleCallback" in window) requestIdleCallback(bufferIsar, { timeout: 2500 });
      else setTimeout(bufferIsar, 1200);
    }
    if (document.readyState === "complete") bufferWhenIdle();
    else window.addEventListener("load", bufferWhenIdle, { once: true });
    ["scroll", "touchstart", "pointerdown", "keydown"].forEach(function (name) {
      window.addEventListener(name, bufferIsar, { once: true, passive: true });
    });
    var woken = [true, false, false, false];
    var primers = null; // set up further down
    var WAKE_AT = [0, 0.12, 0.40, 0.55];
    // first progress at which each clip is actually visible
    var NEED_AT = [0, 0.40, 0.675, 0.755];
    // Attaching a source mid-animation costs a network request plus decoder
    // set-up on the main thread (visible as a hitch), so while a chapter is
    // moving the camera, waking waits for the next pause.
    var chapterMoving = false;
    function wake(i) {
      if (woken[i]) return;
      woken[i] = true;
      pickSource(videos[i]);
      videos[i].preload = "auto";
      if (primers) primers[i]();
    }
    function wakeLater(p) {
      if (chapterMoving) return;
      for (var i = 1; i < videos.length; i++) {
        if (!woken[i] && p >= WAKE_AT[i]) wake(i);
      }
    }

    // ---- layout (recomputed on resize) ------------------------------------
    var L = {};
    function measure() {
      var w = stage.clientWidth, h = stage.clientHeight;
      L.w = w; L.h = h;
      L.mobile = w < 900;
      // Isar clip is object-fit: cover → where does the beach land on screen?
      var s = Math.max(w / ISAR_W, h / ISAR_H);
      var vw = ISAR_W * s, vh = ISAR_H * s;
      var posX = L.mobile ? ISAR_POS_X_PHONE : 0.5;
      L.bx = (w - vw) * posX + (L.mobile ? BEACH_X_PHONE : BEACH_X) * vw;
      L.by = (h - vh) / 2 + BEACH_Y * vh;
      isarVideo.style.transformOrigin = L.bx + "px " + L.by + "px";
      strandVideo.style.transformOrigin = L.bx + "px " + L.by + "px";
      // Headline stands in the water: just below the beach line, but never
      // running off the bottom of the screen.
      var heroH = hero.offsetHeight;
      var top = L.by + h * (L.mobile ? 0.05 : 0.04);
      hero.style.top = Math.round(Math.min(top, h - heroH - 28)) + "px";
    }

    // ---- render ------------------------------------------------------------
    var last = [-1, -1, -1, -1];
    // t (0..1) maps onto [from, end] of the clip, `from` in seconds
    // Clip position for progress p, as a fraction of the used range, and the
    // second each range starts at. Shared by render() (seeking) and the
    // chapter moves (real playback), so both always agree.
    var FROM = [0, 0, 0, FLUG_FROM];
    function clipFrac(i, p) {
      if (i === 0) return lerp(isarFrom, 1, seg(p, 0, T.isarEnd));
      if (i === 1) return seg(p, T.strand[0], T.strand[1]) * STRAND_USE;
      if (i === 2) return seg(p, T.strand2[0], T.strand2[1]);
      return seg(p, T.flug[0], T.flug[1]);
    }
    function clipTime(i, p) {
      var v = videos[i];
      if (!v.duration) return null;
      return FROM[i] + clamp(clipFrac(i, p), 0, 1) * Math.max(0, v.duration - FROM[i] - 0.04);
    }
    // clips that are currently playing for real during a chapter move
    var driven = [false, false, false, false];
    // When a clip stops playing for real (end of a move, turning back), its
    // time is a little off the position-mapped one. At rest that offset is
    // simply kept (the picture is paused anyway, and seeking frame by frame
    // after every move made phones hitch just as the copy lands); it fades
    // out over OFF_MS during the next move that seeks instead of playing.
    var seekOff = [0, 0, 0, 0], seekOffAt = [0, 0, 0, 0], OFF_MS = 700;
    function fadeOffsets() {
      var now = performance.now();
      for (var k = 0; k < 4; k++) if (seekOff[k] && seekOffAt[k] === Infinity) seekOffAt[k] = now;
    }
    function offsetOf(i) {
      if (!seekOff[i]) return 0;
      if (seekOffAt[i] === Infinity) return seekOff[i];
      var a = (performance.now() - seekOffAt[i]) / OFF_MS;
      if (a >= 1) { seekOff[i] = 0; return 0; }
      return seekOff[i] * (1 - a) * (1 - a);
    }
    function releaseClip(k) {
      var v = videos[k];
      driven[k] = false;
      v.pause();
      v.playbackRate = 1;
      var mapped = clipTime(k, current.p);
      var off = mapped === null ? 0 : v.currentTime - mapped;
      if (Math.abs(off) > 0.03) {
        seekOff[k] = off;
        // turning back mid-move: fade right away (the move keeps rendering);
        // at the end of a move: hold until the next one
        seekOffAt[k] = playing ? performance.now() : Infinity;
      }
      last[k] = -1;
    }
    function seek(i, p) {
      var video = videos[i];
      if (driven[i] || !video.duration) return;
      var time = clamp(clipTime(i, p) + offsetOf(i), 0, video.duration - 0.04);
      if (Math.abs(time - last[i]) > 1 / 60) {
        // never pile a new seek onto one that is still loading: every
        // superseded seek into not-yet-downloaded data aborts and restarts a
        // range request, which is what stalls the picture on slow networks.
        // The next frame retries with the latest position.
        if (video.seeking) return;
        video.currentTime = time;
        last[i] = time;
      }
    }

    // Isar clip: plays by itself at the top (isarAuto); when the visitor moves
    // on, the rest of it (isarFrom → end) runs within the first chapter.
    var isarAuto = false, isarFrom = 0;

    // Style writes only when a value really changes: most properties sit
    // still during a chapter, and every write invalidates style for the
    // element (costly per frame on phones).
    function set(el, prop, v) {
      v = "" + v;
      var c = el.__gwc || (el.__gwc = {});
      if (c[prop] === v) return;
      c[prop] = v;
      if (prop.charCodeAt(0) === 45) el.style.setProperty(prop, v);
      else el.style[prop] = v;
    }
    var stepNum = steps.map(function (el) { return el.querySelector(".alt-step-num"); });
    var stepH3 = steps.map(function (el) { return el.querySelector("h3"); });
    var stepP = steps.map(function (el) { return el.querySelector("p"); });
    // Blurring text is a full re-raster every frame; phones get opacity and
    // movement only (the clips keep their blur).
    var TEXT_BLUR = !window.matchMedia("(max-width: 899px)").matches;

    function render(p, q) {
      wakeLater(p);
      // 1) Isar clip playback
      if (!isarAuto) seek(0, p);

      // 2) Hero copy is visible from the first paint (good for search
      //    engines, which don't scroll); CSS gives it a short sharpen-in on
      //    load. Scrolling only fades the scroll hint here.
      set(hint, "opacity", 1 - seg(p, 0.004, 0.02));

      // 3) Hero copy out: sinks back into the water as the camera pushes in
      var out = easeInCubic(seg(p, T.zoomStart, T.zoomStart + 0.07));
      // at rest no inline transform/filter/opacity at all, so the text is
      // painted directly (crisp) instead of as a separate GPU layer
      if (out > 0) {
        set(hero, "opacity", 1 - out);
        set(hero, "transform", "translateY(" + lerp(0, L.h * 0.08, out) + "px) scale(" + lerp(1, 1.5, out) + ")");
        set(hero, "filter", TEXT_BLUR ? "blur(" + lerp(0, 12, out).toFixed(2) + "px)" : "");
      } else {
        set(hero, "opacity", "");
        set(hero, "transform", "");
        set(hero, "filter", "");
      }

      // 4) Camera push into the beach
      var z = easeInOutSine(seg(p, T.zoomStart, T.zoomEnd));
      set(isarVideo, "transform", "scale(" + lerp(1, 6, z) + ")");
      var blur = easeInCubic(seg(p, T.zoomStart + 0.05, T.zoomEnd)) * 14;
      set(isarVideo, "filter", blur > 0.05 ? "blur(" + blur.toFixed(2) + "px)" : "");
      set(isar, "opacity", 1 - easeInOutSine(seg(p, T.dissolve[0] + 0.04, T.dissolve[1] - 0.02)));

      // 5) Beach clip: dissolves in full-bleed out of the blur, settling
      //    from a push-in; later hands over to the flight clip.
      var d = easeInOutSine(seg(p, T.dissolve[0], T.dissolve[1]));
      var h = easeInOutSine(seg(p, T.handover[0], T.handover[1]));
      // the outgoing clip fades late and the incoming one early, so the
      // hand-over never dips into black
      set(strand, "opacity", (d * (1 - h * h) * CLIP_OPACITY).toFixed(3));
      var settle = easeOutCubic(seg(p, T.dissolve[0], T.dissolve[1] + 0.04));
      set(strandVideo, "transform", "scale(" + (lerp(1.6, 1, settle) + h * 0.12) + ")");
      var sb = lerp(16, 0, easeOutCubic(seg(p, T.dissolve[0], T.dissolve[1]))) + h * 10;
      set(strandVideo, "filter", sb > 0.05 ? "blur(" + sb.toFixed(2) + "px)" : "");
      seek(1, p);

      // 6) Beach clip 2 (step 02): same soft hand-over in and out.
      var h2 = easeInOutSine(seg(p, T.handover2[0], T.handover2[1]));
      var hin = 1 - (1 - h) * (1 - h);
      set(strand2, "opacity", (hin * (1 - h2 * h2) * CLIP_OPACITY).toFixed(3));
      set(strand2Video, "transform", "scale(" + (lerp(1.12, 1, easeOutCubic(h)) + h2 * 0.12) + ")");
      var s2b = (1 - h) * 12 + h2 * 10;
      set(strand2Video, "filter", s2b > 0.05 ? "blur(" + s2b.toFixed(2) + "px)" : "");
      seek(2, p);

      // 7) Flight clip: comes in out of a soft blur, plays steps 03–04 from
      //    second 2, its last frame becomes the still that zooms out behind
      //    the contact.
      var zoomOut = easeInOutSine(q);
      var hin2 = 1 - (1 - h2) * (1 - h2);
      set(flug, "opacity", (hin2 * lerp(CLIP_OPACITY, 0.55, zoomOut)).toFixed(3));
      var fb = (1 - h2) * 12;
      set(flugVideo, "filter", fb > 0.05 ? "blur(" + fb.toFixed(2) + "px)" : "");
      // ...and runs out on a slow zoom-out while it plays (1.3 → 1)
      var flugOut = lerp(1.3, 1, easeInOutSine(seg(p, T.flug[0], T.end[1])));
      set(flugVideo, "transform", "scale(" + (lerp(1.12, 1, easeOutCubic(h2)) * flugOut).toFixed(4) + ")");
      set(flug, "transform", "scale(" + lerp(1, 0.58, zoomOut) + ")");
      set(flug, "borderRadius", lerp(0, 18 / 0.58, zoomOut).toFixed(1) + "px");
      set(flug, "overflow", zoomOut > 0 ? "hidden" : "");
      // copy shade off while the still sits behind the contact panel
      set(flug, "--shade", (1 - seg(p, T.end[0], 1)).toFixed(3));
      seek(3, p);

      // 8) Intro + process steps
      var ii = easeOutCubic(seg(p, T.introIn[0], T.introIn[1]));
      var io = easeInCubic(seg(p, T.introOut[0], T.introOut[1]));
      set(intro, "opacity", ii * (1 - io));
      set(intro, "transform", (L.mobile ? "" : "translateY(-50%) ") + "translateY(" + (lerp(30, 0, ii) - io * 40) + "px)");
      set(intro, "filter", TEXT_BLUR && (ii < 1 || io > 0) ? "blur(" + ((1 - ii) * 8 + io * 8).toFixed(2) + "px)" : "");

      steps.forEach(function (el, i) {
        var a = T.steps[i];
        var b = i < steps.length - 1 ? T.stepEnd[i] : T.end[1];
        var isLast = i === steps.length - 1;
        var tin = easeOutCubic(seg(p, a, a + 0.022));
        var tout = isLast ? easeInCubic(seg(p, T.end[0], T.end[1])) : easeInCubic(seg(p, b - 0.016, b));
        var vis = tin * (1 - tout);
        set(el, "opacity", vis);
        // invisible steps stay readable for screen readers (no visibility:
        // hidden), they just don't catch the pointer
        set(el, "pointerEvents", vis > 0.5 ? "" : "none");
        set(el, "transform", (L.mobile ? "" : "translateY(-50%) ") + "translateY(" + (lerp(26, 0, tin) - tout * 36) + "px)");
        set(stepNum[i], "transform", "translateX(" + lerp(-40, 0, easeOutExpo(seg(p, a, a + 0.03))) + "px)");
        var reveal = easeOutExpo(seg(p, a + 0.004, a + 0.03));
        set(stepH3[i], "clipPath", "inset(0 0 " + lerp(100, 0, reveal) + "% 0)");
        var body = stepP[i];
        var bt = easeOutCubic(seg(p, a + 0.012, a + 0.035));
        set(body, "opacity", bt);
        set(body, "filter", TEXT_BLUR && bt < 1 ? "blur(" + ((1 - bt) * 6).toFixed(2) + "px)" : "");
        set(railBars[i], "--fill", seg(p, a, isLast ? T.end[0] : b).toFixed(3));
      });
      set(rail, "opacity", seg(p, T.steps[0] - 0.01, T.steps[0] + 0.01) * (1 - seg(p, T.end[0], T.end[1])));
    }

    // ---- scroll → progress → render ----------------------------------------
    var lenis = window.gwcLenis;
    var target = { p: 0, q: 0 }, current = { p: 0, q: 0 }, running = false;
    // Scene geometry is cached (refreshed on resize/refresh) so reading the
    // scroll position during a move never forces a layout.
    var geo = null;
    function measureScroll() {
      geo = { top: scene.getBoundingClientRect().top + window.scrollY,
              track: track.offsetHeight, contact: contact.offsetHeight };
    }
    function readScroll() {
      if (!geo || !lenis) measureScroll();
      var scrolled = (lenis ? lenis.scroll : window.scrollY) - geo.top;
      var trackH = geo.track;
      target.p = trackH > 0 ? clamp(scrolled / trackH, 0, 1) : 0;
      target.q = clamp((scrolled - trackH) / Math.max(1, geo.contact), 0, 1);
    }
    // Without Lenis (reduced motion is handled above, so only if the library
    // failed to load) keep the old smoothed scrub as a fallback.
    function tick() {
      current.p += (target.p - current.p) * 0.14;
      current.q += (target.q - current.q) * 0.14;
      if (Math.abs(target.p - current.p) < 0.0002) current.p = target.p;
      if (Math.abs(target.q - current.q) < 0.0002) current.q = target.q;
      render(current.p, current.q);
      if (current.p !== target.p || current.q !== target.q) requestAnimationFrame(tick);
      else running = false;
    }
    function kick() {
      readScroll();
      if (lenis) {
        // Lenis already eases the scroll position: render it 1:1
        current.p = target.p; current.q = target.q;
        render(current.p, current.q);
        return;
      }
      if (!running) { running = true; requestAnimationFrame(tick); }
    }

    measure();
    readScroll();
    current.p = target.p; current.q = target.q;
    render(current.p, current.q);

    if (lenis) lenis.on("scroll", kick);
    else window.addEventListener("scroll", kick, { passive: true });
    window.addEventListener("resize", function () { measure(); measureScroll(); kick(); render(current.p, current.q); });
    if (window.ScrollTrigger) ScrollTrigger.addEventListener("refresh", function () { measureScroll(); kick(); });

    if (lenis) {
    // ---- chapters ------------------------------------------------------------
    // One scroll gesture plays one whole chapter as a timed, eased camera
    // move (video plays through, copy comes in) instead of nudging the
    // timeline a few frames per wheel tick. This covers the scene up to the
    // contact form; below it the page scrolls freely.
    //
    // stop = progress p where a chapter comes to rest, dur = seconds to get
    // there from the previous stop (same duration on the way back).
    // Faster pacing (2026-11-07): all chapter moves run at DUR_SCALE of the
    // original timing (total ~5.4 s instead of ~12 s for the whole scene).
    var DUR_SCALE = 0.45;
    var SCENE = [
      { p: 0 },                                // headline in the water, Isar clip plays
      { p: 0.59, dur: 2.8 * DUR_SCALE },       // push into the beach → "Handwerk mit Haltung"
      { p: 0.65, dur: 1.5 * DUR_SCALE },       // 01 Planung
      { p: 0.735, dur: 1.9 * DUR_SCALE },      // 02 Vorbereitung (hand-over to beach clip 2)
      { p: 0.82, dur: 1.9 * DUR_SCALE },       // 03 Dreh (hand-over to the flight clip)
      { p: 0.92, dur: 1.7 * DUR_SCALE },       // 04 Fertigstellung
      { contact: true, dur: 2.2 * DUR_SCALE }  // still zooms out, contact form slides up
    ];
    var CONTACT = SCENE.length - 1;
    var news = document.querySelector(".gwc-news");
    var finale = document.querySelector(".alt-finale");

    // The chapters cover the scene up to the contact form; after it (Aktuelles,
    // closing picture, footer) the page scrolls freely and those sections
    // play their entrance once when they come into view (alt-sections.js).
    var CHAPTERS = SCENE;

    // The pictures of Aktuelles and the closing image are lazy-loaded; left
    // alone they would download and decode in the middle of the move that
    // reveals them (a visible hitch). Fetch + decode them while the visitor
    // is still reading the last scene chapters.
    var tailWarm = false;
    function warmTail() {
      if (tailWarm) return;
      tailWarm = true;
      var imgs = [];
      if (news) imgs = imgs.concat(Array.prototype.slice.call(news.querySelectorAll("img")));
      if (finale) imgs = imgs.concat(Array.prototype.slice.call(finale.querySelectorAll("img")));
      imgs.forEach(function (img) {
        img.loading = "eager";
        if (img.decode) img.decode().catch(function () {});
      });
    }
    // gentle in, long settle: reads as a camera move, never as a jump
    function easeCamera(t) {
      return -(Math.cos(Math.PI * t) - 1) / 2;
    }

    // absolute page offset of the scene; the rect is relative to the real
    // window position, so pair it with scrollY (Lenis' own value can lag a
    // frame behind after a native jump, e.g. focus scrolling into view)
    function sceneTop() { return window.scrollY + scene.getBoundingClientRect().top; }
    function stopY(i) {
      var c = CHAPTERS[i];
      return typeof c.y === "number" ? c.y : stopYScene(i);
    }
    function stopYScene(i) {
      var c = SCENE[i], trackH = track.offsetHeight;
      if (!c.contact) return Math.round(sceneTop() + c.p * trackH);
      // rest where the contact headline sits in the upper part of the screen
      // (phones: the panel is taller than the screen), at most q = 1
      var head = contact.querySelector(".alt-contact-head") || contact;
      var headOffset = head.getBoundingClientRect().top - contact.getBoundingClientRect().top;
      var vh = window.innerHeight;
      var into = Math.min(contact.offsetHeight, vh + headOffset - vh * 0.16);
      return Math.round(sceneTop() + trackH + Math.max(0, into));
    }

    var playing = false;     // a chapter move is running
    var settleUntil = 0;     // swallow trailing trackpad momentum until then
    var lastInput = 0;
    var touchAcc = 0, touchUsed = false;
    // Touch tuning (2026-11-07): moves run at TOUCH_DUR of the desktop pace,
    // a swipe counts after TOUCH_START px, a fast flick may carry one chapter further.
    var lastWasTouch = false, TOUCH_DUR = 0.8, TOUCH_START = 22, touchT0 = 0;
    var EPS = 2;

    // index of the chapter we are at / just past, in the given direction
    function nextIndex(y, dir) {
      if (dir > 0) {
        for (var i = 0; i < CHAPTERS.length; i++) if (stopY(i) > y + EPS) return i;
        return -1;
      }
      for (var j = CHAPTERS.length - 1; j >= 0; j--) if (stopY(j) < y - EPS) return j;
      return -1;
    }
    function inZone(y, dir) {
      var first = stopY(0), lastY = stopY(CHAPTERS.length - 1);
      return dir > 0 ? (y >= first - EPS && y < lastY - EPS)
                     : (y > first + EPS && y <= lastY + EPS);
    }

    // Nearest stop to y. With keyboard focus on a link or field, only stops
    // that show that element count (Tab into the form -> contact stop, Tab to
    // a footer link -> page end); -1 if no stop shows it (then leave it be).
    function nearestStop(y) {
      var a = document.activeElement, vh = window.innerHeight, cand = [];
      var focused = a && a !== document.body && a !== document.documentElement && !a.classList.contains("gwc-main");
      for (var i = 0; i < CHAPTERS.length; i++) cand.push(i);
      if (focused) {
        var r = a.getBoundingClientRect();
        if (r.width || r.height) {
          var top = window.scrollY + r.top, bot = window.scrollY + r.bottom;
          cand = cand.filter(function (k) { var s = stopY(k); return top >= s + 40 && bot <= s + vh; });
          if (!cand.length) return -1;
        }
      }
      var best = cand[0], bd = Infinity;
      cand.forEach(function (k) { var d = Math.abs(stopY(k) - y); if (d < bd) { bd = d; best = k; } });
      return best;
    }

    function goTo(i, dir) {
      var from = CHAPTERS[dir > 0 ? i - 1 : i + 1];
      var dur = (dir > 0 ? CHAPTERS[i].dur : from && from.dur) || 0.9;
      // a move that starts mid-chapter (e.g. after a scrollbar drag) is shorter
      var y = lenis.scroll, a = stopY(dir > 0 ? Math.max(0, i - 1) : Math.min(CHAPTERS.length - 1, i + 1));
      var full = Math.abs(stopY(i) - a) || 1;
      dur = Math.max(0.4, dur * Math.min(1, Math.abs(stopY(i) - y) / full));
      // on phones a swipe should feel like it carries the camera: a bit quicker than on desktop
      if (lastWasTouch) dur = Math.max(0.4, dur * TOUCH_DUR);
      // clips that become visible during this move must be there from the
      // first frame (normally they were loaded in an earlier pause already)
      var destP = typeof CHAPTERS[i].p === "number" ? CHAPTERS[i].p : 1;
      for (var k = 1; k < videos.length; k++) if (NEED_AT[k] <= destP) wake(k);
      playing = true;
      chapterMoving = true;
      if (i > 0) leaveHero();
      stopPlayback(false);
      fadeOffsets();
      if (dir > 0) startPlayback(current.p, destP, dur);
      startMove({ kind: "camera", y0: lenis.scroll, v0: 0, y1: stopY(i), T: dur, i: i, dir: dir,
                  from: dir > 0 ? i - 1 : i + 1, gesture: gesture });
    }

    // ---- the camera move -----------------------------------------------------
    // Our own driver instead of lenis.scrollTo, so a running move can be
    // re-aimed without losing speed. A fresh move uses the camera ease; a
    // re-aimed one continues from the current position *and velocity* (cubic
    // Hermite to the new stop, coming to rest there). That is what lets the
    // visitor fast-forward through the chapters in one continuous motion.
    var move = null;
    function easeCameraD(t) { return Math.PI / 2 * Math.sin(Math.PI * t); }
    function moveState(m, now) {
      var s = clamp((now - m.t0) / (m.T * 1000), 0, 1);
      if (m.kind === "camera") {
        var d = m.y1 - m.y0;
        return { y: m.y0 + d * easeCamera(s), v: d * easeCameraD(s) / m.T, done: s >= 1 };
      }
      var s2 = s * s, s3 = s2 * s;
      return {
        y: (2 * s3 - 3 * s2 + 1) * m.y0 + (s3 - 2 * s2 + s) * m.T * m.v0 + (3 * s2 - 2 * s3) * m.y1,
        v: ((6 * s2 - 6 * s) * m.y0 + (3 * s2 - 4 * s + 1) * m.T * m.v0 + (6 * s - 6 * s2) * m.y1) / m.T,
        done: s >= 1
      };
    }
    function moveTick() {
      if (!move) return;
      var st = moveState(move, performance.now());
      lenis.scrollTo(st.done ? move.y1 : st.y, { immediate: true, force: true });
      if (st.done) finishMove();
    }
    var tickerOn = false;
    window.__altSceneMoving = function () { return playing; };
    function startMove(m) {
      m.t0 = performance.now();
      move = m;
      ff = { gesture: -1 };
      if (!tickerOn) { tickerOn = true; gsap.ticker.add(moveTick); }
    }
    function finishMove() {
      var m = move;
      move = null;
      if (tickerOn) { tickerOn = false; gsap.ticker.remove(moveTick); }
      playing = false;
      chapterMoving = false;
      stopPlayback(true);
      // load the clips the next chapters need while the visitor reads
      if (current.p >= T.introIn[0]) { wake(1); wake(2); wake(3); }
      if (current.p >= T.steps[0]) warmTail();
      settleUntil = performance.now() + 150;
      if (m.i === 0) returnHero();
    }

    // ---- fast-forward ------------------------------------------------------
    // From the moment the beach clip is in view, scrolling during a move is
    // not swallowed: each new gesture aims the move one chapter further (or
    // back), continued scrolling adds a chapter per FF_STEP px, and the move
    // speeds up accordingly. The church opening plays undisturbed.
    var FF_FROM = 0.45;          // p at which the beach clip is visible
    var FF_STEP = 300;           // px of continued scrolling per extra chapter
    var FF_START_ALLOW = 350;    // the gesture that started the move may run on this far
    var FF_DUR = 0.9;            // an added chapter keeps (almost) its natural pace
    var FF_AHEAD = 1;            // the camera is never more than one chapter ahead of the picture
    var ff = { gesture: -1 };
    function canFastForward() {
      return !!move && (move.from >= 1 || current.p >= FF_FROM);
    }
    function pOf(i) { return typeof CHAPTERS[i].p === "number" ? CHAPTERS[i].p : 1; }
    function retarget(i) {
      if (!move || i < 0 || i >= CHAPTERS.length) return;
      var now = performance.now(), st = moveState(move, now);
      var y1 = stopY(i), d = y1 - st.y, v0 = st.v;
      if (Math.abs(d) < 1) return;
      var dir = d > 0 ? 1 : -1;
      // natural pace: what is left of the current move, plus the added
      // chapter at (almost) its own duration; turning back takes a chapter's time
      var left = Math.max(0, move.T - (now - move.t0) / 1000);
      var add = dir === move.dir ? (CHAPTERS[i].dur || 1.6) * FF_DUR : (CHAPTERS[Math.min(i + 1, CHAPTERS.length - 1)].dur || 1.6) * 0.8;
      var Tm = Math.max(0.6, (dir === move.dir ? left : 0) + add);
      // never overshoot the stop: a Hermite curve stays monotonic while
      // v0*T <= 3*d; above that, arrive sooner (and if needed a bit slower)
      if (v0 * d > 0 && Math.abs(v0) * Tm > 2.85 * Math.abs(d)) {
        Tm = Math.max(0.45, 2.85 * Math.abs(d) / Math.abs(v0));
        if (Math.abs(v0) * Tm > 2.85 * Math.abs(d)) v0 = (v0 > 0 ? 1 : -1) * 2.85 * Math.abs(d) / Tm;
      }
      var destP = pOf(i);
      for (var k = 1; k < videos.length; k++) if (NEED_AT[k] <= destP) wake(k);
      if (i > 0) leaveHero();
      replanPlayback(destP, Tm, dir);
      move = { kind: "hermite", y0: st.y, v0: v0, y1: y1, T: Tm, t0: now, i: i, dir: dir,
               from: move.from, gesture: move.gesture };
    }
    // the clips keep playing from where they are, only their rate changes
    // (no seek, so no visible jump); backwards they hand over to seeking
    function replanPlayback(pTo, T, dir) {
      videos.forEach(function (v, k) {
        if (!v.duration || !v.currentSrc) return;
        var release = function () { if (driven[k]) releaseClip(k); };
        if (dir < 0) { release(); return; }
        var from = driven[k] ? v.currentTime : clipTime(k, current.p);
        var t1 = clipTime(k, pTo);
        if (t1 - from < 0.1) { release(); return; }
        var rate = (t1 - from) / T;
        if (rate < 0.25 || rate > 4) { release(); return; }
        if (!driven[k]) {
          driven[k] = true;
          if (Math.abs(v.currentTime - from) > 0.08) v.currentTime = from;
          var pr = v.play();
          if (pr && pr.catch) pr.catch(function () { driven[k] = false; });
        }
        v.playbackRate = rate;
      });
    }
    // one chapter further, but never more than FF_AHEAD beyond the next stop
    // in front of the picture: continued scrolling flows on chapter by chapter,
    // and when it stops the camera comes to rest at the next stop
    function extend(dir) {
      if (!move) return false;
      var ahead = nextIndex(lenis.scroll, dir);
      if (ahead < 0) return false;
      var limit = ahead + dir * FF_AHEAD, ni = move.i + dir;
      if (ni < 0 || ni >= CHAPTERS.length || (dir > 0 ? ni > limit : ni < limit)) return false;
      retarget(ni);
      return true;
    }
    // input while a move runs; amount = px of this event, fresh = new gesture
    function fastForward(dir, amount, gest, pushing) {
      if (!move) return;
      if (gest !== ff.gesture) {
        // a gesture is judged once, when it begins: one that starts during
        // the church opening never fast-forwards, however long it runs on
        ff = { gesture: gest, acc: 0, count: 0, rev: 0, fresh: true, blocked: !canFastForward() };
      }
      if (ff.blocked) return;
      if (dir !== move.dir) {
        // turn around: aim at the stop behind the current position
        ff.rev += amount;
        if (ff.rev >= 40) {
          ff.rev = -1e9;
          ff.fresh = false;            // this gesture has done its job: turned around
          ff.acc = -FF_STEP;           // and it takes a full extra push to go further back
          retarget(nextIndex(lenis.scroll, dir));
        }
        return;
      }
      var isStart = gest === move.gesture;
      if (ff.fresh) {
        ff.fresh = false;
        if (!isStart) extend(dir);                      // a new push: on to the next chapter
      }
      if (!pushing) return;                              // trackpad momentum doesn't count
      ff.acc += amount;
      var allow = isStart ? FF_START_ALLOW : 0;
      var need = allow + FF_STEP * (ff.count + 1);
      if (ff.acc >= need) {
        if (extend(dir)) ff.count++;
        // no stored-up momentum: scrolling beyond what the camera may take
        // now is dropped, so nothing keeps running after the input stops
        ff.acc = Math.min(ff.acc, allow + FF_STEP * (ff.count + 1) - 1);
      }
    }

    // gesture tracking (shared by wheel and touch): a pause in the event
    // stream, or deltas growing again after decaying, start a new gesture
    var gesture = 0, lastAbs = 0, prevDecaying = false;

    // Real playback for a forward move: each clip that advances during the
    // move plays at the rate that covers its range in the move's duration.
    // The decoder then works through the frames in order (smooth, hardware
    // accelerated, tolerant of a slow network) instead of ~100 random seeks.
    // Backward moves keep seeking (browsers can't play backwards).
    function startPlayback(pFrom, pTo, dur) {
      videos.forEach(function (v, k) {
        if (!v.duration || !v.currentSrc) return;
        var t0 = clipTime(k, pFrom), t1 = clipTime(k, pTo);
        // start from the frame that is actually on screen (it may still be
        // gliding back from the previous move); only a far-off clip is set
        var from = Math.abs(v.currentTime - t0) < 0.5 ? v.currentTime : t0;
        if (t1 - from < 0.1) return;
        var rate = (t1 - from) / dur;
        if (rate < 0.25 || rate > 4) return;          // outside safe rates: keep seeking
        driven[k] = true;
        seekOff[k] = 0;
        if (from !== v.currentTime) v.currentTime = from;
        v.playbackRate = rate;
        var pr = v.play();
        if (pr && pr.catch) pr.catch(function () { driven[k] = false; });
      });
    }
    function stopPlayback(settle) {
      videos.forEach(function (v, k) {
        if (driven[k]) releaseClip(k);                 // render() glides onto the exact frame
      });
      if (settle) render(current.p, current.q);
    }

    function step(dir) {
      var y = lenis.scroll;
      if (!inZone(y, dir)) return false;
      var i = nextIndex(y, dir);
      if (i < 0) return false;
      goTo(i, dir);
      return true;
    }

    window.gwcScrollGate = function (data) {
      var e = data.event, dy = data.deltaY, now = performance.now();
      var isTouch = e.type.indexOf("touch") === 0;
      var dir = dy > 0 ? 1 : dy < 0 ? -1 : 0;

      if (isTouch) {
        // one swipe = one chapter: count the finger travel of this touch,
        // fire once it passes a threshold; during a move, swipes fast-forward
        lastWasTouch = true;
        if (e.type === "touchstart") { touchAcc = 0; touchUsed = false; gesture++; touchT0 = now; }
        if (playing) {
          if (e.cancelable) e.preventDefault();
          if (dir) {
            touchAcc += dy;
            // a new swipe counts once it has travelled 36 px; finger travel is
            // much longer than wheel deltas, so it counts less (an extra
            // chapter takes ~2/3 of a screen), and the release fling not at all
            if (Math.abs(touchAcc) >= TOUCH_START) fastForward(dir, Math.abs(dy) * 0.55, gesture, e.type === "touchmove");
          }
          return false;
        }
        if (!dir) return true;
        if (!inZone(lenis.scroll, dir)) return true;
        if (e.cancelable) e.preventDefault();
        if (touchUsed) return false;
        touchAcc += dy;
        if (Math.abs(touchAcc) >= TOUCH_START) {
          touchUsed = true;
          step(dir);
          // a quick, long flick (≥ 140 px in < 180 ms) flows on into the next chapter
          if (playing && Math.abs(touchAcc) >= 140 && now - touchT0 < 180 && canFastForward()) extend(dir);
        }
        return false;
      }

      lastWasTouch = false;
      var gap = now - lastInput, abs = Math.abs(dy);
      var fresh = gap > 90 || (prevDecaying && abs > lastAbs * 1.6 + 3);
      var decaying = abs < lastAbs - 0.01;
      lastInput = now; lastAbs = abs; prevDecaying = decaying;
      if (fresh) gesture++;
      if (playing) {
        if (e.cancelable) e.preventDefault();
        if (dir) fastForward(dir, abs, gesture, !decaying);
        return false;
      }
      if (!dir) return true;
      // free scrolling back up from below the contact form: come to rest on
      // the contact stop instead of running on into the scene
      if (dir < 0) {
        var cy = stopY(CONTACT);
        if (lenis.scroll > cy + EPS && lenis.targetScroll + dy <= cy) {
          if (e.cancelable) e.preventDefault();
          if (Math.abs(lenis.targetScroll - cy) > 1) lenis.scrollTo(cy);
          settleUntil = now + 250;
          return false;
        }
      }
      if (!inZone(lenis.scroll, dir)) return true;

      if (e.cancelable) e.preventDefault();
      // trackpads keep sending decaying deltas after a flick: only a new
      // gesture (a pause in the stream) may start the next chapter
      if (now < settleUntil || (gap < 120 && now - settleUntil < 900 && settleUntil > 0)) {
        settleUntil = Math.max(settleUntil, now + 120);
        return false;
      }
      step(dir);
      return false;
    };

    // keyboard: arrows / page keys / space move chapter by chapter in the scene
    window.addEventListener("keydown", function (e) {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      var t = e.target;
      if (t && t.closest && (t.isContentEditable ||
          t.closest("input, textarea, select, button, summary, video, audio, [role=button], [role=tab], [role=menuitem], [role=slider], [contenteditable]"))) return;
      var down = { ArrowDown: 1, PageDown: 1, " ": 1 }, up = { ArrowUp: 1, PageUp: 1 };
      var dir = down[e.key] && !e.shiftKey ? 1 : (up[e.key] || (e.key === " " && e.shiftKey)) ? -1 : 0;
      if (!dir) return;
      if (playing) {
        e.preventDefault();
        if (!e.repeat) { gesture++; fastForward(dir, FF_STEP, gesture, false); }
        return;
      }
      if (step(dir)) e.preventDefault();
    });

    // Tab into the form: the browser jumps there natively. Let Lenis catch up
    // with that position first, then settle on the contact stop.
    // Keyboard focus anywhere on the page (Tab into the form, to a news card
    // or a footer link): the browser jumps there natively; let Lenis catch up,
    // then settle on the stop that shows the focused element.
    document.addEventListener("focusin", function () {
      requestAnimationFrame(function () {
        if (playing) return;
        if (Math.abs(lenis.scroll - window.scrollY) > 1) lenis.resize();
        var y = lenis.scroll, best = nearestStop(y);
        if (best >= 0 && Math.abs(stopY(best) - y) > EPS) goTo(best, stopY(best) > y ? 1 : -1);
      });
    });

    // Native scrolling (touch fling, keyboard) back up from below the contact
    // form must not coast on into the scene either: catch it at the stop and
    // swallow the rest of that swipe.
    var prevY = lenis.scroll, fingerDown = false;
    window.addEventListener("touchstart", function (e) { fingerDown = e.touches.length > 0; }, { passive: true });
    window.addEventListener("touchend", function (e) { fingerDown = e.touches.length > 0; }, { passive: true });
    window.addEventListener("touchcancel", function () { fingerDown = false; }, { passive: true });
    lenis.on("scroll", function () {
      var y = lenis.scroll, was = prevY;
      prevY = y;
      if (playing || y >= was) return;
      var cy = stopY(CONTACT);
      if (was > cy + EPS && y < cy - EPS) {
        touchAcc = 0; touchUsed = true;
        settleUntil = performance.now() + 250;
        // a native fling only ends when the page briefly stops being
        // scrollable; otherwise it would coast on past the stop again
        var root = document.documentElement;
        root.style.overflow = "hidden";
        lenis.scrollTo(cy, { immediate: true, force: true });
        prevY = cy;
        // while the finger is still down the drag would carry on: release
        // only after it lifts
        var release = function () {
          requestAnimationFrame(function () { requestAnimationFrame(function () {
            root.style.overflow = "";
            // the swallowed native scroll event left Lenis thinking it still scrolls
            if (lenis.isScrolling === "native") lenis.reset();
          }); });
        };
        if (fingerDown) {
          var up = function () {
            window.removeEventListener("touchend", up); window.removeEventListener("touchcancel", up);
            release();
          };
          window.addEventListener("touchend", up, { passive: true });
          window.addEventListener("touchcancel", up, { passive: true });
        } else release();
      }
    });

    // Safety net: if the page comes to rest between two stops (scrollbar
    // drag, reload mid-scene, resize), glide to the nearest stop.
    var idleTimer = 0;
    lenis.on("scroll", function () {
      clearTimeout(idleTimer);
      if (playing) return;
      idleTimer = setTimeout(function () {
        if (playing || lenis.isScrolling) return;
        var y = lenis.scroll, first = stopY(0), lastY = stopY(CHAPTERS.length - 1);
        if (y <= first + EPS || y >= lastY - EPS) return;
        var best = nearestStop(y);
        if (best >= 0 && Math.abs(stopY(best) - y) > EPS) goTo(best, stopY(best) > y ? 1 : -1);
      }, 180);
    });

    // Reload mid-scene (browser restores the old position): jump straight to
    // the nearest stop, no animation.
    function snapNow() {
      var y = lenis.scroll, first = stopY(0), lastY = stopY(CHAPTERS.length - 1);
      if (y <= first + EPS || y >= lastY - EPS) return;
      var best = nearestStop(y);
      if (best < 0) return;
      if (best > 0) leaveHero();
      if (best >= 4) warmTail();
      stopPlayback(false);
      lenis.scrollTo(stopY(best), { immediate: true, force: true });
    }
    if (document.readyState === "complete") setTimeout(snapNow, 60);
    else window.addEventListener("load", function () { setTimeout(snapNow, 60); }, { once: true });

    // ---- hero: the Isar clip plays by itself ---------------------------------
    // At the first stop nothing waits for scrolling: the clip plays once in
    // real time under the headline and holds its last frame. Leaving the hero
    // continues from wherever it got to (see isarFrom in render).
    var saveData = !!(navigator.connection && navigator.connection.saveData);
    function playIsar() {
      if (saveData || isarFrom >= 1 || lenis.scroll > stopY(0) + EPS) return;
      bufferIsar();
      isarAuto = true;
      var pr = isarVideo.play();
      if (pr && pr.catch) pr.catch(function () { isarAuto = false; });
    }
    function leaveHero() {
      if (isarAuto) {
        isarAuto = false;
        isarVideo.pause();
        if (isarVideo.duration) isarFrom = clamp(isarVideo.currentTime / isarVideo.duration, 0, 1);
      }
    }
    function returnHero() {
      // back at the top: show the end of the clip (headline in the water)
      isarFrom = 1;
      last[0] = -1;
      render(current.p, current.q);
    }
    isarVideo.addEventListener("ended", function () { isarAuto = false; isarFrom = 1; });
    // Load the scene clips one after another as soon as the previous one is
    // buffered (beach first: chapter 1 shows it), so they are ready before
    // the visitor gets there instead of being fetched mid-move.
    if (!saveData) {
      var chain = [isarVideo, strandVideo, strand2Video];
      chain.forEach(function (v, k) {
        v.addEventListener("canplaythrough", function () {
          // after the second beach clip, the Aktuelles/closing pictures too
          var next = function () { wake(k + 1); if (k === 2) warmTail(); };
          if ("requestIdleCallback" in window) requestIdleCallback(next, { timeout: 2000 });
          else setTimeout(next, 800);
        }, { once: true });
      });
    }
    if (isarVideo.readyState >= 3) playIsar();
    else isarVideo.addEventListener("canplay", playIsar, { once: true });
    window.addEventListener("load", playIsar, { once: true });
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { measure(); measureScroll(); render(current.p, current.q); });
    videos.forEach(function (v) {
      v.addEventListener("loadedmetadata", function () { last = [-1, -1, -1, -1]; render(current.p, current.q); });
      v.addEventListener("loadeddata", function () { render(current.p, current.q); });
    });
    if (window.ScrollTrigger) ScrollTrigger.refresh();

    // iOS Safari only seeks videos that have played once: play muted for a
    // moment and pause. Retry on the first touch/scroll if refused.
    // iOS / iPadOS Safari only seeks a video that has played once. Other
    // browsers seek fine, and the play()/pause() round-trip costs them a
    // noticeable amount of main-thread time on a large file — so only prime
    // on iOS.
    var IOS = /iP(hone|ad|od)/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    function primer(video) {
      var primed = !IOS;
      return function () {
        if (primed) return;
        primed = true;
        var done = function () { video.pause(); last = [-1, -1, -1, -1]; render(current.p, current.q); };
        var pr = video.play();
        if (pr && pr.then) pr.then(done).catch(function () { primed = false; });
        else done();
      };
    }
    primers = videos.map(primer);
    // Isar clip right away; the others when wakeLater() reaches them (or
    // now, if the page was reloaded somewhere inside the scene).
    primers.forEach(function (prime, i) { if (woken[i]) prime(); });
    ["touchstart", "touchend", "scroll"].forEach(function (name) {
      window.addEventListener(name, function () {
        primers.forEach(function (prime, i) { if (woken[i]) prime(); });
      }, { passive: true });
    });

    // Debug hook for previews: window.__altScene.render(0.5, 0)
    window.__altScene = {
      render: function (p, q) { current.p = target.p = p; current.q = target.q = q || 0; render(current.p, current.q); },
      measure: measure,
      // true while a chapter move runs (tests)
      moving: function () { return !!(window.__altSceneMoving && window.__altSceneMoving()); }
    };
  });
})();
