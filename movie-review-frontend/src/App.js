import { useState } from 'react';
import MovieCard from './components/MovieCard';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import ReviewSection from './components/ReviewSection';
import Catalogue from './components/Catalogue';
import WatchOrder from './components/WatchOrder';
import { useAuth } from './context/AuthContext';
import { useMovieSearch } from './hooks/useMovieSearch';
import { useCatalogue } from './hooks/useCatalogue';
import './App.css';

/**
 * CineInfinity.
 *
 * This file was 452 lines holding fourteen pieces of useState: authentication,
 * search, autocomplete, keyboard navigation, review CRUD, inline editing, dark
 * mode, a dropdown menu, a slideshow timer and scroll position, all in one
 * component. Nothing could be tested without rendering the whole app, and
 * rendering the whole app fired network requests.
 *
 * What is left is composition. Authentication and theme live in context,
 * search, reviews and catalogues in hooks, everything visible in components
 * that take props.
 *
 * The whole catalogue used to sit behind a Google sign-in, so a visitor saw
 * one card in an empty page and nothing else. Browsing is open now and
 * authentication guards only what it has to: writing a review. That is how
 * every comparable site works, and it is the difference between a product
 * someone can look at and one they bounce off.
 */
export default function App() {
  const { user, loading, signIn } = useAuth();
  const search = useMovieSearch();

  const hollywood = useCatalogue('hollywood');
  const bollywood = useCatalogue('bollywood');
  const anime = useCatalogue('anime');

  // Which anime franchise the watch-order panel is currently explaining.
  const [franchise, setFranchise] = useState(null);

  // Firebase reports null before it has restored a session. Rendering the
  // signed-out view during that window flashed the login screen on every load
  // for anyone already signed in.
  if (loading) {
    return (
      <div className="app-container">
        <p className="loading-text">Loading…</p>
      </div>
    );
  }

  return (
    <div className="app-container">
      <Navbar search={search} />

      <Hero search={search} signedIn={Boolean(user)} onSignIn={signIn} />

      <main className="app-main">
        {search.error && (
          <p className="error-text" role="alert">{search.error}</p>
        )}

        {search.movie && (
          <section className="result-section" aria-label="Search result">
            <MovieCard movie={search.movie} />
            <ReviewSection movieId={search.movie.imdbID} />
          </section>
        )}

        {/* Anime leads. It is the only catalogue here that answers a
            question the others cannot, so it gets the top slot. */}
        <Catalogue
          title="Anime"
          subtitle="Pick a series to see what order to watch it in."
          items={anime.items}
          loading={anime.loading}
          error={anime.error}
          onSelect={setFranchise}
          spotlight
        />

        {franchise && (
          <WatchOrder anime={franchise} onClose={() => setFranchise(null)} />
        )}

        <Catalogue
          title="Hollywood"
          subtitle="Popular English-language cinema."
          items={hollywood.items}
          loading={hollywood.loading}
          error={hollywood.error}
          onSelect={(film) => search.openMovieByTitle?.(film.title, film.year)}
        />

        <Catalogue
          title="Bollywood"
          subtitle="Popular Hindi-language cinema."
          items={bollywood.items}
          loading={bollywood.loading}
          error={bollywood.error}
          onSelect={(film) => search.openMovieByTitle?.(film.title, film.year)}
        />
      </main>
    </div>
  );
}
