(function () {
  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  // Looping background clips: load and play only while on screen, so a
  // visitor who never scrolls that far doesn't download them at all.
  // Phones get the lighter 960px encodes (MP4/H.264, faststart) – .mov does not play on Android.
  var isSmallScreen = window.matchMedia("(max-width: 767px)").matches;

  function playWhenVisible(video) {
    if (!("IntersectionObserver" in window)) { video.preload = "auto"; video.play().catch(function () {}); return; }
    new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) {
        video.preload = "auto";
        video.play().catch(function () {});
      } else {
        video.pause();
      }
    }, { rootMargin: "200px 0px" }).observe(video);
  }

  ready(function () {
    var portfolioPlaceholder = document.querySelector(".a2ustraliaportfolioclip-1");
    if (portfolioPlaceholder) {
      var portfolioVideoFrame = document.createElement("div");
      portfolioVideoFrame.className = "gwc-portfolio-video-frame";
      var portfolioVideo = document.createElement("video");
      portfolioVideo.className = "gwc-portfolio-video";
      portfolioVideo.src = "../assets/video/australien-portfolio" + (isSmallScreen ? "-mobile" : "") + ".mp4";
      portfolioVideo.poster = "../assets/images/video/australien-poster.webp";
      portfolioVideo.autoplay = false; // started by playWhenVisible()
      portfolioVideo.loop = true;
      portfolioVideo.muted = true;
      portfolioVideo.playsInline = true;
      portfolioVideo.preload = "none";
      portfolioVideo.setAttribute("aria-label", "Video aus Australien");
      var soundButton = document.createElement("button");
      soundButton.className = "gwc-portfolio-sound";
      soundButton.type = "button";
      soundButton.setAttribute("aria-pressed", "false");
      soundButton.textContent = "Ton an";
      soundButton.addEventListener("click", function () {
        portfolioVideo.muted = !portfolioVideo.muted;
        var soundOn = !portfolioVideo.muted;
        soundButton.textContent = soundOn ? "Ton aus" : "Ton an";
        soundButton.setAttribute("aria-pressed", String(soundOn));
      });
      portfolioVideoFrame.append(portfolioVideo, soundButton);
      portfolioPlaceholder.replaceWith(portfolioVideoFrame);
      playWhenVisible(portfolioVideo);
    }


    var italyPlaceholder = document.querySelector('[data-figma-id="10273:69965"]');
    if (italyPlaceholder) {
      var italyFrame = document.createElement("div");
      italyFrame.className = "gwc-italy-video-frame";
      var italyVideo = document.createElement("video");
      italyVideo.className = "gwc-italy-video";
      italyVideo.src = "../assets/video/italien-portfolio" + (isSmallScreen ? "-mobile" : "") + ".mp4";
      italyVideo.poster = "../assets/images/video/italien-poster.webp";
      italyVideo.autoplay = false; // started by playWhenVisible()
      italyVideo.loop = true;
      italyVideo.muted = true;
      italyVideo.playsInline = true;
      italyVideo.preload = "none";
      italyVideo.setAttribute("aria-label", "Video aus Italien");
      var italySoundButton = document.createElement("button");
      italySoundButton.className = "gwc-portfolio-sound";
      italySoundButton.type = "button";
      italySoundButton.setAttribute("aria-pressed", "false");
      italySoundButton.textContent = "Ton an";
      italySoundButton.addEventListener("click", function () {
        italyVideo.muted = !italyVideo.muted;
        var soundOn = !italyVideo.muted;
        italySoundButton.textContent = soundOn ? "Ton aus" : "Ton an";
        italySoundButton.setAttribute("aria-pressed", String(soundOn));
      });
      italyFrame.append(italyVideo, italySoundButton);
      italyPlaceholder.replaceWith(italyFrame);
      playWhenVisible(italyVideo);
      var italyContainer = italyFrame.closest(".container-21");
      var italyCopy = italyContainer && italyContainer.querySelector(".content-style-29");
      if (italyCopy) italyContainer.insertBefore(italyCopy, italyFrame);
    }

    var servicesSecondImage = document.querySelector('[data-figma-id="10207:238"]');
    if (servicesSecondImage) {
      var servicesVideo = document.createElement("video");
      servicesVideo.className = "gwc-services-video";
      servicesVideo.src = "../assets/video/leistungen-zweites-bild.mp4";
      servicesVideo.autoplay = true;
      servicesVideo.loop = true;
      servicesVideo.muted = true;
      servicesVideo.playsInline = true;
      servicesVideo.preload = "metadata";
      servicesVideo.setAttribute("aria-label", "Video zu unseren Leistungen");
      servicesSecondImage.replaceWith(servicesVideo);
    }

    var navbar = document.querySelector(".gwc-navbar-glass");
    if (!navbar) return;
    var toggle = navbar.querySelector(".gwc-nav-toggle");
    if (!toggle) return;

    function close() {
      navbar.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
    }

    toggle.addEventListener("click", function () {
      var isOpen = navbar.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });

    navbar.querySelectorAll(".nav-links a").forEach(function (a) {
      a.addEventListener("click", close);
    });

    document.addEventListener("click", function (e) {
      if (!navbar.contains(e.target)) close();
    });
  });
})();
