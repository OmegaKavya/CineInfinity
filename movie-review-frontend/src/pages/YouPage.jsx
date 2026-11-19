import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Signal from '../components/Signal';
import { useAuth } from '../context/AuthContext';
import { useWatchlistContext } from '../context/WatchlistContext';
import { api, authHeaders, readableError } from '../api/client';

/**
 * The signed-in half of the app, and the only part that needs an account.
 *
 * Browsing, searching, reading reviews and the watch-order resolver are all
 * open. Signing in adds a watchlist, your own reviews in one place, and Your
 * Signal, which cannot exist without knowing whose ratings they are.
 */
export default function YouPage() {
  const { user, signIn, signingIn } = useAuth();
  const { items: watchlist, loading: watchlistLoading } = useWatchlistContext();
  const [mine, setMine] = useState({ items: [], total: 0, loading: true, error: '' });

  useEffect(() => {
    if (!user) return undefined;
    let current = true;

    (async () => {
      try {
        const { data } = await api.get('/reviews/me/reviews', {
          ...(await authHeaders(user)),
          params: { limit: 20 },
        });
        if (current) setMine({ items: data.items, total: data.total, loading: false, error: '' });
      } catch (err) {
        if (current) {
          setMine((s) => ({ ...s, loading: false, error: readableError(err, 'Could not load your reviews.') }));
        }
      }
    })();

    return () => {
      current = false;
    };
  }, [user]);

  if (!user) {
    return (
      <section className="page-state page-state--gate">
        <h2>Sign in to see your signal</h2>
        <p>
          Everything else here is open. An account adds three things: a
          watchlist, your reviews in one place, and a reading of how your
          ratings compare with everyone else's.
        </p>
        <button type="button" className="auth-button" onClick={signIn} disabled={signingIn}>
          {signingIn ? 'Opening Google…' : 'Sign in with Google'}
        </button>
      </section>
    );
  }

  return (
    <div className="you-page">
      <Signal />

      <section className="you-section">
        <h2>Your watchlist</h2>
        {watchlistLoading && <p className="signal__status">Loading…</p>}
        {!watchlistLoading && watchlist.length === 0 && (
          <p className="signal__status">
            Nothing saved yet. Open a film and press Watchlist.
          </p>
        )}
        <ul className="you-grid">
          {watchlist.map((item) => (
            <li key={item.movieId}>
              <Link to={`/film/${item.movieId}`} className="you-grid__item">
                {item.poster ? (
                  <img src={item.poster} alt="" loading="lazy" />
                ) : (
                  <span className="you-grid__blank" aria-hidden="true">🎬</span>
                )}
                <span className="you-grid__title">{item.title}</span>
                {item.year && <span className="you-grid__year">{item.year}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="you-section">
        <h2>Your reviews {mine.total > 0 && <small>({mine.total})</small>}</h2>
        {mine.loading && <p className="signal__status">Loading…</p>}
        {mine.error && <p className="error-text" role="alert">{mine.error}</p>}
        {!mine.loading && !mine.error && mine.items.length === 0 && (
          <p className="signal__status">You have not written any reviews yet.</p>
        )}
        <ul className="you-reviews">
          {mine.items.map((review) => (
            <li key={review._id}>
              <Link to={`/film/${review.movieId}`} className="you-reviews__film">
                {review.title || review.movieId}
              </Link>
              <span className="you-reviews__rating">{review.rating}/10</span>
              <p>{review.comment}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
