/* Portfolio lightbox: click any gallery image to view it full size.
   Vanilla JS, no dependencies. Keyboard: arrows to browse, Esc to close.
   Touch: swipe left/right. */
(function () {
  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  ready(function () {
    // Everything in the page body except chrome: nav/footer logos, the
    // streaming-service logo rows and the Webflow badge are not artwork.
    var candidates = [].slice.call(document.querySelectorAll("img")).filter(function (img) {
      return !img.closest(".gwc-navbar-glass") &&
             !img.closest('[class*="footer"]') &&
             !img.closest('[class*="spotify-icon-logowine"]') &&
             !img.closest(".w-webflow-badge");
    });
    if (!candidates.length) return;

    // Hidden images (e.g. the pair removed from the "Weniger Worte" section)
    // stay out of the sequence.
    function visible(img) {
      return img.offsetParent !== null;
    }

    // The displayed image may be a small responsive variant; the src attribute
    // still points at the full-size file.
    function fullSrc(img) {
      return img.getAttribute("src") || img.currentSrc || img.src;
    }

    var overlay = document.createElement("div");
    overlay.className = "gwc-lightbox";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Bildansicht");
    overlay.hidden = true;
    overlay.innerHTML =
      '<button class="gwc-lightbox-close" type="button" aria-label="Schließen">&times;</button>' +
      '<button class="gwc-lightbox-nav gwc-lightbox-prev" type="button" aria-label="Vorheriges Bild">&#8249;</button>' +
      '<figure class="gwc-lightbox-figure">' +
        '<img class="gwc-lightbox-image" alt=""/>' +
        '<figcaption class="gwc-lightbox-caption"></figcaption>' +
      '</figure>' +
      '<button class="gwc-lightbox-nav gwc-lightbox-next" type="button" aria-label="Nächstes Bild">&#8250;</button>' +
      '<p class="gwc-lightbox-counter" aria-live="polite"></p>';
    document.body.appendChild(overlay);

    var bigImage = overlay.querySelector(".gwc-lightbox-image");
    var caption = overlay.querySelector(".gwc-lightbox-caption");
    var counter = overlay.querySelector(".gwc-lightbox-counter");
    var closeButton = overlay.querySelector(".gwc-lightbox-close");
    var prevButton = overlay.querySelector(".gwc-lightbox-prev");
    var nextButton = overlay.querySelector(".gwc-lightbox-next");

    var sequence = [];
    var index = 0;
    var lastFocused = null;

    function show(i) {
      if (!sequence.length) return;
      index = (i + sequence.length) % sequence.length;
      var source = sequence[index];
      bigImage.src = fullSrc(source);
      bigImage.alt = source.getAttribute("alt") || "";
      var text = source.getAttribute("alt") || "";
      caption.textContent = text;
      caption.hidden = !text;
      counter.textContent = sequence.length > 1 ? index + 1 + " / " + sequence.length : "";
      var many = sequence.length > 1;
      prevButton.hidden = !many;
      nextButton.hidden = !many;
    }

    function open(img) {
      sequence = candidates.filter(visible);
      var start = sequence.indexOf(img);
      if (start < 0) return;
      lastFocused = img;
      overlay.hidden = false;
      document.body.classList.add("gwc-lightbox-open");
      show(start);
      closeButton.focus();
    }

    function close() {
      overlay.hidden = true;
      document.body.classList.remove("gwc-lightbox-open");
      bigImage.removeAttribute("src");
      if (lastFocused) lastFocused.focus();
    }

    candidates.forEach(function (img) {
      img.classList.add("gwc-zoomable");
      img.setAttribute("role", "button");
      img.setAttribute("tabindex", "0");
      if (!img.getAttribute("alt")) img.setAttribute("alt", "Portfolio-Bild");
      img.addEventListener("click", function () {
        open(img);
      });
      img.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
          e.preventDefault();
          open(img);
        }
      });
    });

    closeButton.addEventListener("click", close);
    prevButton.addEventListener("click", function () { show(index - 1); });
    nextButton.addEventListener("click", function () { show(index + 1); });

    // Clicking the backdrop closes; clicking the image itself does not.
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay || e.target.classList.contains("gwc-lightbox-figure")) close();
    });

    document.addEventListener("keydown", function (e) {
      if (overlay.hidden) return;
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") show(index - 1);
      else if (e.key === "ArrowRight") show(index + 1);
      else if (e.key === "Tab") {
        // Keep focus inside the dialog.
        var focusable = [closeButton, prevButton, nextButton].filter(function (b) { return !b.hidden; });
        var first = focusable[0];
        var last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });

    var touchStartX = null;
    overlay.addEventListener("touchstart", function (e) {
      touchStartX = e.changedTouches[0].clientX;
    }, { passive: true });
    overlay.addEventListener("touchend", function (e) {
      if (touchStartX === null) return;
      var dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) > 50) show(index + (dx < 0 ? 1 : -1));
      touchStartX = null;
    }, { passive: true });
  });
})();
