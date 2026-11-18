import { useCallback, useEffect, useState } from 'react';
import { api, authHeaders, readableError } from '../api/client';
import { useAuth } from '../context/AuthContext';

/**
 * Reviews for one film: load, add, edit, delete.
 *
 * Extracted from App.js, where review state and handlers were interleaved
 * with search and theme state in a single component.
 *
 * Three behaviours changed in the move.
 *
 * Reviews now load whenever the film changes. Previously they were fetched
 * only inside `fetchMovie`, so opening a film by clicking an autocomplete
 * suggestion - which went through a different code path - showed the
 * previous film's reviews until something else triggered a reload.
 *
 * Failures no longer leave the list in a half-updated state. Each mutation
 * applies to local state only after the server has confirmed it.
 *
 * And a stale film's reviews cannot land after you have moved on, via the
 * same cancellation guard used in the search hook.
 */
export function useReviews(movieId) {
  const { user } = useAuth();
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!movieId) {
      setReviews([]);
      return undefined;
    }

    let current = true;
    setLoading(true);

    api
      .get(`/reviews/${encodeURIComponent(movieId)}`)
      .then(({ data }) => {
        if (current) setReviews(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        if (current) setError(readableError(err, 'Could not load reviews.'));
      })
      .finally(() => {
        if (current) setLoading(false);
      });

    return () => {
      current = false;
    };
  }, [movieId]);

  const add = useCallback(
    async ({ rating, comment }) => {
      if (!comment.trim()) {
        setError('Write something before posting.');
        return false;
      }
      try {
        const { data } = await api.post(
          '/reviews',
          { movieId, rating, comment },
          await authHeaders(user)
        );
        setReviews((current) => [data.review, ...current]);
        setError('');
        return true;
      } catch (err) {
        setError(readableError(err, 'Could not post that review.'));
        return false;
      }
    },
    [movieId, user]
  );

  const edit = useCallback(
    async (reviewId, { rating, comment }) => {
      try {
        const { data } = await api.put(
          `/reviews/${reviewId}`,
          { rating, comment },
          await authHeaders(user)
        );
        setReviews((current) =>
          current.map((review) => (review._id === reviewId ? data.review : review))
        );
        setError('');
        return true;
      } catch (err) {
        setError(readableError(err, 'Could not save that change.'));
        return false;
      }
    },
    [user]
  );

  const remove = useCallback(
    async (reviewId) => {
      try {
        await api.delete(`/reviews/${reviewId}`, await authHeaders(user));
        setReviews((current) => current.filter((review) => review._id !== reviewId));
        setError('');
        return true;
      } catch (err) {
        setError(readableError(err, 'Could not delete that review.'));
        return false;
      }
    },
    [user]
  );

  /** Whether the signed-in user wrote this review, for showing edit controls. */
  const isMine = useCallback(
    (review) => Boolean(user) && review?.userId === user.uid,
    [user]
  );

  return { reviews, loading, error, add, edit, remove, isMine, clearError: () => setError('') };
}
