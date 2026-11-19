import { useCallback, useEffect, useState } from 'react';
import { api, authHeaders, readableError } from '../api/client';
import { useAuth } from '../context/AuthContext';

/**
 * The signed-in user's saved titles.
 *
 * Loads once per sign-in and keeps the set in memory, so a poster can ask
 * "am I saved?" without a request per card. Signing out empties it rather
 * than leaving the previous account's list on screen.
 */
export function useWatchlist() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Which ids have a request in flight, so a card can show its own pending
  // state without every other card going grey.
  const [pending, setPending] = useState(() => new Set());

  useEffect(() => {
    if (!user) {
      setItems([]);
      return undefined;
    }

    let current = true;
    setLoading(true);

    (async () => {
      try {
        const { data } = await api.get('/watchlist', await authHeaders(user));
        if (current) setItems(data.items || []);
      } catch (err) {
        if (current) setError(readableError(err, 'Could not load your watchlist.'));
      } finally {
        if (current) setLoading(false);
      }
    })();

    return () => {
      current = false;
    };
  }, [user]);

  const has = useCallback(
    (movieId) => items.some((item) => item.movieId === movieId),
    [items]
  );

  const markPending = (movieId, on) =>
    setPending((current) => {
      const next = new Set(current);
      if (on) next.add(movieId);
      else next.delete(movieId);
      return next;
    });

  /**
   * Save or unsave, chosen from what is currently stored.
   *
   * The list updates only after the server confirms. An optimistic toggle
   * would show a title as saved when the write had failed, and the next
   * reload would silently drop it.
   */
  const toggle = useCallback(
    async (film) => {
      if (!user || !film?.movieId) return false;
      const saved = items.some((item) => item.movieId === film.movieId);

      markPending(film.movieId, true);
      try {
        if (saved) {
          await api.delete(
            `/watchlist/${encodeURIComponent(film.movieId)}`,
            await authHeaders(user)
          );
          setItems((current) => current.filter((item) => item.movieId !== film.movieId));
        } else {
          const { data } = await api.post('/watchlist', film, await authHeaders(user));
          // A duplicate press returns no item; the list already holds it.
          if (data.item) setItems((current) => [data.item, ...current]);
        }
        setError('');
        return true;
      } catch (err) {
        setError(readableError(err, 'Could not update your watchlist.'));
        return false;
      } finally {
        markPending(film.movieId, false);
      }
    },
    [user, items]
  );

  return {
    items,
    loading,
    error,
    has,
    toggle,
    isPending: (movieId) => pending.has(movieId),
    count: items.length,
  };
}
