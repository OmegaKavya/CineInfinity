import { useAuth } from '../context/AuthContext';
import { useWatchlistContext } from '../context/WatchlistContext';

/**
 * Save or unsave a film.
 *
 * Signed out, it is the one place in the app that asks for a sign-in, and it
 * says what signing in buys rather than just demanding one. Nothing else is
 * gated: browsing, searching and reading reviews never meet this.
 */
export default function WatchlistButton({ film, compact = false }) {
  const { user, signIn } = useAuth();
  const { has, toggle, isPending } = useWatchlistContext();

  if (!user) {
    return (
      <button
        type="button"
        className={`watchlist-button ${compact ? 'is-compact' : ''}`}
        onClick={signIn}
      >
        Sign in to save
      </button>
    );
  }

  const saved = has(film.movieId);
  const busy = isPending(film.movieId);

  return (
    <button
      type="button"
      className={`watchlist-button ${saved ? 'is-saved' : ''} ${compact ? 'is-compact' : ''}`}
      onClick={() => toggle(film)}
      disabled={busy}
      aria-pressed={saved}
    >
      {busy ? 'Saving…' : saved ? '✓ On your watchlist' : '+ Watchlist'}
    </button>
  );
}
