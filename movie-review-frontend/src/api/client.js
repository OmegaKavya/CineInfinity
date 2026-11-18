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

export const api = axios.create({
  baseURL: baseURL.replace(/\/+$/, ''),
  timeout: 15000,
});

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
    return 'Could not reach the server. Check your connection.';
  }
  const { status, data } = error.response;
  if (status === 401 || status === 403) return 'You need to sign in again to do that.';
  if (status === 404) return 'Not found.';
  if (status === 429) return 'Too many requests. Give it a minute.';
  return data?.message || fallback;
}
