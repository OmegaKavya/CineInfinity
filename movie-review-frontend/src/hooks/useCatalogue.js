import { useEffect, useState } from 'react';
import { api, readableError } from '../api/client';
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

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError('');

    const load = async () => {
      if (name === 'anime') {
        const { results } = await popularAnime(1, 20);
        return results;
      }
      const { data } = await api.get(`/movies/discover/${name}`);
      return data.results || [];
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
  }, [name]);

  return { items, loading, error };
}
