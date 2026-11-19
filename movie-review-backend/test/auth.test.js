// requireAuth is the gate on every write endpoint. It is tested against a
// stubbed verifier rather than Firebase: the thing worth checking is how the
// middleware behaves around the token, not that Google can validate one.
const test = require("node:test");
const assert = require("node:assert");
const Module = require("node:module");

// Swap the Firebase config module for a stub before auth.js requires it.
const verified = [];
let verifier = async () => ({ uid: "user-1", name: "Kavya" });
// Null means Firebase initialised; set it to an Error to simulate a server
// deployed without a credential.
let firebaseFault = null;

const realResolve = Module._resolveFilename;
const realLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request.endsWith("config/firebase")) {
    return {
      // config/firebase also exports authError(): the routes call it to tell
      // a credential fault apart from a bad token. A stub missing it made
      // every authenticated request throw a 500 instead of failing the way
      // the test meant to exercise.
      authError: () => firebaseFault,
      authAvailable: () => firebaseFault === null,
      auth: {
        verifyIdToken: (...args) => {
          verified.push(args);
          return verifier(...args);
        },
      },
    };
  }
  return realLoad.call(this, request, parent, isMain);
};

const { requireAuth } = require("../middleware/auth");
Module._load = realLoad;
Module._resolveFilename = realResolve;

function call(headerValue) {
  const req = {
    get: (name) => (name.toLowerCase() === "authorization" ? headerValue : undefined),
  };
  const out = { status: null, payload: null, passed: false };
  const res = {
    status(code) {
      out.status = code;
      return { json: (payload) => { out.payload = payload; } };
    },
  };
  return requireAuth(req, res, () => { out.passed = true; }).then(() => ({ ...out, req }));
}

test("a request with no Authorization header is refused", async () => {
  const out = await call(undefined);
  assert.strictEqual(out.passed, false);
  assert.strictEqual(out.status, 401);
});

test("a header that is not a Bearer token is refused", async () => {
  for (const header of ["", "Basic abc", "Bearer", "token abc"]) {
    const out = await call(header);
    assert.strictEqual(out.passed, false, `"${header}" should not authenticate`);
    assert.strictEqual(out.status, 401);
  }
});

test("a valid token authenticates and attaches the user", async () => {
  verifier = async () => ({ uid: "user-1", name: "Kavya" });
  const out = await call("Bearer good-token");
  assert.ok(out.passed);
  assert.strictEqual(out.req.user.uid, "user-1");
});

test("the token is checked for revocation, not just signature", async () => {
  // verifyIdToken's second argument is checkRevoked. Without it a token
  // stays usable after the account is disabled or the session revoked.
  verified.length = 0;
  verifier = async () => ({ uid: "user-1" });
  await call("Bearer good-token");
  assert.strictEqual(verified[0][0], "good-token");
  assert.strictEqual(verified[0][1], true, "checkRevoked should be true");
});

test("a rejected token produces 401, never a 500", async () => {
  verifier = async () => {
    throw new Error("Firebase ID token has expired");
  };
  const out = await call("Bearer expired-token");
  assert.strictEqual(out.passed, false);
  assert.strictEqual(out.status, 401);
  assert.ok(!/expired/i.test(JSON.stringify(out.payload).replace(/expired authentication/i, "")),
    "the upstream error text should not be echoed to the caller");
});

// A server deployed without a working Firebase credential used to die at
// require time, taking the whole public API with it. It now boots and refuses
// only the authenticated routes, so these pin that behaviour down.
test("a server with no Firebase credential refuses auth with 503, not 401", async () => {
  firebaseFault = new Error("No Firebase service account found.");
  try {
    const out = await call("Bearer good-token");
    assert.strictEqual(out.passed, false);
    // 401 would tell the user their session expired and send them to sign in
    // again, which cannot work; 503 says the fault is the server's.
    assert.strictEqual(out.status, 503);
    assert.match(out.payload.error, /unavailable/i);
  } finally {
    firebaseFault = null;
  }
});

test("a credential fault is reported even when no token was sent", async () => {
  firebaseFault = new Error("No Firebase service account found.");
  try {
    const out = await call(undefined);
    assert.strictEqual(out.status, 503);
  } finally {
    firebaseFault = null;
  }
});

test("a working credential still authenticates normally", async () => {
  // Earlier tests reassign the shared verifier, so restore a passing one
  // rather than depending on file order.
  verifier = async () => ({ uid: "user-1", name: "Kavya" });
  const out = await call("Bearer good-token");
  assert.strictEqual(out.passed, true);
  assert.strictEqual(out.status, null);
});
