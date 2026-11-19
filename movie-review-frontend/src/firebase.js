import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";

/**
 * Firebase client configuration, read from the environment.
 *
 * On Firebase web API keys. These are not secrets. Google's own documentation
 * says so: the key identifies the project to Firebase's servers, it does not
 * authorise anything on its own, and it is necessarily visible in the built
 * bundle that ships to every browser. What actually protects the data is
 * Firebase Security Rules.
 *
 * This file used to hardcode the config and was then added to .gitignore to
 * "hide" it. That achieved nothing - the key still shipped in the bundle -
 * while making the repository impossible to clone and run, because the one
 * file needed to start the app was missing. Reading from the environment
 * instead keeps the file in version control, lets anyone configure their own
 * Firebase project from .env.example, and stops a non-secret being treated as
 * though it were one.
 *
 * Vite only exposes variables prefixed with VITE_ to client code, which is the
 * guard that keeps genuine server-side secrets out of the bundle.
 */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// Fail loudly at startup rather than with an opaque Firebase error on first
// sign-in attempt. A missing .env is the most likely reason a fresh clone
// does not work, so say that plainly.
const missing = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missing.length) {
  throw new Error(
    `Firebase config is incomplete: ${missing.join(", ")}. ` +
      `Copy .env.example to .env and fill in your Firebase project's values.`
  );
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

export { auth, provider };

/** Sign in with Google. Returns the user, or null if the popup failed. */
/**
 * What a Firebase auth code means to the person who pressed the button.
 *
 * The raw codes are addressed to the developer: "auth/unauthorized-domain"
 * tells a visitor nothing, and it is a configuration fault they cannot act
 * on, so it must not read as though they did something wrong.
 */
function readableAuthError(error) {
  switch (error?.code) {
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      // They closed it themselves. Not an error worth shouting about.
      return null;
    case "auth/popup-blocked":
      return "Your browser blocked the sign-in window. Allow pop-ups for this site and try again.";
    case "auth/unauthorized-domain":
      return "Sign-in is not configured for this address yet. This is a server-side setting, not something you did.";
    case "auth/network-request-failed":
      return "Could not reach Google. Check your connection and try again.";
    default:
      return "Sign-in failed. Try again in a moment.";
  }
}

/**
 * Sign in with Google.
 *
 * This used to catch the failure, log it to the console and return null. The
 * caller could not tell a refusal from a success, so the button did nothing
 * visible and looked broken, which is exactly how an unauthorized-domain
 * misconfiguration presented: a dead button and a console message no
 * visitor reads. It throws now, with a message meant for a person.
 */
export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (error) {
    const message = readableAuthError(error);
    // A cancelled popup is not a failure state; resolve quietly.
    if (message === null) return null;

    const friendly = new Error(message);
    friendly.code = error?.code;
    throw friendly;
  }
};

/** Sign the current user out. */
export const logout = async () => {
  await signOut(auth);
};
