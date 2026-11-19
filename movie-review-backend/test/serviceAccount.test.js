const test = require("node:test");
const assert = require("node:assert");
const { loadServiceAccount, ServiceAccountError } = require("../lib/serviceAccount");

const PEM = "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n";

const account = {
  type: "service_account",
  project_id: "movie-e78c5",
  client_email: "sa@movie-e78c5.iam.gserviceaccount.com",
  private_key: PEM,
};

/** A stand-in for node:fs holding one file. */
const fakeFs = (contents) => ({
  existsSync: () => contents !== undefined,
  readFileSync: () => contents,
});

test("reads the account from the environment", () => {
  const loaded = loadServiceAccount({
    env: { FIREBASE_SERVICE_ACCOUNT: JSON.stringify(account) },
    fsImpl: fakeFs(undefined),
  });
  assert.strictEqual(loaded.project_id, "movie-e78c5");
});

test("accepts base64, since a pasted key tends to lose its newlines", () => {
  const encoded = Buffer.from(JSON.stringify(account)).toString("base64");
  const loaded = loadServiceAccount({
    env: { FIREBASE_SERVICE_ACCOUNT: encoded },
    fsImpl: fakeFs(undefined),
  });
  assert.strictEqual(loaded.client_email, account.client_email);
});

test("restores newlines that an environment variable turned into \\n", () => {
  // This is the classic deployment failure: the key arrives as one line of
  // literal backslash-n and Firebase rejects it without saying why.
  const flattened = { ...account, private_key: PEM.replace(/\n/g, "\\n") };
  const loaded = loadServiceAccount({
    env: { FIREBASE_SERVICE_ACCOUNT: JSON.stringify(flattened) },
    fsImpl: fakeFs(undefined),
  });
  assert.ok(loaded.private_key.includes("\n"));
  assert.ok(!loaded.private_key.includes("\\n"));
});

test("falls back to the local file when the environment is empty", () => {
  const loaded = loadServiceAccount({
    env: {},
    fsImpl: fakeFs(JSON.stringify(account)),
  });
  assert.strictEqual(loaded.project_id, "movie-e78c5");
});

test("the environment wins over the file", () => {
  const loaded = loadServiceAccount({
    env: { FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ ...account, project_id: "from-env" }) },
    fsImpl: fakeFs(JSON.stringify(account)),
  });
  assert.strictEqual(loaded.project_id, "from-env");
});

test("an empty variable is treated as absent, not as a broken key", () => {
  const loaded = loadServiceAccount({
    env: { FIREBASE_SERVICE_ACCOUNT: "   " },
    fsImpl: fakeFs(JSON.stringify(account)),
  });
  assert.strictEqual(loaded.project_id, "movie-e78c5");
});

test("says what to do when there is no credential at all", () => {
  assert.throws(
    () => loadServiceAccount({ env: {}, fsImpl: fakeFs(undefined) }),
    (error) => {
      assert.ok(error instanceof ServiceAccountError);
      assert.match(error.message, /FIREBASE_SERVICE_ACCOUNT/);
      assert.match(error.message, /local development/);
      return true;
    }
  );
});

test("names the missing fields rather than failing later inside Firebase", () => {
  const { client_email, ...incomplete } = account;
  assert.throws(
    () => loadServiceAccount({
      env: { FIREBASE_SERVICE_ACCOUNT: JSON.stringify(incomplete) },
      fsImpl: fakeFs(undefined),
    }),
    /client_email/
  );
});

test("rejects something that is neither JSON nor base64 of JSON", () => {
  assert.throws(
    () => loadServiceAccount({
      env: { FIREBASE_SERVICE_ACCOUNT: "not a key" },
      fsImpl: fakeFs(undefined),
    }),
    /not valid JSON/
  );
});

test("rejects a private_key that is not a PEM key", () => {
  assert.throws(
    () => loadServiceAccount({
      env: { FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ ...account, private_key: "xxx" }) },
      fsImpl: fakeFs(undefined),
    }),
    /PEM key/
  );
});
