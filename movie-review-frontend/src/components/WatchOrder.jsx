import { useEffect, useState } from 'react';
import { fetchEntry } from '../api/anilist';
import { collectFranchise, watchOrders } from '../lib/franchiseGraph';
import SimilarAnime from './SimilarAnime';

const VIEWS = [
  { id: 'story', label: 'Story order', hint: 'Chronological. What most people mean by watch order.' },
  { id: 'essential', label: 'Essential only', hint: 'Story order with recaps, shorts and side stories removed.' },
  { id: 'release', label: 'Release order', hint: 'What aired when. Often tells the story out of sequence.' },
];

const KIND_LABEL = { main: null, side: 'side story', recap: 'recap', promo: 'promo' };

/**
 * Where to start, and what order to continue in.
 *
 * The panel exists because release order and story order genuinely disagree:
 * Bakemonogatari aired in 2009 and its prequel in 2012, so anyone watching as
 * released meets the ending first. Showing both side by side makes the
 * problem visible rather than asking the viewer to trust one list.
 */
export default function WatchOrder({ anime, onClose, onSelect }) {
  const [view, setView] = useState('story');
  const [orders, setOrders] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!anime) return undefined;

    let current = true;
    setLoading(true);
    setError('');
    setOrders(null);

    collectFranchise(anime.id, fetchEntry)
      .then((graph) => {
        if (!current) return;
        setOrders(watchOrders(graph, anime.id));
      })
      .catch((err) => {
        if (current) setError(err.message || 'Could not work out the order.');
      })
      .finally(() => {
        if (current) setLoading(false);
      });

    return () => {
      current = false;
    };
  }, [anime]);

  if (!anime) return null;

  const list = orders?.[view] || [];

  // A franchise opened from ?anime=<id> arrives with no title, so take it
  // from the entry the resolver found rather than leaving the heading blank.
  const seedEntry =
    orders?.release?.find((entry) => entry.id === anime.id) || null;
  const franchiseIds = orders ? orders.release.map((entry) => entry.id) : [];

  const seriesTitle =
    anime.title ||
    orders?.release?.find((entry) => entry.id === anime.id)?.title ||
    '';
  const differs =
    orders &&
    orders.release.map((e) => e.id).join() !== orders.story.map((e) => e.id).join();

  return (
    <section className="watch-order">
      <header className="watch-order__header">
        <div>
          <h3>{seriesTitle ? `Watch order: ${seriesTitle}` : 'Watch order'}</h3>
          <p className="watch-order__sub">
            Built from how AniList relates these entries to each other.
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close watch order">×</button>
      </header>

      <div className="watch-order__tabs" role="tablist">
        {VIEWS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={view === option.id}
            className={view === option.id ? 'active' : ''}
            onClick={() => setView(option.id)}
            title={option.hint}
          >
            {option.label}
          </button>
        ))}
      </div>

      <p className="watch-order__hint">{VIEWS.find((v) => v.id === view).hint}</p>

      {loading && <p>Tracing the franchise…</p>}
      {error && <p className="error-text" role="alert">{error}</p>}

      {orders && !differs && (
        <p className="watch-order__note">
          For this franchise, release order and story order happen to agree.
        </p>
      )}

      {orders && orders.incomplete.length > 0 && (
        // The traversal stops at a depth and entry cap, so a large franchise
        // always has entries whose predecessors were never fetched. Their
        // position is a guess, and saying so is better than implying
        // certainty the data does not support.
        <p className="watch-order__note">
          {orders.incomplete.length} entr{orders.incomplete.length === 1 ? 'y sits' : 'ies sit'} at
          the edge of what was traced, so {orders.incomplete.length === 1 ? 'its' : 'their'} exact
          placement is approximate.
        </p>
      )}

      {orders && orders.cycles.length > 0 && (
        // Said out loud rather than hidden: relation data contains errors, and
        // a confidently wrong ordering is worse than an uncertain one.
        <p className="watch-order__note watch-order__note--warn">
          {orders.cycles.length} entr{orders.cycles.length === 1 ? 'y' : 'ies'} could not be
          placed confidently, because the relation data contradicts itself there, so treat their
          position as a guess.
        </p>
      )}

      {!loading && !error && (
        <ol className="watch-order__list">
          {list.map((entry, index) => (
            <li key={entry.id} className={`watch-order__item watch-order__item--${entry.kind}`}>
              <span className="watch-order__index">{index + 1}</span>
              {entry.cover && <img src={entry.cover} alt="" loading="lazy" className="watch-order__cover" />}
              <span className="watch-order__body">
                <strong>{entry.title}</strong>
                <small>
                  {entry.format}
                  {entry.episodes ? ` · ${entry.episodes} ep` : ''}
                  {entry.startDate?.year ? ` · ${entry.startDate.year}` : ''}
                  {KIND_LABEL[entry.kind] ? ` · ${KIND_LABEL[entry.kind]}` : ''}
                </small>
              </span>
            </li>
          ))}
        </ol>
      )}

      {orders && view === 'essential' && list.length < orders.story.length && (
        <p className="watch-order__note">
          {orders.story.length - list.length} entries hidden: recaps, promos and side stories.
        </p>
      )}

      {seedEntry && (
        <SimilarAnime
          seed={seedEntry}
          excludeIds={franchiseIds}
          onSelect={onSelect}
        />
      )}
    </section>
  );
}
