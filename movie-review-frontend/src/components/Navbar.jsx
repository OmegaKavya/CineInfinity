import { useEffect, useRef, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import SearchBar from './SearchBar';

/**
 * Top bar: wordmark, search, theme toggle, account menu.
 *
 * The profile dropdown now closes when you click elsewhere or press Escape.
 * Previously it could only be dismissed by clicking the avatar again, so it
 * stayed open over whatever you were reading.
 */
export default function Navbar({ search }) {
  const { user, signIn, signOut } = useAuth();
  const { isDark, toggle } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onPointerDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setMenuOpen(false);
    };
    const onKeyDown = (event) => event.key === 'Escape' && setMenuOpen(false);

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  return (
    <nav className={`navbar ${scrolled ? 'navbar-scrolled' : ''}`}>
      <Link to="/" className="logo-link">
        <h1 className="logo">CineInfinity 🎬</h1>
      </Link>

      <div className="navbar-links">
        <NavLink to="/search">Reviews</NavLink>
        <NavLink to="/you">You</NavLink>
      </div>

      <div className="navbar-features">
        <SearchBar search={search} className="navbar-search" id="navbar-search" />

        <button
          className="dark-mode-toggle"
          onClick={toggle}
          aria-pressed={isDark}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? '☀️ Light Mode' : '🌙 Dark Mode'}
        </button>

        <div className="profile-container" ref={menuRef}>
          {user ? (
            <>
              <img
                src={user.photoURL}
                alt={user.displayName ? `${user.displayName}'s account menu` : 'Account menu'}
                className="profile-pic"
                onClick={() => setMenuOpen((open) => !open)}
              />
              {menuOpen && (
                <div className="dropdown-menu" role="menu">
                  <Link role="menuitem" to="/you" onClick={() => setMenuOpen(false)}>
                    Your signal
                  </Link>
                  <button role="menuitem" onClick={signOut}>Log out</button>
                </div>
              )}
            </>
          ) : (
            <button className="auth-button" onClick={signIn}>Log in</button>
          )}
        </div>
      </div>
    </nav>
  );
}
