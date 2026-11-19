// Firebase Admin, on the modular entry points.
//
// firebase-admin 14 removed the legacy `admin.credential` / `admin.auth()`
// namespace that this file used to rely on, so `require("firebase-admin")`
// returns an object without `.credential` and the server died on boot with
// "Cannot read properties of undefined (reading 'cert')". The modular
// subpath exports are the supported API from 12 onward.
//
// The credential comes from FIREBASE_SERVICE_ACCOUNT where one is set and
// the local file otherwise, so a deploy needs no secret copied onto the host
// by hand. See lib/serviceAccount.js.
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { loadServiceAccount } = require("../lib/serviceAccount");

const serviceAccount = loadServiceAccount();

// Guarded so a re-import (or a test importing a route) cannot throw
// "The default Firebase app already exists".
const app = getApps().length ? getApps()[0] : initializeApp({
  credential: cert(serviceAccount),
});

const auth = getAuth(app);

module.exports = { app, auth };
