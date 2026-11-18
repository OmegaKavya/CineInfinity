import { useEffect, useRef, useState } from 'react';

/**
 * A horizontally scrollable row of posters.
 *
 * Native scroll rather than a JavaScript carousel. A transform-based slider
 * has to reimplement momentum, touch, keyboard and scrollbars, and usually
 * gets at least one of them wrong; `overflow-x: auto` with scroll-snap gets
 * all four from the browser. The arrow buttons just call scrollBy, so they
 * are an enhancement rather than the mechanism.
 */
export default function Catalogue({ title, subtitle, items, loading, error, onSelect }) {
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
  }, [items]);

  const scrollBy = (direction) => {
    const track = trackRef.current;
    if (track) track.scrollBy({ left: direction * track.clientWidth * 0.8, behavior: 'smooth' });
  };

  return (
    <section className="catalogue">
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

      {error && <p className="error-text" role="alert">{error}</p>}

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
          {items.map((item) => (
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
                  {item.year || item.startDate?.year || ''}
                  {item.rating ? ` · ${item.rating.toFixed(1)}` : ''}
                  {item.averageScore ? ` · ${(item.averageScore / 10).toFixed(1)}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {!loading && !error && items.length === 0 && <p>Nothing to show here yet.</p>}
    </section>
  );
}
