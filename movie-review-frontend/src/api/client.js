import axios from 'axios';

/**
 * The single place that knows where the backend lives.
 *
 * The base URL previously sat inline in App.js with a production Render URL
 * as its fallback, which meant a developer who forgot to set the environment
 * variable silently wrote reviews to the live database while thinking they
 * were working locally. There is no fallback now: a missing value fails at
 * startup with a message saying what to set.
 */
const baseURL = import.meta.env.VITE_API_BASE_URL;

if (!baseURL) {
  throw new Error(
    'VITE_API_BASE_URL is not set. Copy .env.example to .env and point it at ' +
      'your backend (http://localhost:5000 for local development).'
  );
}

/**
 * Every route is mounted under /api on the server (/api/movies, /api/reviews,
 * /api/auth) while the calling code asks for '/movies/...'. That mismatch made
 * every request 404. The prefix belongs here rather than in each call.
 *
 * A deployment whose variable already ends in /api still works: the suffix is
 * stripped before being re-added, so both forms resolve to the same base.
 */
const origin = baseURL.replace(/\/+$/, '').replace(/\/api$/, '');

export const api = axios.create({
  baseURL: `${origin}/api`,
  timeout: 15000,
});

/**
 * Wake the backend and wait for it.
 *
 * The free instance sleeps after fifteen minutes idle and takes the better
 * part of a minute to start. Every normal request gives up at fifteen
 * seconds, so the first visitor after a quiet spell saw a timeout rather
 * than a slow page, and only the parts of the site that go through our
 * server broke, which made it look like those features were simply faulty.
 *
 * /health is outside /api and does nothing but answer, so this is the
 * cheapest way to find out whether the server is up and to start it if not.
 * Concurrent callers share one attempt.
 */
let waking = null;

export function wakeBackend() {
  if (!waking) {
    waking = axios
      .get(`${origin}/health`, { timeout: 90000 })
      .then(() => true)
      // Our /health answers 503 "degraded" while the database is still
      // connecting. That server is awake, and the anime and film routes do
      // not need the database. Read as asleep, it gave up on a running
      // server and remembered that for a minute.
      .catch((error) => error.response?.status === 503 && error.response.data?.status === 'degraded')
      .finally(() => {
        // Let a later call try again; the server may have slept since.
        setTimeout(() => { waking = null; }, 60000);
      });
  }
  return waking;
}

/**
 * The backend's tag on a 502 that means a service it calls failed, as
 * opposed to Render's 502 for an instance that is still starting. The
 * backend defines the same string in lib/upstream.js.
 */
const UPSTREAM_UNAVAILABLE = 'UPSTREAM_UNAVAILABLE';

/** True for the failures a sleeping or restarting instance produces. */
export function looksAsleep(error) {
  if (!error?.response) return true; // timeout, DNS, connection refused
  // Waking an awake server does not fix AniList or TMDb being down.
  if (error.response.data?.code === UPSTREAM_UNAVAILABLE) return false;
  return [502, 503, 504].includes(error.response.status);
}

/**
 * An error whose message was written for a visitor, and so may be shown.
 *
 * readableError used to show the message of any error that was not an HTTP
 * response, which put text like "Cannot read properties of undefined" in
 * front of visitors. Now only messages raised through this are shown.
 */
export function visitorError(message) {
  return Object.assign(new Error(message), { forVisitor: true });
}

/**
 * Authorization header for a Firebase user.
 *
 * Takes the user rather than reaching for module state, so callers cannot
 * accidentally send a request as whoever happened to be signed in last.
 */
export async function authHeaders(user) {
  if (!user) throw visitorError('You must be signed in to do that.');
  const token = await user.getIdToken();
  return { headers: { Authorization: `Bearer ${token}` } };
}

// Firebase codes, from getIdToken in authHeaders, that mean the session itself
// is over, so signing in again is the remedy. invalid-refresh-token is not in
// the SDK's own table and reaches here spelled from the server's
// INVALID_REFRESH_TOKEN. Other auth/* codes (too-many-requests,
// internal-error) would fail the same way after a fresh sign-in.
const SESSION_ENDED = new Set([
  'auth/user-token-expired',
  'auth/invalid-user-token',
  'auth/invalid-refresh-token',
  'auth/user-disabled',
  'auth/requires-recent-login',
]);

/**
 * Turn an axios failure into something worth showing a person.
 *
 * Every catch block in the old App.js produced its own near-identical string,
 * and all of them said "please try again" regardless of whether retrying
 * could possibly help.
 */
export function readableError(error, fallback = 'Something went wrong.') {
  if (error?.forVisitor) return error.message;
  if (error?.code === 'ECONNABORTED') {
    return 'The server took too long to respond. It may be waking up - try again in a moment.';
  }
  if (!error?.response) {
    // A Firebase message is a raw code, so it is translated rather than shown.
    if (SESSION_ENDED.has(error?.code)) return 'You need to sign in again to do that.';
    if (error?.code === 'auth/network-request-failed') {
      return 'Could not confirm your sign-in. Check your connection and try again.';
    }
    // Not an HTTP failure at all: a fault in our own code, or a Firebase one
    // that signing in again would not fix. Its message is for a developer.
    if (!error?.isAxiosError) return fallback;
    // No response usually means our free-tier server is asleep or starting,
    // not that the visitor's connection is at fault. Only say "offline"
    // when the browser says so.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return 'You appear to be offline. Check your connection.';
    }
    return 'The server is not answering. It runs on a free host that sleeps when idle; give it a minute and try again.';
  }
  if (error.response.data?.code === UPSTREAM_UNAVAILABLE) {
    return 'A service this site depends on is not answering. Try again in a moment.';
  }
  if ([502, 503, 504].includes(error.response.status)) {
    return 'The server is starting up or briefly unavailable. Give it a minute and try again.';
  }
  const { status, data } = error.response;
  if (status === 401 || status === 403) return 'You need to sign in again to do that.';
  if (status === 404) return 'Not found.';
  if (status === 429) return 'Too many requests. Give it a minute.';
  return data?.message || fallback;
}
