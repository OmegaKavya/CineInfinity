import { useEffect, useMemo, useRef, useState } from 'react';
import { arrange, decadesIn, SORTS } from '../lib/sortFilms';

/**
 * A horizontally scrollable row of posters.
 *
 * Native scroll rather than a JavaScript carousel. A transform-based slider
 * has to reimplement momentum, touch, keyboard and scrollbars, and usually
 * gets at least one of them wrong; `overflow-x: auto` with scroll-snap gets
 * all four from the browser. The arrow buttons just call scrollBy, so they
 * are an enhancement rather than the mechanism.
 */
/** TMDb gives `year`, AniList nests it under startDate. */
function displayYear(item) {
  return item.year || item.startDate?.year || null;
}

/**
 * One score out of ten. TMDb's `rating` is already on that scale; AniList's
 * `averageScore` is out of 100. Zero is not a score anyone assigned, it is
 * what both APIs return for an unrated title, so it reads as absent.
 */
function displayScore(item) {
  if (item.rating) return item.rating.toFixed(1);
  if (item.averageScore) return (item.averageScore / 10).toFixed(1);
  return null;
}

export default function Catalogue({
  title, subtitle, items, loading, error, onSelect, onRetry, filterable = false,
}) {
  const [sort, setSort] = useState('default');
  const [decade, setDecade] = useState(null);

  const decades = useMemo(() => (filterable ? decadesIn(items) : []), [filterable, items]);
  const shown = useMemo(
    () => (filterable ? arrange(items, { sort, decade }) : items),
    [filterable, items, sort, decade]
  );

  const trackRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return undefined;

    const update = () => {
      setCanScrollLeft(track.scrollLeft > 8);
      setCanScrollRight(track.scrollLeft + track.clientWidth < track.scrollWidth - 8);
    };

    update();
    track.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      track.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [shown]);

  const scrollBy = (direction) => {
    const track = trackRef.current;
    if (track) track.scrollBy({ left: direction * track.clientWidth * 0.8, behavior: 'smooth' });
  };

  // The component already knows which directions can scroll, for the arrow
  // buttons. The same two flags drive the edge fade, so a row that cannot
  // scroll left is not faded on its left.
  const fade = [
    canScrollLeft ? 'catalogue--fade-left' : '',
    canScrollRight ? 'catalogue--fade-right' : '',
  ].filter(Boolean).join(' ');

  return (
    <section className={`catalogue ${fade}`.trim()}>
      <header className="catalogue__header">
        <div>
          <h2 className="catalogue__title">{title}</h2>
          {subtitle && <p className="catalogue__subtitle">{subtitle}</p>}
        </div>
        <div className="catalogue__controls">
          <button
            type="button"
            onClick={() => scrollBy(-1)}
            disabled={!canScrollLeft}
            aria-label={`Scroll ${title} left`}
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => scrollBy(1)}
            disabled={!canScrollRight}
            aria-label={`Scroll ${title} right`}
          >
            ›
          </button>
        </div>
      </header>

      {filterable && !loading && !error && items.length > 0 && (
        <div className="catalogue__filters">
          <label>
            <span className="visually-hidden">Sort {title}</span>
            <select value={sort} onChange={(event) => setSort(event.target.value)}>
              {SORTS.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </label>

          {decades.length > 1 && (
            <label>
              <span className="visually-hidden">Filter {title} by decade</span>
              <select
                value={decade === null ? '' : String(decade)}
                onChange={(event) =>
                  setDecade(event.target.value === '' ? null : Number(event.target.value))
                }
              >
                <option value="">Any decade</option>
                {decades.map((d) => (
                  <option key={d} value={d}>{d}s</option>
                ))}
              </select>
            </label>
          )}

          <span className="catalogue__count">
            {shown.length} of {items.length}
          </span>
        </div>
      )}

      {error && (
        <p className="error-text" role="alert">
          {error}{' '}
          {onRetry && (
            <button type="button" className="catalogue__reset" onClick={onRetry}>
              Try again
            </button>
          )}
        </p>
      )}

      {loading && (
        // Placeholders sized like the real cards, so the row does not collapse
        // and then shove the page down when the data arrives.
        <div className="catalogue__track" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="poster poster--placeholder" />
          ))}
        </div>
      )}

      {!loading && !error && (
        <ul className="catalogue__track" ref={trackRef}>
          {shown.map((item) => (
            <li key={item.id} className="poster">
              <button type="button" className="poster__button" onClick={() => onSelect?.(item)}>
                {item.poster || item.cover ? (
                  <img
                    src={item.poster || item.cover}
                    alt=""
                    loading="lazy"
                    className="poster__image"
                  />
                ) : (
                  <div className="poster__image poster__image--missing" aria-hidden="true">
                    🎬
                  </div>
                )}
                <span className="poster__title">{item.title}</span>
                <span className="poster__meta">
                  {/* Year and score were concatenated into one text node with
                      a leading separator, so an item with a score but no year
                      rendered as " · 8.1", and an anime carrying both rating
                      and averageScore printed the score twice. They are two
                      elements now, each rendered only when it exists. */}
                  {displayYear(item) && (
                    <span className="poster__year">{displayYear(item)}</span>
                  )}
                  {displayScore(item) !== null && (
                    <span className="poster__score">{displayScore(item)}</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {!loading && !error && items.length > 0 && shown.length === 0 && (
        <p className="catalogue__empty">
          Nothing in this row matches that filter.{' '}
          <button type="button" className="catalogue__reset" onClick={() => setDecade(null)}>
            Clear it
          </button>
        </p>
      )}

      {!loading && !error && items.length === 0 && <p>Nothing to show here yet.</p>}
    </section>
  );
}
