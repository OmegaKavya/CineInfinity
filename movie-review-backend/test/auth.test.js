// requireAuth is the gate on every write endpoint. It is tested against a
// stubbed verifier rather than Firebase: the thing worth checking is how the
// middleware behaves around the token, not that Google can validate one.
const test = require("node:test");
const assert = require("node:assert");
const Module = require("node:module");

// Swap the Firebase config module for a stub before auth.js requires it.
const verified = [];
let verifier = async () => ({ uid: "user-1", name: "Kavya" });

const realResolve = Module._resolveFilename;
const realLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request.endsWith("config/firebase")) {
    return {
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
