/* GREENWOODCREEK — lightbox for the "Aktuelles" galleries.
   Every link with [data-gwc-lightbox] inside a blog post opens its href
   full-size, with the figure's caption. Arrow keys, Esc, swipe and the
   on-screen buttons navigate within the same gallery. */
(function () {
  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  ready(function () {
    if (!document.querySelector("a[data-gwc-lightbox]")) return;

    var box = document.createElement("div");
    box.className = "gwc-lightbox";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-label", "Bildansicht");
    box.setAttribute("aria-hidden", "true");
    box.innerHTML =
      '<button type="button" class="gwc-lightbox-btn gwc-lightbox-close" aria-label="Schließen">&times;</button>' +
      '<button type="button" class="gwc-lightbox-btn gwc-lightbox-prev" aria-label="Vorheriges Bild">&#8249;</button>' +
      '<button type="button" class="gwc-lightbox-btn gwc-lightbox-next" aria-label="Nächstes Bild">&#8250;</button>' +
      '<figure class="gwc-lightbox-figure"><img class="gwc-lightbox-img" alt="">' +
      '<figcaption class="gwc-lightbox-caption"><span class="gwc-lightbox-count"></span><span class="gwc-lightbox-text"></span></figcaption></figure>';
    document.body.appendChild(box);

    var img = box.querySelector(".gwc-lightbox-img");
    var countEl = box.querySelector(".gwc-lightbox-count");
    var textEl = box.querySelector(".gwc-lightbox-text");
    var closeBtn = box.querySelector(".gwc-lightbox-close");
    var items = [];
    var index = 0;
    var lastFocus = null;

    function show(i) {
      index = (i + items.length) % items.length;
      var link = items[index];
      var thumb = link.querySelector("img");
      var fig = link.closest("figure");
      var cap = fig && fig.querySelector("figcaption");
      img.classList.add("is-loading");
      img.onload = function () { img.classList.remove("is-loading"); };
      img.src = link.getAttribute("href");
      img.alt = thumb ? thumb.alt : "";
      countEl.textContent = (index + 1) + " / " + items.length;
      textEl.textContent = link.getAttribute("data-caption") || (cap ? cap.textContent : "");
      box.classList.toggle("is-single", items.length < 2);
      countEl.style.display = items.length < 2 ? "none" : "";
      // Preload the neighbours so paging feels instant.
      [index + 1, index - 1].forEach(function (n) {
        var l = items[(n + items.length) % items.length];
        if (l) { var p = new Image(); p.src = l.getAttribute("href"); }
      });
    }

    function open(gallery, link) {
      items = Array.prototype.slice.call(gallery.querySelectorAll("a[data-gwc-lightbox]"));
      lastFocus = document.activeElement;
      show(items.indexOf(link));
      box.classList.add("is-open");
      box.setAttribute("aria-hidden", "false");
      document.documentElement.classList.add("gwc-lightbox-lock");
      closeBtn.focus();
    }

    function close() {
      box.classList.remove("is-open");
      box.setAttribute("aria-hidden", "true");
      document.documentElement.classList.remove("gwc-lightbox-lock");
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    // One group per blog post (feature image + gallery), so paging never
    // jumps into another post's pictures.
    document.addEventListener("click", function (e) {
      var link = e.target.closest && e.target.closest("a[data-gwc-lightbox]");
      if (!link) return;
      var group = link.closest("[data-gwc-lightbox-group]") || link.closest(".gwc-post") || link.closest(".gwc-gallery") || document.body;
      e.preventDefault();
      open(group, link);
    });

    closeBtn.addEventListener("click", close);
    box.querySelector(".gwc-lightbox-prev").addEventListener("click", function () { show(index - 1); });
    box.querySelector(".gwc-lightbox-next").addEventListener("click", function () { show(index + 1); });
    box.addEventListener("click", function (e) {
      if (e.target === box) close();
    });

    document.addEventListener("keydown", function (e) {
      if (!box.classList.contains("is-open")) return;
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") show(index + 1);
      else if (e.key === "ArrowLeft") show(index - 1);
    });

    var touchX = null;
    box.addEventListener("touchstart", function (e) {
      touchX = e.touches.length === 1 ? e.touches[0].clientX : null;
    }, { passive: true });
    box.addEventListener("touchend", function (e) {
      if (touchX === null) return;
      var dx = e.changedTouches[0].clientX - touchX;
      if (Math.abs(dx) > 50) show(index + (dx < 0 ? 1 : -1));
      touchX = null;
    }, { passive: true });
  });
})();
