import MovieCard from './components/MovieCard';
import Navbar from './components/Navbar';
import HeroSlider from './components/HeroSlider';
import SearchBar from './components/SearchBar';
import ReviewSection from './components/ReviewSection';
import { useAuth } from './context/AuthContext';
import { useMovieSearch } from './hooks/useMovieSearch';
import './App.css';

/**
 * CineInfinity.
 *
 * This file was 452 lines holding fourteen pieces of useState: authentication,
 * search, autocomplete, keyboard navigation, review CRUD, inline editing,
 * dark mode, a dropdown menu, a slideshow timer and scroll position, all in
 * one component. Nothing could be tested without rendering the whole app, and
 * rendering the whole app meant firing network requests, which is why the
 * existing component test hangs.
 *
 * What is left here is composition. Authentication and theme live in context,
 * search and reviews in hooks, and everything visible in a component that
 * takes props. Each of those can be exercised on its own.
 */
export default function App() {
  const { user, loading, signIn } = useAuth();
  const search = useMovieSearch();

  // Firebase reports null before it has restored a session. Rendering the
  // signed-out view during that window made the login screen flash on every
  // load for anyone already signed in.
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
            <p>Reviews, ratings and a search that actually finds things.</p>
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
            <p className="error-text" role="alert">
              {search.error}
            </p>
          )}

          {search.movie && (
            <>
              <MovieCard movie={search.movie} />
              <ReviewSection movieId={search.movie.imdbID} />
            </>
          )}
        </>
      )}
    </div>
  );
}
