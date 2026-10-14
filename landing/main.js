/* Page behaviour: live fee from the API, YouTube videos (click to load), footer year. */
(function () {
  var API = (window.TS_API_URL || '').replace(/\/$/, '') + '/api';

  // Footer year
  var year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  // Fee: show the amount configured on the server (COURSE_FEE_INR) so the page and
  // the Razorpay charge always match. The number written in the HTML is the fallback.
  fetch(API + '/course')
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (course) {
      if (!course || !course.feePaise) return;
      var fee = new Intl.NumberFormat('en-IN', {
        style: 'currency', currency: 'INR', maximumFractionDigits: 0,
      }).format(course.feePaise / 100);
      document.querySelectorAll('[data-fee]').forEach(function (el) { el.textContent = fee; });
    })
    .catch(function () { /* keep the fallback if the API is unreachable */ });

  // YouTube: accepts a video ID or any youtube.com / youtu.be / shorts link
  function youTubeId(value) {
    var v = (value || '').trim();
    if (/^[\w-]{11}$/.test(v)) return v;
    var m = v.match(/(?:youtube\.com\/(?:shorts\/|embed\/|live\/|watch\?(?:.*&)?v=)|youtu\.be\/)([\w-]{11})/);
    return m ? m[1] : null;
  }

  document.querySelectorAll('.yt').forEach(function (box) {
    var id = youTubeId(box.dataset.youtube);
    if (!id) { box.hidden = true; return; } // no link yet: keep it off the page
    var base = 'https://i.ytimg.com/vi/' + id + '/';
    box.style.backgroundImage = 'url("' + base + 'hqdefault.jpg")';
    if (box.classList.contains('short')) {
      // Shorts have a portrait thumbnail; use it when YouTube provides one (sharper on tall cards)
      var portrait = new Image();
      portrait.onload = function () {
        if (portrait.naturalHeight > portrait.naturalWidth) box.style.backgroundImage = 'url("' + portrait.src + '")';
      };
      portrait.src = base + 'oardefault.jpg';
    }
    box.querySelector('.play-btn').addEventListener('click', function () {
      var iframe = document.createElement('iframe');
      iframe.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0&playsinline=1';
      iframe.title = box.dataset.title || 'Video';
      iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      iframe.allowFullscreen = true;
      box.classList.add('is-playing');
      box.replaceChildren(iframe);
    });
  });

  // Hide the mentor video card and the testimonials section until they have videos
  document.querySelectorAll('[data-video-card]').forEach(function (card) {
    if (!card.querySelector('.yt:not([hidden])')) card.hidden = true;
  });
  var testimonials = document.querySelector('[data-testimonials]');
  if (testimonials && !testimonials.querySelector('.yt:not([hidden])')) {
    testimonials.hidden = true;
    var link = document.querySelector('[data-testimonials-link]');
    if (link) link.hidden = true;
  }
})();
