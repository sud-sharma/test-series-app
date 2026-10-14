/* Page behaviour: live fee from the API, intro video, footer year. */
(function () {
  var API = (window.TS_API_URL || '').replace(/\/$/, '') + '/api';

  // Footer year
  var year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  // Course fee: show the amount configured on the server (COURSE_FEE_INR)
  fetch(API + '/course')
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (course) {
      if (!course) return;
      var fee = new Intl.NumberFormat('en-IN', {
        style: 'currency', currency: 'INR', maximumFractionDigits: 0,
      }).format(course.feePaise / 100);
      document.querySelectorAll('[data-fee]').forEach(function (el) { el.textContent = fee; });
    })
    .catch(function () { /* keep the placeholder if the API is unreachable */ });

  // Intro video: loads only when the visitor presses play
  var box = document.getElementById('intro-video');
  if (!box) return;
  var ytId = (box.dataset.youtubeId || '').trim();
  var src = (box.dataset.videoSrc || '').trim();
  var poster = (box.dataset.poster || '').trim();
  var note = box.querySelector('.video-note');
  if (poster) box.style.backgroundImage = 'url("' + poster.replace(/"/g, '%22') + '")';
  if ((ytId || src) && note) note.hidden = true;

  box.querySelector('.play-btn').addEventListener('click', function () {
    if (ytId) {
      var iframe = document.createElement('iframe');
      iframe.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(ytId) + '?autoplay=1&rel=0';
      iframe.title = 'Intro video';
      iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      iframe.allowFullscreen = true;
      box.replaceChildren(iframe);
    } else if (src) {
      var video = document.createElement('video');
      video.src = src;
      video.controls = true;
      video.autoplay = true;
      video.playsInline = true;
      if (poster) video.poster = poster;
      box.replaceChildren(video);
    } else if (note) {
      note.textContent = 'Intro video coming soon';
    }
  });
})();
