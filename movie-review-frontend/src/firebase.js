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
export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (error) {
    console.error("Google sign-in failed:", error.message);
    return null;
  }
};

/** Sign the current user out. */
export const logout = async () => {
  await signOut(auth);
};
