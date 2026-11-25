import { useEffect, useState } from 'react';
import { api, looksAsleep, readableError, wakeBackend } from '../api/client';
import { popularAnime } from '../api/anilist';

/**
 * Load one browsable catalogue.
 *
 * Hollywood and Bollywood come from our backend, which holds the TMDb key.
 * Anime comes straight from AniList, which needs no key and is the only
 * source carrying the relation edges the watch-order feature reads.
 *
 * Each catalogue loads independently, so a failure in one leaves the other
 * two on screen rather than emptying the page.
 */
export function useCatalogue(name) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError('');

    const load = async () => {
      if (name === 'anime') {
        const { results } = await popularAnime(1, 20);
        return results;
      }
      // The film rows come from our backend, which sleeps when idle. The
      // anime client already woke it and retried; these rows gave up on the
      // first timeout, so the first visitor after a quiet spell got an error
      // for a server that was merely starting.
      try {
        const { data } = await api.get(`/movies/discover/${name}`);
        return data.results || [];
      } catch (err) {
        if (!looksAsleep(err) || !(await wakeBackend())) throw err;
        const { data } = await api.get(`/movies/discover/${name}`, { timeout: 45000 });
        return data.results || [];
      }
    };

    load()
      .then((results) => current && setItems(results))
      .catch((err) =>
        current && setError(readableError(err, `Could not load the ${name} catalogue.`))
      )
      .finally(() => current && setLoading(false));

    return () => {
      current = false;
    };
  }, [name, attempt]);

  return { items, loading, error, retry: () => setAttempt((n) => n + 1) };
}
