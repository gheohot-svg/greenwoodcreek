(function () {
  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  ready(function () {
    if (!window.gsap || !window.ScrollTrigger) return;
    gsap.registerPlugin(ScrollTrigger);

    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    var SKIP_IMG_RE = /logo_variant|Chevron|Rectangle/i;
    var MIN_TEXT_LEN = 20;

    function inChrome(el) {
      // The opening scene, Aktuelles and the finale are animated by
      // alt-scene.js / alt-sections.js.
      return !!el.closest('[class*="navbar"], [class*="footer"], .gwc-form, [data-gwc-scene], .gwc-news, .alt-finale');
    }

    var candidates = Array.prototype.slice.call(
      document.querySelectorAll("p, h1, h2, h3, h4, h5, h6")
    );

    var headings = [];
    var texts = [];

    candidates.forEach(function (el) {
      if (inChrome(el)) return;
      var family = getComputedStyle(el).fontFamily || "";
      if (/anton/i.test(family)) {
        headings.push(el);
      } else if (/poppins/i.test(family)) {
        if (el.textContent.trim().length >= MIN_TEXT_LEN) texts.push(el);
      }
    });

    var PHONE = window.matchMedia("(max-width: 767px)").matches;
    // Über uns header photo: never faded/blurred in (it is the first thing on
    // the page); on phones it gets the zoom-out below instead.
    var UU_HERO = ".header-64-2 .container-34 > img";
    // Portfolio header photo: same zoom-out on phones (desktop keeps its
    // load-in zoom from the CSS).
    var PF_HERO = ".portfolio-header-4-2 > .gwc-hero-bg";
    // Portfolio artists (Magic Hoffmann / Just Us): on phones the pictures
    // fly in from the sides instead (see below).
    var ARTIST_IMGS = ".gallery-8-2 .content-style-21 img, .gallery-2-2 .content-style-21 img";

    var images = Array.prototype.filter.call(
      document.querySelectorAll("img"),
      function (img) {
        if (inChrome(img)) return false;
        if (img.matches(UU_HERO)) return false;
        if (PHONE && (img.matches(ARTIST_IMGS) || img.matches(PF_HERO))) return false;
        // Scroll-zoom images get their own animation below.
        if (img.closest("[data-gwc-scroll-zoom]")) return false;
        // Beitragskarten auf /aktuelles/ blenden als Ganzes ein (gwc-apple.js).
        if (img.closest(".gwc-card-media")) return false;
        if (SKIP_IMG_RE.test(img.getAttribute("src") || "")) return false;
        return img.getBoundingClientRect().width > 120;
      }
    );

    // Scroll zoom: the image slowly scales up from its centre while the
    // visitor scrolls. The frame clips it, so the picture seems to grow from
    // the inside out. By default the zoom runs until the end of the page
    // (for a closing image); data-gwc-scroll-zoom="through" is the reverse
    // with a pin — see below.
    if (!reduceMotion) {
      document.querySelectorAll("[data-gwc-scroll-zoom] img").forEach(function (img) {
        var frame = img.parentNode;
        var through = frame.getAttribute("data-gwc-scroll-zoom") === "through";

        if (through) {
          // Starts zoomed in and settles to full view. Once the image is
          // centred on screen it is pinned there: further scrolling finishes
          // the zoom first, and only then does the page move on.
          var pin = ScrollTrigger.create({
            trigger: frame,
            start: "center center",
            end: function () { return "+=" + Math.round(window.innerHeight * 0.6); },
            pin: true,
            // GSAP turns spacing off for flex parents by default; without it
            // the heading below would slide up under the pinned image.
            pinSpacing: true,
            refreshPriority: 1,
          });
          gsap.fromTo(
            img,
            { scale: 1.25 },
            {
              scale: 1,
              ease: "none",
              scrollTrigger: {
                trigger: frame,
                // begin once almost half the image is on screen …
                start: "40% bottom",
                // … and land on 100% exactly when the pin releases.
                end: function () { return pin.end; },
                scrub: 0.6,
              },
            }
          );
        } else {
          gsap.fromTo(
            img,
            { scale: 1 },
            {
              scale: 1.15,
              ease: "none",
              scrollTrigger: {
                trigger: frame,
                start: "top bottom",
                end: "max",
                scrub: 0.6,
              },
            }
          );
        }
        if (!img.complete) {
          img.addEventListener("load", function () { ScrollTrigger.refresh(); }, { once: true });
        }
      });
    }

    if (reduceMotion) {
      var all = headings.concat(texts, images);
      if (all.length) gsap.set(all, { opacity: 1, clearProps: "transform,filter,clipPath" });
      return;
    }

    // Hide everything up front (matches pre-existing behavior) so nothing
    // flashes fully visible before its scroll trigger fires.
    if (headings.length) gsap.set(headings, {
      opacity: 0,
      y: 70,
      rotateX: -28,
      clipPath: "inset(0% 0% 100% 0%)",
      transformPerspective: 800,
      transformOrigin: "50% 100%",
    });
    if (texts.length) gsap.set(texts, { opacity: 0, y: 36, filter: "blur(6px)" });
    images.forEach(function (img) {
      gsap.set(img, {
        opacity: 0,
        scale: 1.12,
        rotateX: -18,
        rotateZ: gsap.utils.random(-3, 3),
        filter: "blur(14px)",
        clipPath: "inset(8% 0% 8% 0%)",
        transformPerspective: 900,
        transformOrigin: "50% 100%",
      });
    });

    var phone = gsap.matchMedia();

    // Über uns + Portfolio, phones: the header photo starts cropped to the
    // tall frame and zooms out while the header is held in place, until the
    // whole picture spans the screen width; then the page scrolls on.
    function zoomOutHero(img, header, extra) {
      phone.add("(max-width: 767px)", function () {
        img.classList.add("is-zoom-out");
        // scale at which the contained (= whole) picture covers the frame
        var coverScale = function () {
          var iw = img.naturalWidth || 1440, ih = img.naturalHeight || 810;
          var bw = img.clientWidth, bh = img.clientHeight;
          return Math.max(bw / iw, bh / ih) / Math.min(bw / iw, bh / ih);
        };
        var headerTop = function () { return Math.round(header.getBoundingClientRect().top + window.scrollY); };
        var tl = gsap.timeline({
          scrollTrigger: {
            trigger: header,
            start: function () { return "top " + headerTop() + "px"; },
            end: function () { return "+=" + Math.round(window.innerHeight * 0.7); },
            pin: true,
            pinSpacing: true,
            scrub: 0.6,
            invalidateOnRefresh: true,
            // The header sits at the top of the page, so its pin spacer must
            // exist before any pin further down measures its start —
            // otherwise those starts come out short by this pin's travel and
            // the lower image pins too early, over the content above it
            // (Portfolio phones: "Jedes Projekt"-image over "Weniger Worte").
            // Must stay higher than the zoom frame's refreshPriority (1).
            refreshPriority: 2,
          },
        });
        tl.fromTo(img, { scale: coverScale }, { scale: 1, ease: "none" }, 0);
        if (extra) extra(tl);
        if (!img.complete) img.addEventListener("load", function () { ScrollTrigger.refresh(); }, { once: true });
        return function () { img.classList.remove("is-zoom-out"); };
      });
    }
    var uuHero = document.querySelector(UU_HERO);
    if (uuHero) zoomOutHero(uuHero, uuHero.closest(".header-64-2"));
    var pfHero = document.querySelector(PF_HERO);
    if (pfHero) zoomOutHero(pfHero, pfHero.parentNode, function (tl) {
      // the scrim only helps while the copy sits on the photo; once the
      // copy is below it, the picture shows without it
      tl.fromTo(pfHero.parentNode, { "--gwc-scrim": 1 }, { "--gwc-scrim": 0, ease: "none" }, 0);
    });

    // Portfolio artists, phones: each picture flies in on its own, alternately
    // from the right and from the left, and settles with a soft ease.
    phone.add("(max-width: 767px)", function () {
      gsap.utils.toArray(ARTIST_IMGS).forEach(function (img, i) {
        var dir = i % 2 === 0 ? 1 : -1;            // first from the right
        gsap.fromTo(img,
          { xPercent: 85 * dir, rotate: 3 * dir, opacity: 0 },
          {
            xPercent: 0,
            rotate: 0,
            opacity: 1,
            duration: 1.25,
            ease: "power4.out",
            scrollTrigger: { trigger: img, start: "top 90%", once: true },
          });
      });
    });

    // Headings: curtain-rise mask reveal with a soft organic overshoot, cascading in groups.
    ScrollTrigger.batch(headings, {
      start: "top 88%",
      once: true,
      onEnter: function (batch) {
        gsap.to(batch, {
          opacity: 1,
          y: 0,
          rotateX: 0,
          clipPath: "inset(0% 0% 0% 0%)",
          duration: 1.3,
          ease: "back.out(1.5)",
          stagger: 0.12,
        });
      },
    });

    // Body copy: soft blur-fade cascade, slightly gentler than headings.
    ScrollTrigger.batch(texts, {
      start: "top 90%",
      once: true,
      onEnter: function (batch) {
        gsap.to(batch, {
          opacity: 1,
          y: 0,
          filter: "blur(0px)",
          duration: 1.1,
          ease: "power3.out",
          stagger: 0.1,
        });
      },
    });

    // Images: cinematic mask-wipe + Ken-Burns settle, each with its own subtle
    // duration jitter so a row of images doesn't move as one flat unit.
    ScrollTrigger.batch(images, {
      start: "top 88%",
      once: true,
      onEnter: function (batch) {
        batch.forEach(function (img, i) {
          gsap.to(img, {
            opacity: 1,
            scale: 1,
            rotateX: 0,
            rotateZ: 0,
            filter: "blur(0px)",
            clipPath: "inset(0% 0% 0% 0%)",
            duration: gsap.utils.random(1.2, 1.6),
            ease: "power4.out",
            delay: i * 0.08,
          });
        });
      },
    });

    // Desktop-only: gentle continuous parallax drift on images while they pass
    // through the viewport, so the page keeps moving instead of a one-shot pop.
    var mm = gsap.matchMedia();
    mm.add("(min-width: 900px)", function () {
      images.forEach(function (img) {
        gsap.fromTo(
          img,
          { yPercent: -4 },
          {
            yPercent: 4,
            ease: "none",
            scrollTrigger: {
              trigger: img,
              start: "top bottom",
              end: "bottom top",
              scrub: 1,
            },
          }
        );
      });
    });

    images.forEach(function (img) {
      if (!img.complete) {
        img.addEventListener("load", function () {
          ScrollTrigger.refresh();
        });
      }
    });
  });
})();
