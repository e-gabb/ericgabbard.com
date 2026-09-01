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
    if (sent || document.visibilityState !== 'visible') return;
    sent = true;
    fetch('/e', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: location.pathname, ref: document.referrer || '' }),
      keepalive: true,
    }).catch(function () { /* attribution is never worth an error in the console */ });
  }

  // A page opened in a background tab is not yet a read; wait until it is
  // actually looked at, then give it a beat to rule out an instant bounce.
  function arm() {
    if (document.visibilityState === 'visible') {
      setTimeout(send, 1500);
      document.removeEventListener('visibilitychange', arm);
    }
  }

  document.addEventListener('visibilitychange', arm);
  arm();
})();
