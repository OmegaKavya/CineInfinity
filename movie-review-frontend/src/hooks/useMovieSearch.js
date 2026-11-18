import { useCallback, useRef, useState } from 'react';
import { api, readableError } from '../api/client';
import { useDebounce } from './useDebounce';

/**
 * Search, autocomplete and keyboard navigation for the movie search box.
 *
 * Pulled out of App.js, where it was five pieces of useState and four
 * handlers tangled together with review editing and dark mode.
 *
 * Besides the move, two behaviours changed.
 *
 * Responses are now matched against the query that asked for them. The old
 * code set `suggestions` from whatever came back last, so a slow response for
 * "bat" could overwrite a fast one for "batman" and leave the list showing
 * results for something the user had already finished typing. A sequence
 * number discards anything that is not the newest request.
 *
 * And the selected-suggestion index resets when the list changes. It was kept
 * across updates, so pressing Enter could open whatever film now happened to
 * sit at the remembered position.
 */
export function useMovieSearch() {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [movie, setMovie] = useState(null);
  const [error, setError] = useState('');
  const [searching, setSearching] = useState(false);

  // Monotonic request counter: only the most recent response may apply.
  const requestId = useRef(0);

  const fetchSuggestions = useCallback(async (text) => {
    const trimmed = text.trim();
    if (!trimmed) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const id = ++requestId.current;
    try {
      const { data } = await api.get('/movies/omdb/search', {
        params: { query: trimmed },
      });
      if (id !== requestId.current) return; // a newer query has overtaken this

      const results = (data?.Search || []).map((item) => ({
        imdbID: item.imdbID,
        title: item.Title,
        year: item.Year,
      }));
      setSuggestions(results);
      setShowSuggestions(results.length > 0);
      setActiveIndex(-1);
    } catch {
      if (id !== requestId.current) return;
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, []);

  const [debouncedFetch, cancelFetch] = useDebounce(fetchSuggestions, 300);

  const openMovie = useCallback(
    async (imdbID) => {
      cancelFetch();
      setSearching(true);
      try {
        const { data } = await api.get('/movies/omdb/details', {
          params: { imdbID },
        });
        setMovie(data);
        setError('');
      } catch (err) {
        setError(readableError(err, 'Could not load that film.'));
      } finally {
        setSearching(false);
        setQuery('');
        setSuggestions([]);
        setShowSuggestions(false);
        setActiveIndex(-1);
      }
    },
    [cancelFetch]
  );

  const searchByTitle = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed) {
      setError('Type a film title first.');
      return;
    }
    cancelFetch();
    setSearching(true);
    try {
      const { data } = await api.get(`/movies/omdb/${encodeURIComponent(trimmed)}`);
      if (data?.Title) {
        setMovie(data);
        setError('');
      } else {
        setMovie(null);
        setError('No film by that name. Try a different spelling.');
      }
    } catch (err) {
      setMovie(null);
      setError(readableError(err, 'The search failed.'));
    } finally {
      setSearching(false);
      setQuery('');
      setShowSuggestions(false);
      setActiveIndex(-1);
    }
  }, [query, cancelFetch]);

  const onQueryChange = useCallback(
    (text) => {
      setQuery(text);
      debouncedFetch(text);
    },
    [debouncedFetch]
  );

  /** Arrow keys move through suggestions; Enter opens; Escape dismisses. */
  const onKeyDown = useCallback(
    (event) => {
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
          break;
        case 'ArrowUp':
          event.preventDefault();
          setActiveIndex((i) => Math.max(i - 1, -1));
          break;
        case 'Enter':
          event.preventDefault();
          if (activeIndex >= 0 && suggestions[activeIndex]) {
            openMovie(suggestions[activeIndex].imdbID);
          } else {
            searchByTitle();
          }
          break;
        case 'Escape':
          setShowSuggestions(false);
          setActiveIndex(-1);
          break;
        default:
          break;
      }
    },
    [activeIndex, suggestions, openMovie, searchByTitle]
  );

  return {
    query,
    suggestions,
    showSuggestions,
    activeIndex,
    movie,
    error,
    searching,
    onQueryChange,
    onKeyDown,
    openMovie,
    searchByTitle,
    setShowSuggestions,
    clearError: () => setError(''),
  };
}
