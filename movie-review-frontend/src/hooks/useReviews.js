import { useCallback, useEffect, useRef, useState } from 'react';
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
const PAGE_SIZE = 10;

export function useReviews(movieId, film) {
  const { user } = useAuth();
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  // The film's average and how many reviews exist in total, which the server
  // now computes over every row rather than over the page in hand.
  const [summary, setSummary] = useState({ total: 0, average: null, hasMore: false });
  const page = useRef(1);

  useEffect(() => {
    if (!movieId) {
      setReviews([]);
      setSummary({ total: 0, average: null, hasMore: false });
      return undefined;
    }

    let current = true;
    page.current = 1;
    setLoading(true);

    api
      .get(`/reviews/${encodeURIComponent(movieId)}`, { params: { page: 1, limit: PAGE_SIZE } })
      .then(({ data }) => {
        if (!current) return;
        setReviews(data.items || []);
        setSummary({
          total: data.total || 0,
          average: data.average ?? null,
          hasMore: Boolean(data.hasMore),
        });
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

  /**
   * Append the next page.
   *
   * Appending rather than replacing, and guarded against a second press
   * while one is already in flight, which would otherwise request the same
   * page twice and show every review on it twice.
   */
  const loadMore = useCallback(async () => {
    if (!movieId || loadingMore || !summary.hasMore) return;
    setLoadingMore(true);
    try {
      const next = page.current + 1;
      const { data } = await api.get(`/reviews/${encodeURIComponent(movieId)}`, {
        params: { page: next, limit: PAGE_SIZE },
      });
      page.current = next;
      setReviews((current) => {
        // A review written since the first page loaded shifts everything down
        // one, so the same row can arrive on two pages. Keyed by id, the
        // duplicate is dropped instead of rendering twice.
        const seen = new Set(current.map((r) => r._id));
        return [...current, ...(data.items || []).filter((r) => !seen.has(r._id))];
      });
      setSummary((s) => ({ ...s, hasMore: Boolean(data.hasMore), total: data.total ?? s.total }));
    } catch (err) {
      setError(readableError(err, 'Could not load more reviews.'));
    } finally {
      setLoadingMore(false);
    }
  }, [movieId, loadingMore, summary.hasMore]);

  const add = useCallback(
    async ({ rating, comment }) => {
      if (!comment.trim()) {
        setError('Write something before posting.');
        return false;
      }
      try {
        const { data } = await api.post(
          '/reviews',
          {
            movieId,
            rating,
            comment,
            // Carried so feeds and the decade breakdown can render without
            // one upstream call per row.
            title: film?.Title,
            year: film?.Year,
            poster: film?.Poster && film.Poster !== 'N/A' ? film.Poster : undefined,
          },
          await authHeaders(user)
        );
        setReviews((current) => [data.review, ...current]);
        setSummary((s) => ({ ...s, total: s.total + 1 }));
        setError('');
        return true;
      } catch (err) {
        setError(readableError(err, 'Could not post that review.'));
        return false;
      }
    },
    [movieId, user, film]
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
        setSummary((s) => ({ ...s, total: Math.max(0, s.total - 1) }));
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

  return {
    reviews, loading, loadingMore, error, add, edit, remove, isMine, loadMore,
    total: summary.total,
    average: summary.average,
    hasMore: summary.hasMore,
    clearError: () => setError(''),
  };
}
