import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, readableError } from '../api/client';

/**
 * Search across what people wrote, rather than across film titles.
 *
 * The title search in the navbar asks OMDb. This asks the database, which is
 * the only thing here that can answer "who mentioned the ending" or "what did
 * people say about the score".
 */
export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const query = params.get('q') || '';
  const [draft, setDraft] = useState(query);
  const [state, setState] = useState({ items: [], total: 0, loading: false, error: '' });

  useEffect(() => setDraft(query), [query]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setState({ items: [], total: 0, loading: false, error: '' });
      return undefined;
    }

    let current = true;
    setState((s) => ({ ...s, loading: true }));

    api
      .get('/reviews/search', { params: { q: query, limit: 20 } })
      .then(({ data }) => {
        if (current) setState({ items: data.items, total: data.total, loading: false, error: '' });
      })
      .catch((err) => {
        if (current) {
          setState({ items: [], total: 0, loading: false, error: readableError(err, 'Search failed.') });
        }
      });

    return () => {
      current = false;
    };
  }, [query]);

  return (
    <section className="search-page">
      <h2>Search reviews</h2>
      <p className="signal__status">
        Looks inside what people wrote, not just film titles.
      </p>

      <form
        className="search-page__form"
        onSubmit={(event) => {
          event.preventDefault();
          setParams(draft.trim() ? { q: draft.trim() } : {});
        }}
      >
        <input
          type="search"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="practical effects, the ending, the score…"
          aria-label="Search reviews"
        />
        <button type="submit">Search</button>
      </form>

      {state.loading && <p className="signal__status">Searching…</p>}
      {state.error && <p className="error-text" role="alert">{state.error}</p>}

      {!state.loading && query.trim().length >= 2 && (
        <p className="signal__status">
          {state.total === 0
            ? `Nothing mentions "${query}" yet.`
            : `${state.total} review${state.total === 1 ? '' : 's'} mention "${query}".`}
        </p>
      )}

      <ul className="search-page__results">
        {state.items.map((review) => (
          <li key={review._id}>
            <Link to={`/film/${review.movieId}`} className="search-page__film">
              {review.title || review.movieId}
            </Link>
            <span className="search-page__meta">
              {review.username} rated it {review.rating}/10
            </span>
            <p>{review.comment}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
