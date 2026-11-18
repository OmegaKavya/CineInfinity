import { useEffect, useState } from 'react';
import { heroImages } from '../data/heroImages';
import SearchBar from './SearchBar';

/**
 * The hero: a full-bleed crossfading backdrop with the search over it.
 *
 * This replaces the signed-out-only slideshow, which was a dimmed wallpaper
 * behind a login card that nobody could get past. The backdrops are the best
 * images in the product, so they lead.
 *
 * The timer pauses when the tab is hidden, and reduced-motion holds on the
 * first frame, because a full-bleed auto-advancing slideshow is exactly the
 * motion that setting exists to stop. The slide titles are announced in the
 * caption rather than being decoration nobody can read.
 */
export default function Hero({ search, signedIn, onSignIn, intervalMs = 6000 }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced || paused || heroImages.length < 2) return undefined;

    let timer = null;
    const start = () => {
      timer = setInterval(
        () => setIndex((i) => (i + 1) % heroImages.length),
        intervalMs
      );
    };
    const stop = () => clearInterval(timer);

    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener('visibilitychange', onVisibility);
    if (!document.hidden) start();

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs, paused]);

  const current = heroImages[index];

  return (
    <header
      className="hero"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="hero-stage" aria-hidden="true">
        {heroImages.map((image, i) => (
          <div
            key={image.url}
            className={`hero-slide${i === index ? ' is-active' : ''}`}
            style={{ backgroundImage: `url(${image.url})` }}
          />
        ))}
      </div>

      <div className="hero-veil" aria-hidden="true" />

      <div className="hero-content">
        <p className="hero-eyebrow">Hollywood · Bollywood · Anime</p>
        <h1 className="hero-title">
          Every film. And the order to watch them in.
        </h1>
        <p className="hero-sub">
          Reviews and ratings, plus a resolver that works out the right order
          for an anime series instead of listing it by release date.
        </p>

        <div className="hero-search">
          <SearchBar
            search={search}
            className="hero-search-input"
            id="hero-search"
            placeholder="Search for a film…"
          />
          <button
            type="button"
            className="hero-search-button"
            onClick={search.searchByTitle}
            disabled={search.searching}
          >
            {search.searching ? 'Searching…' : 'Find'}
          </button>
        </div>

        {!signedIn && (
          <p className="hero-note">
            Browse freely.{' '}
            <button type="button" className="hero-link" onClick={onSignIn}>
              Sign in
            </button>{' '}
            when you want to leave a review.
          </p>
        )}
      </div>

      <div className="hero-footer">
        <span className="hero-caption">
          {current.title}
          {current.year && <span className="hero-year">{current.year}</span>}
        </span>
        <div className="hero-dots" role="tablist" aria-label="Featured films">
          {heroImages.map((image, i) => (
            <button
              key={image.url}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={image.title}
              className={`hero-dot${i === index ? ' is-active' : ''}`}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
      </div>
    </header>
  );
}
