import { useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import MovieCard from '../components/MovieCard';
import ReviewSection from '../components/ReviewSection';
import WatchlistButton from '../components/WatchlistButton';
import { useMovieSearch } from '../hooks/useMovieSearch';

/**
 * One film at one address.
 *
 * Previously a film was a piece of state behind "?film=tt0110357" on a single
 * page, which meant the back button left the app entirely and a film could
 * not be linked to from inside it. It is a route now, so the browser handles
 * history and a title is something you can send someone.
 */
export default function FilmPage() {
  const { imdbID } = useParams();
  const search = useMovieSearch();

  useEffect(() => {
    if (imdbID) search.openMovie(imdbID);
    // Only the id should retrigger this. Including the hook object would
    // refetch on every render, since it is rebuilt each time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imdbID]);

  useEffect(() => {
    document.title = search.movie?.Title
      ? `${search.movie.Title} - CineInfinity`
      : 'CineInfinity';
    return () => {
      document.title = 'CineInfinity';
    };
  }, [search.movie]);

  if (search.error) {
    return (
      <div className="page-state">
        <p className="error-text" role="alert">{search.error}</p>
        <Link to="/" className="page-state__back">Back to browsing</Link>
      </div>
    );
  }

  if (!search.movie) {
    return <p className="page-state">Loading that film…</p>;
  }

  const film = search.movie;

  return (
    <article className="film-page">
      <MovieCard movie={film} />

      <div className="film-page__actions">
        <WatchlistButton
          film={{
            movieId: film.imdbID,
            title: film.Title,
            year: film.Year,
            poster: film.Poster !== 'N/A' ? film.Poster : undefined,
          }}
        />
      </div>

      <ReviewSection movieId={film.imdbID} film={film} />
    </article>
  );
}
