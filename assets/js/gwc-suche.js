/* GREENWOODCREEK – Blog-Suche auf /aktuelles/ (Pagefind, laeuft ohne Server). */
(function () {
  var el = document.getElementById("gwc-suche");
  if (!el || typeof PagefindUI === "undefined") return;
  new PagefindUI({
    element: "#gwc-suche",
    bundlePath: "/pagefind/",
    showSubResults: false,
    showImages: true,
    excerptLength: 22,
    resetStyles: false,
    autofocus: false,
    translations: {
      placeholder: "Beiträge durchsuchen …",
      zero_results: "Keine Beiträge zu „[SEARCH_TERM]“ gefunden",
      many_results: "[COUNT] Beiträge zu „[SEARCH_TERM]“",
      one_result: "1 Beitrag zu „[SEARCH_TERM]“",
      load_more: "Weitere Beiträge anzeigen",
      clear_search: "Löschen"
    }
  });
  el.classList.add("is-ready");
})();
