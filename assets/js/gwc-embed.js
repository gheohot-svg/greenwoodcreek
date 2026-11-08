/* GREENWOODCREEK – Videos von Drittanbietern erst nach Klick laden (Zwei-Klick-Lösung).
   Markup: <div class="gwc-embed-consent" data-embed-src="https://…">…<button class="gwc-embed-play">…</button></div>
   Vor dem Klick wird keine Verbindung zum Anbieter aufgebaut; es wird nur ein lokales
   Vorschaubild gezeigt. Nach dem Klick ersetzt ein iframe die Vorschau. */
(function () {
  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }
  ready(function () {
    document.querySelectorAll(".gwc-embed-consent[data-embed-src]").forEach(function (box) {
      var btn = box.querySelector(".gwc-embed-play");
      if (!btn) return;
      btn.addEventListener("click", function () {
        var src = box.getAttribute("data-embed-src");
        if (!/^https:\/\/((player|iframe)\.mediadelivery\.net|www\.youtube-nocookie\.com\/embed)\//.test(src)) return;
        var iframe = document.createElement("iframe");
        iframe.src = src;
        iframe.title = box.getAttribute("data-embed-title") || "Video";
        iframe.setAttribute("allow", "accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen");
        iframe.setAttribute("allowfullscreen", "");
        box.innerHTML = "";
        box.appendChild(iframe);
        box.classList.add("is-loaded");
        iframe.focus();
      });
    });
  });
})();
