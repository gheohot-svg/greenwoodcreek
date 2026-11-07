/* 404 viewfinder: running timecode, autofocus hunt -> fail -> focus pull.
   Click / tap anywhere on the viewfinder (outside the links) re-focuses. */
(function () {
  var nf = document.querySelector(".nf");
  if (!nf) return;

  var label = nf.querySelector(".nf-af-label");
  var tc = nf.querySelector(".nf-tc");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Timecode starts at 00:04:04:00 and runs at 25 fps
  var start = performance.now();
  var base = (4 * 60 + 4) * 25;
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function tick() {
    var f = base + Math.floor((performance.now() - start) / 40);
    var ff = f % 25, s = Math.floor(f / 25);
    tc.textContent = pad(Math.floor(s / 3600)) + ":" + pad(Math.floor(s / 60) % 60) + ":" + pad(s % 60) + ":" + pad(ff);
  }
  if (!reduce) setInterval(tick, 40);

  var timers = [];
  function focus() {
    timers.forEach(clearTimeout);
    timers = [];
    if (reduce) {
      nf.classList.add("is-failed", "is-sharp");
      label.textContent = "Kein Motiv gefunden";
      return;
    }
    nf.classList.remove("is-failed", "is-sharp", "is-hunting");
    void nf.offsetWidth; // restart animations
    nf.classList.add("is-hunting");
    label.textContent = "AF sucht …";
    timers.push(setTimeout(function () {
      nf.classList.add("is-failed");
      label.textContent = "Kein Motiv gefunden";
    }, 1500));
    timers.push(setTimeout(function () {
      nf.classList.add("is-sharp");
    }, 1900));
  }

  nf.addEventListener("click", function (e) {
    if (e.target.closest("a, button")) return;
    focus();
  });
  focus();
})();
