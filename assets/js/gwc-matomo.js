/* GREENWOODCREEK – Matomo-Reichweitenmessung (selbst gehostet unter /analytics/, ohne Cookies) */
(function () {
  var _paq = (window._paq = window._paq || []);
  _paq.push(["disableCookies"]);          // keine Cookies, kein Banner nötig
  _paq.push(["setDoNotTrack", true]);     // „Do Not Track“ im Browser wird respektiert
  _paq.push(["trackPageView"]);
  _paq.push(["enableLinkTracking"]);
  var u = "/analytics/";
  _paq.push(["setTrackerUrl", u + "matomo.php"]);
  _paq.push(["setSiteId", "1"]);
  var g = document.createElement("script");
  g.async = true; g.src = u + "matomo.js";
  document.head.appendChild(g);

  // Ziele: Telefon, E-Mail, Kontaktformular
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[href]");
    if (!a) return;
    var h = a.getAttribute("href") || "";
    if (h.indexOf("tel:") === 0) _paq.push(["trackEvent", "Kontakt", "Telefon", location.pathname]);
    else if (h.indexOf("mailto:") === 0) _paq.push(["trackEvent", "Kontakt", "E-Mail", location.pathname]);
  }, true);
  document.addEventListener("submit", function (e) {
    if (e.target && e.target.tagName === "FORM") _paq.push(["trackEvent", "Kontakt", "Formular gesendet", location.pathname]);
  }, true);
})();
