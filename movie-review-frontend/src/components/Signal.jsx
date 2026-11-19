import { useSignal } from '../hooks/useSignal';
import './Signal.css';

/**
 * Your Signal.
 *
 * The thing here that is not a review site. Every other panel in this app
 * reports what a film is; this one reports what the viewer is, by reading
 * their ratings back as a distribution and setting it against everyone
 * else's on the same films.
 *
 * Drawn rather than charted: ten bars, a deviation line and a ranked table
 * do not justify a plotting library, and a 40 kB dependency to render ten
 * divs would be the largest thing in the bundle.
 *
 * Deliberately honest about small samples. Three ratings is not a taste
 * profile, and the server says so rather than drawing confident-looking
 * bars over nothing.
 */
/**
 * How many films you and other people must both have rated before a
 * difference between you means anything.
 *
 * With one shared film the arithmetic still produces a number, and "0.0
 * against the crowd" reads as a confident finding that you are exactly
 * average. It is one coincidence. The verdict line already refuses to read a
 * personality into a handful of ratings; the figures have to hold the same
 * line, or the panel contradicts itself.
 */
const MIN_SHARED = 3;

export default function Signal() {
  const { signal, loading, error } = useSignal();

  if (loading) return <p className="signal__status">Reading your ratings…</p>;
  if (error) return <p className="error-text" role="alert">{error}</p>;
  if (!signal) return null;

  if (!signal.total) {
    return (
      <section className="signal signal--empty">
        <Header />
        <p className="signal__status">{signal.verdict}</p>
      </section>
    );
  }

  const peak = Math.max(...signal.histogram.map((b) => b.count), 1);
  const decadePeak = Math.max(...signal.decades.map((d) => d.count), 1);

  return (
    <section className="signal" aria-labelledby="signal-heading">
      <Header />

      <p className="signal__verdict">{signal.verdict}</p>

      <div className="signal__figures">
        <Figure label="Ratings" value={signal.total} />
        <Figure label="Your mean" value={signal.mean?.toFixed(1) ?? '--'} />
        <Figure
          label="Against the crowd"
          value={
            signal.bias === null || signal.comparedOn < MIN_SHARED
              ? '--'
              : `${signal.bias > 0 ? '+' : ''}${signal.bias.toFixed(1)}`
          }
          hint={
            signal.comparedOn === 0
              ? 'nobody else yet'
              : signal.comparedOn < MIN_SHARED
                ? `only ${signal.comparedOn} shared so far`
                : `on ${signal.comparedOn} shared`
          }
        />
        <Figure label="Spread" value={signal.spread?.toFixed(1) ?? '--'} hint="std dev" />
      </div>

      <div className="signal__panel">
        <h3>How you rate</h3>
        <ol className="signal__hist" aria-label="Distribution of your ratings">
          {signal.histogram.map((bucket) => (
            <li key={bucket.rating} className={bucket.count ? 'is-used' : ''}>
              <span
                className="signal__bar"
                style={{ '--h': `${(bucket.count / peak) * 100}%` }}
                /* The count is on the element rather than in a tooltip, so it
                   survives touch, keyboard and a screen reader. */
                title={`${bucket.count} rated ${bucket.rating}`}
              />
              <em>{bucket.rating}</em>
            </li>
          ))}
        </ol>
        {/* Meaningless with one rating, where the lowest and the highest are
            the same number and the sentence reads as a joke. */}
        {signal.total > 1 ? (
          <p className="signal__note">
            Lowest you gave {signal.lowest}, highest {signal.highest}.
          </p>
        ) : (
          <p className="signal__note">
            One rating so far. The shape appears as you add more.
          </p>
        )}
      </div>

      {signal.comparedOn > 0 && signal.comparedOn < MIN_SHARED && (
        <div className="signal__panel">
          <h3>Where you stand alone</h3>
          {/* Shown rather than hidden, so the panel is discoverable, but
              without a ranking built on one or two films. */}
          <p className="signal__note">
            {signal.comparedOn === 1 ? 'One film' : `${signal.comparedOn} films`} so
            far that you and someone else have both rated. This needs{' '}
            {MIN_SHARED} before a difference means anything rather than being
            a coincidence.
          </p>
        </div>
      )}

      {signal.contrarian.length > 0 && signal.comparedOn >= MIN_SHARED && (
        <div className="signal__panel">
          <h3>Where you stand alone</h3>
          <p className="signal__note">
            Films you and other people both rated, ordered by how far apart the
            two verdicts are.
          </p>
          <ul className="signal__diverge">
            {signal.contrarian.map((film) => (
              <li key={film.movieId}>
                <span className="signal__film">{film.title || film.movieId}</span>
                <span className="signal__scores">
                  <b>{film.mine.toFixed(1)}</b>
                  <i>vs</i>
                  <span>{film.crowd.toFixed(1)}</span>
                </span>
                <span
                  className={`signal__delta ${film.delta > 0 ? 'is-over' : 'is-under'}`}
                >
                  {film.delta > 0 ? '+' : ''}{film.delta.toFixed(1)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {signal.decades.length > 0 && (
        <div className="signal__panel">
          <h3>What you watch</h3>
          <ul className="signal__decades">
            {signal.decades.map((d) => (
              <li key={d.decade}>
                <em>{String(d.decade).slice(2)}s</em>
                <span className="signal__decade-track">
                  <span
                    className="signal__decade-bar"
                    style={{ '--w': `${(d.count / decadePeak) * 100}%` }}
                  />
                </span>
                <span className="signal__decade-count">{d.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Header() {
  return (
    <header className="signal__header">
      <div className="signal__mark" aria-hidden="true">Ω</div>
      <h2 id="signal-heading">Your Signal</h2>
      <p>What your ratings say about you, not about the films.</p>
    </header>
  );
}

function Figure({ label, value, hint }) {
  return (
    <div className="signal__figure">
      <b>{value}</b>
      <span>{label}</span>
      {hint && <i>{hint}</i>}
    </div>
  );
}
