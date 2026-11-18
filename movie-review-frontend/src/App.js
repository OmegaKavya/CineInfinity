import { useState } from 'react';
import MovieCard from './components/MovieCard';
import Navbar from './components/Navbar';
import HeroSlider from './components/HeroSlider';
import SearchBar from './components/SearchBar';
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

      {!user ? (
        <div className="login-page fade-in">
          <HeroSlider />
          <div className="overlay" />
          <div className="login-content">
            <h1>Welcome to CineInfinity 🎬</h1>
            <p>Reviews, ratings, and an answer to &ldquo;what order do I watch this in?&rdquo;</p>
            <button type="button" className="auth-button pulse-effect" onClick={signIn}>
              Sign in to continue
            </button>
          </div>
        </div>
      ) : (
        <>
          <section className="search-section smooth-scroll">
            <h2 className="search-title">Find a film</h2>
            <div className="search-container">
              <SearchBar
                search={search}
                className="search-input"
                id="main-search"
                placeholder="🔍 Search for a film…"
              />
              <button
                type="button"
                className="search-button"
                onClick={search.searchByTitle}
                disabled={search.searching}
              >
                {search.searching ? 'Searching…' : '🎥 Find'}
              </button>
            </div>
          </section>

          {search.error && (
            <p className="error-text" role="alert">{search.error}</p>
          )}

          {search.movie && (
            <>
              <MovieCard movie={search.movie} />
              <ReviewSection movieId={search.movie.imdbID} />
            </>
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
            onSelect={(film) => search.openMovieByTitle?.(film.title)}
          />

          <Catalogue
            title="Bollywood"
            subtitle="Popular Hindi-language cinema."
            items={bollywood.items}
            loading={bollywood.loading}
            error={bollywood.error}
            onSelect={(film) => search.openMovieByTitle?.(film.title)}
          />
        </>
      )}
    </div>
  );
}
