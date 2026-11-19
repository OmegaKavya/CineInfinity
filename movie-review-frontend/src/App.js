import { Route, Routes } from 'react-router-dom';
import Navbar from './components/Navbar';
import AuthError from './components/AuthError';
import HomePage from './pages/HomePage';
import FilmPage from './pages/FilmPage';
import AnimePage from './pages/AnimePage';
import SearchPage from './pages/SearchPage';
import HowPage from './pages/HowPage';
import YouPage from './pages/YouPage';
import { useAuth } from './context/AuthContext';
import { useMovieSearch } from './hooks/useMovieSearch';
import './App.css';

/**
 * CineInfinity.
 *
 * This file was 452 lines holding fourteen pieces of useState. What is left
 * is a router: the shell, and five addresses.
 *
 * Routing replaced a single page that kept the current film in state behind
 * a "?film=" parameter. That worked for sharing a link and for nothing else:
 * the back button left the app, a film could not be linked to from inside
 * it, and every destination shared one scroll position.
 *
 * Authentication guards exactly one route. Browsing, searching, reading
 * reviews and the watch-order resolver are open to everyone, because a
 * visitor who has to sign in to see anything does not sign in.
 */
export default function App() {
  const { loading } = useAuth();
  // The navbar's search is its own, independent of whatever a page is doing,
  // so typing in it never disturbs the film being read.
  const search = useMovieSearch();

  // Firebase reports null before it has restored a session. Rendering the
  // signed-out view during that window flashed the login state on every load
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
      <AuthError />

      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/film/:imdbID" element={<main className="app-main app-main--page"><FilmPage /></main>} />
        <Route path="/anime/:id" element={<AnimePage />} />
        <Route path="/search" element={<main className="app-main app-main--page"><SearchPage /></main>} />
        <Route path="/how" element={<main className="app-main app-main--page"><HowPage /></main>} />
        <Route path="/you" element={<main className="app-main app-main--page"><YouPage /></main>} />
        <Route
          path="*"
          element={
            <main className="app-main app-main--page">
              <p className="page-state">That page does not exist.</p>
            </main>
          }
        />
      </Routes>
    </div>
  );
}
