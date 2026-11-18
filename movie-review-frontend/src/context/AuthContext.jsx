import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { auth, signInWithGoogle, logout } from '../firebase';

/**
 * Firebase auth state, in one place.
 *
 * Two things this fixes.
 *
 * The subscription is now cleaned up. The old code called
 * `auth.onAuthStateChanged(...)` inside a useEffect and returned only the
 * scroll listener's cleanup, so the auth listener was never unsubscribed -
 * a leak that compounds under React 18's StrictMode double-mount and in
 * tests.
 *
 * And `loading` is distinguishable from `signed out`. Firebase reports null
 * before it has restored a session, so the old code rendered the signed-out
 * view for a moment on every load, then flipped. Anything gated on auth
 * should wait for `loading` to clear rather than flashing the wrong UI.
 */
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const value = useMemo(
    () => ({ user, loading, signIn: signInWithGoogle, signOut: logout }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside an <AuthProvider>.');
  }
  return context;
}
