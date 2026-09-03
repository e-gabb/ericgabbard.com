/* Confirms that a person, not a scanner, actually rendered the page.
 *
 * A click on a short link proves very little: corporate mail security
 * (Defender, Proofpoint) and chat unfurlers follow every URL they see, within
 * seconds of an application being submitted. They do not, as a rule, run
 * script or paint a page. So the click is logged at the edge and this is what
 * upgrades it to a read.
 *
 * Fires only when there is an attribution cookie to report, so an ordinary
 * visitor never touches the endpoint. */
(function () {
  if (!/(?:^|;\s*)eg=/.test(document.cookie)) return;
  if (navigator.webdriver) return;

  var sent = false;

  function send() {
    if (sent) return;
    // Hidden again before the timer fired: not a read after all. Leave the
    // listener in place so the next return to the tab starts the clock over.
    if (document.visibilityState !== 'visible') return;
    sent = true;
    document.removeEventListener('visibilitychange', arm);
    fetch('/e', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: location.pathname, ref: document.referrer || '' }),
      keepalive: true,
    }).catch(function () { /* attribution is never worth an error in the console */ });
  }

  // A page opened in a background tab is not yet a read; wait until it is
  // actually looked at, then give it a beat to rule out an instant bounce.
  // The listener stays armed until send() actually fires, so a tab that is
  // hidden during the beat is re-armed by its next visibilitychange.
  function arm() {
    if (document.visibilityState === 'visible') {
      setTimeout(send, 1500);
    }
  }

  document.addEventListener('visibilitychange', arm);
  arm();
})();

/* ---- Home page only: the two behaviours below find nothing elsewhere. ---- */

(function () {
  // The bar is light-on-dark only while the hero is under it.
  var bar = document.querySelector('header.bar');
  var hero = document.querySelector('.hero');
  if (!bar || !hero || !('IntersectionObserver' in window)) { if (bar) bar.classList.remove('over'); return; }
  new IntersectionObserver(function (entries) {
    bar.classList.toggle('over', entries[0].isIntersecting);
  }, { rootMargin: '-' + bar.offsetHeight + 'px 0px 0px 0px', threshold: 0 }).observe(hero);
})();

(function () {
  var cue = document.querySelector('.hero-cue');
  if (!cue) return;
  var hash = cue.getAttribute('href');
  var target = document.querySelector(hash);
  if (!target) return;

  cue.addEventListener('click', function (e) {
    e.preventDefault();

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      target.scrollIntoView();
      history.replaceState(null, '', hash);
      return;
    }

    var bar = document.querySelector('header.bar');
    var start = window.pageYOffset;
    var end = target.getBoundingClientRect().top + start - (bar ? bar.offsetHeight + 20 : 0);
    var distance = end - start;
    var duration = 780;
    var t0 = null;
    var cancelled = false;

    // The reader taking the wheel, a finger or a key mid-flight means the
    // animation should stop fighting them. One-shot listeners; whichever
    // path ends the animation removes the rest.
    var stops = ['wheel', 'touchstart', 'keydown'];
    function cancel() { cancelled = true; unlisten(); }
    function unlisten() {
      stops.forEach(function (ev) { window.removeEventListener(ev, cancel); });
    }
    stops.forEach(function (ev) { window.addEventListener(ev, cancel, { passive: true }); });

    // easeOutQuad — moves at full speed from the first frame, then eases
    // into the landing. An ease-IN curve here reads as lag before anything
    // happens, which is exactly what we don't want on a click.
    function ease(t) {
      return t * (2 - t);
    }

    function step(now) {
      if (cancelled) return;
      if (t0 === null) t0 = now;
      var p = Math.min((now - t0) / duration, 1);
      window.scrollTo(0, start + distance * ease(p));
      if (p < 1) {
        requestAnimationFrame(step);
      } else {
        unlisten();
        history.replaceState(null, '', hash);
      }
    }

    requestAnimationFrame(step);
  });
})();
