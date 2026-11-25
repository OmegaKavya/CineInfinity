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
      .catch(() => false)
      .finally(() => {
        // Let a later call try again; the server may have slept since.
        setTimeout(() => { waking = null; }, 60000);
      });
  }
  return waking;
}

/** True for the failures a sleeping or restarting instance produces. */
export function looksAsleep(error) {
  if (!error?.response) return true; // timeout, DNS, connection refused
  return [502, 503, 504].includes(error.response.status);
}

/**
 * Authorization header for a Firebase user.
 *
 * Takes the user rather than reaching for module state, so callers cannot
 * accidentally send a request as whoever happened to be signed in last.
 */
export async function authHeaders(user) {
  if (!user) throw new Error('You must be signed in to do that.');
  const token = await user.getIdToken();
  return { headers: { Authorization: `Bearer ${token}` } };
}

/**
 * Turn an axios failure into something worth showing a person.
 *
 * Every catch block in the old App.js produced its own near-identical string,
 * and all of them said "please try again" regardless of whether retrying
 * could possibly help.
 */
export function readableError(error, fallback = 'Something went wrong.') {
  if (error?.code === 'ECONNABORTED') {
    return 'The server took too long to respond. It may be waking up - try again in a moment.';
  }
  if (!error?.response) {
    // Not an HTTP failure at all: an Error raised by our own code (the
    // AniList client's "server was asleep" message, for one) already says
    // what happened, and replacing it with a generic line threw that away.
    if (!error?.isAxiosError && error?.message) return error.message;
    // No response usually means our free-tier server is asleep or starting,
    // not that the visitor's connection is at fault. Only say "offline"
    // when the browser says so.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return 'You appear to be offline. Check your connection.';
    }
    return 'The server is not answering. It runs on a free host that sleeps when idle; give it a minute and try again.';
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
