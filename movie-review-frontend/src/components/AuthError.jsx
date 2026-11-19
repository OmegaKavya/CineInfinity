import { useAuth } from '../context/AuthContext';

/**
 * A failed sign-in, shown to the person who tried.
 *
 * Rendered once in the shell rather than per button, because the three
 * places that offer sign-in should not each carry their own copy of this,
 * and a failure should be visible wherever it happened.
 */
export default function AuthError() {
  const { authError, clearAuthError } = useAuth();
  if (!authError) return null;

  return (
    <div className="auth-error" role="alert">
      <p>{authError}</p>
      <button type="button" onClick={clearAuthError} aria-label="Dismiss">
        ✕
      </button>
    </div>
  );
}
