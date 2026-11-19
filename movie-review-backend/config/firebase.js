// Firebase Admin, on the modular entry points.
//
// firebase-admin 14 removed the legacy `admin.credential` / `admin.auth()`
// namespace that this file used to rely on, so `require("firebase-admin")`
// returns an object without `.credential` and the server died on boot with
// "Cannot read properties of undefined (reading 'cert')". The modular
// subpath exports are the supported API from 12 onward.
//
// The credential comes from FIREBASE_SERVICE_ACCOUNT where one is set and
// the local file otherwise. See lib/serviceAccount.js.
//
// A missing or malformed credential does NOT stop the server. It used to:
// loadServiceAccount() threw at require time, nothing caught it, and the
// process died before it ever bound a port. On a host that redeploys per
// commit that is a crash loop and a failure email per push, and it takes the
// whole public API down over a credential only the signed-in routes need.
// Browsing films, searching and reading reviews need no Firebase at all.
//
// So initialisation is deferred and its failure recorded. Routes that need
// auth answer 503 with the reason; everything else serves normally, and
// /health reports the state so the fault is visible rather than silent.
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { loadServiceAccount } = require("../lib/serviceAccount");

let cachedAuth = null;
let initError = null;

function init() {
  if (cachedAuth || initError) return;
  try {
    const serviceAccount = loadServiceAccount();
    // Guarded so a re-import (or a test importing a route) cannot throw
    // "The default Firebase app already exists".
    const app = getApps().length
      ? getApps()[0]
      : initializeApp({ credential: cert(serviceAccount) });
    cachedAuth = getAuth(app);
  } catch (error) {
    initError = error;
    console.error(
      "Firebase Admin did not initialise, so authenticated routes are " +
        "unavailable. The rest of the API is unaffected.\n  " +
        error.message
    );
  }
}

/** The configuration fault, or null when Firebase is usable. */
function authError() {
  init();
  return initError;
}

/** True when signed-in routes can be served. */
function authAvailable() {
  return authError() === null;
}

// Kept as a property access so callers reading `auth.verifyIdToken` still
// work, but resolved lazily rather than at require time.
const auth = new Proxy(
  {},
  {
    get(_target, property) {
      init();
      if (!cachedAuth) throw initError;
      const value = cachedAuth[property];
      return typeof value === "function" ? value.bind(cachedAuth) : value;
    },
  }
);

module.exports = { auth, authAvailable, authError };
