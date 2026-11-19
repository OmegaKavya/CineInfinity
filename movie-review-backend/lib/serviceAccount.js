/**
 * Where the Firebase service account comes from.
 *
 * The credential used to be a bare require() of a JSON file, which meant a
 * deploy could not boot until somebody copied a secret onto the host by
 * hand, and a missing file failed with MODULE_NOT_FOUND rather than
 * anything that said what to do.
 *
 * Order of preference:
 *   1. FIREBASE_SERVICE_ACCOUNT  - the JSON itself, or base64 of it
 *   2. the local file            - convenient in development, never in git
 *
 * Base64 is accepted because the JSON contains newlines, and pasting it raw
 * into a dashboard field tends to mangle them.
 */
const fs = require("node:fs");
const path = require("node:path");

const REQUIRED = ["project_id", "client_email", "private_key"];

class ServiceAccountError extends Error {}

function parse(raw, source) {
  const text = raw.trim();

  // Base64 has no leading brace; JSON does.
  const decoded = text.startsWith("{")
    ? text
    : Buffer.from(text, "base64").toString("utf8");

  let parsed;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    throw new ServiceAccountError(
      `${source} is not valid JSON, and is not base64 of valid JSON.`
    );
  }

  const missing = REQUIRED.filter((field) => !parsed[field]);
  if (missing.length) {
    throw new ServiceAccountError(
      `${source} is missing: ${missing.join(", ")}. ` +
        "Download a fresh key from Firebase console, Project settings, Service accounts."
    );
  }

  // An environment variable cannot hold a real newline, so a pasted key
  // arrives with literal backslash-n and Firebase rejects it with an error
  // that says nothing about the cause.
  if (typeof parsed.private_key === "string") {
    parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
  }

  if (!parsed.private_key.includes("BEGIN PRIVATE KEY")) {
    throw new ServiceAccountError(
      `${source} has a private_key that does not look like a PEM key.`
    );
  }

  return parsed;
}

/**
 * @param {object} [options]
 * @param {object} [options.env] process.env by default, injectable for tests
 * @param {string} [options.filePath] where to look for the development file
 * @param {object} [options.fsImpl] node:fs by default
 */
function loadServiceAccount({
  env = process.env,
  filePath = path.join(__dirname, "..", "firebaseServiceAccount.json"),
  fsImpl = fs,
} = {}) {
  const fromEnv = env.FIREBASE_SERVICE_ACCOUNT;
  if (fromEnv && fromEnv.trim()) {
    return parse(fromEnv, "FIREBASE_SERVICE_ACCOUNT");
  }

  if (fsImpl.existsSync(filePath)) {
    return parse(fsImpl.readFileSync(filePath, "utf8"), path.basename(filePath));
  }

  throw new ServiceAccountError(
    "No Firebase service account found. Set FIREBASE_SERVICE_ACCOUNT to the " +
      "key's JSON (or base64 of it) for a deployment, or place " +
      `${path.basename(filePath)} beside the server for local development.`
  );
}

module.exports = { loadServiceAccount, ServiceAccountError };
