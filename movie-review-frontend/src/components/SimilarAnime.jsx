import { useEffect, useState } from 'react';
import { popularAnime } from '../api/anilist';
import { similarTo } from '../lib/similarity';

/**
 * "If you liked this" for the series in the watch-order panel.
 *
 * The candidate pool is AniList's popular list, ranked by how much its tag
 * profile overlaps the series being looked at. Every card names the tags it
 * was chosen on, so the suggestion can be argued with rather than taken on
 * faith, and anything already in the franchise is excluded because the panel
 * above already covers it.
 */
export default function SimilarAnime({ seed, excludeIds = [], onSelect }) {
  const [results, setResults] = useState([]);
  const [state, setState] = useState('idle');

  useEffect(() => {
    if (!seed?.tags?.length) {
      setResults([]);
      return undefined;
    }

    let current = true;
    setState('loading');

    // Two pages is a pool of 100, which is enough for the overlap to mean
    // something without making the panel wait on a third round trip.
    Promise.all([popularAnime(1, 50), popularAnime(2, 50)])
      .then(([first, second]) => {
        if (!current) return;
        const pool = [...first.results, ...second.results];
        setResults(similarTo(seed, pool, { exclude: excludeIds, limit: 6 }));
        setState('ready');
      })
      .catch(() => current && setState('error'));

    return () => {
      current = false;
    };
    // excludeIds is rebuilt on every render upstream; keying on its length
    // avoids refetching the pool on every parent update.
  }, [seed, excludeIds.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (state === 'error' || (state === 'ready' && results.length === 0)) return null;

  return (
    <section className="similar">
      <header className="similar__head">
        <h4>If you liked this</h4>
        <p>
          Ranked by how much each series overlaps this one in AniList&rsquo;s
          tag profile. Spoiler tags are excluded.
        </p>
      </header>

      {state === 'loading' ? (
        <p className="similar__loading">Comparing tag profiles…</p>
      ) : (
        <ul className="similar__list">
          {results.map(({ entry, shared }) => (
            <li key={entry.id}>
              <button type="button" onClick={() => onSelect?.(entry)}>
                {entry.cover ? (
                  <img src={entry.cover} alt="" loading="lazy" />
                ) : (
                  <span className="similar__cover-missing" aria-hidden="true" />
                )}
                <span className="similar__body">
                  <span className="similar__title">{entry.title}</span>
                  <span className="similar__why">
                    {shared.map((name) => (
                      <span key={name}>{name}</span>
                    ))}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
