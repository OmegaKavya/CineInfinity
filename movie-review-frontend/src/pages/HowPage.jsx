import { useCallback, useEffect, useState } from 'react';
import { fetchEntry, searchAnime } from '../api/anilist';
import { collectFranchise, watchOrders } from '../lib/franchiseGraph';
import { drawableFranchise } from '../lib/graphLayout';
import FranchiseGraph from '../components/FranchiseGraph';
import './HowPage.css';

/**
 * How the resolver works, drawn from live data.
 *
 * This page exists because the claim "it sorts by dependency, not by date"
 * is easy to make and easy to fake. Here the graph is fetched, laid out and
 * drawn in front of you: nodes in columns by dependency depth, edges typed
 * by relation, and the release year printed on each one. When a 2016 entry
 * sits in the first column and a 2009 entry in the second, the edge points
 * forwards while the years run backwards, and that contradiction is the
 * argument. Nothing here is a mockup.
 */

const PRESETS = [
  { label: 'Monogatari', query: 'Bakemonogatari', note: 'the hard case: a prequel seven years late' },
  { label: 'Fate', query: 'Fate/Zero', note: 'a prequel written after the route it precedes' },
  { label: 'Haruhi', query: 'The Melancholy of Haruhi Suzumiya', note: 'broadcast deliberately out of order' },
];

const EDGE_LABEL = {
  PREQUEL: 'prequel',
  SEQUEL: 'sequel',
  SIDE_STORY: 'side story',
  PARENT: 'parent',
  ALTERNATIVE: 'alternative',
};

export default function HowPage() {
  const [active, setActive] = useState(PRESETS[0]);
  const [state, setState] = useState({ status: 'loading' });

  const resolve = useCallback(async (preset) => {
    setState({ status: 'loading' });
    try {
      const matches = await searchAnime(preset.query, 1);
      if (!matches.length) throw new Error('Nothing matched that title.');

      const seed = matches[0];
      const graph = await collectFranchise(seed.id, fetchEntry, { maxEntries: 18 });
      const orders = watchOrders(graph, seed.id);

      const { spine, keep, drawn } = drawableFranchise(graph, orders);

      setState({
        status: 'ready',
        seed,
        drawn,
        release: orders.release.filter((e) => keep.has(e.id)),
        story: spine,
        cycles: orders.cycles?.length || 0,
        hidden: orders.story.length - spine.length,
        fetched: graph.entries.size,
      });
    } catch (error) {
      setState({ status: 'error', message: error.message });
    }
  }, []);

  useEffect(() => {
    resolve(active);
  }, [active, resolve]);

  useEffect(() => {
    document.title = 'How the resolver works - CineInfinity';
    return () => { document.title = 'CineInfinity'; };
  }, []);

  return (
    <article className="how">
      <header className="how__header">
        <p className="how__eyebrow">How it works</p>
        <h1>Release order is an ordering. It is just the wrong one.</h1>
        <p className="how__lede">
          A franchise is a directed graph: each entry names the ones it
          follows. Sorting by date ignores those edges, which is why a prequel
          made years later lands at the end. The fix is a topological sort,
          and everything below is run live against AniList so you can check it
          rather than take my word for it.
        </p>
      </header>

      <nav className="how__picks" aria-label="Choose a franchise">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className={preset.label === active.label ? 'is-active' : ''}
            onClick={() => setActive(preset)}
          >
            <b>{preset.label}</b>
            <span>{preset.note}</span>
          </button>
        ))}
      </nav>

      {state.status === 'loading' && <p className="how__status">Walking the relation graph…</p>}

      {state.status === 'error' && (
        <p className="error-text" role="alert">
          {state.message} The resolver depends on a live API; this is what a
          failure looks like rather than a placeholder.
        </p>
      )}

      {state.status === 'ready' && (
        <>
          <section className="how__step">
            <h2><span>1</span> The graph, as fetched</h2>
            <p>
              Columns are dependency depth: everything in a column depends on
              something in the one before it. Watch the years. Where they run
              backwards against an edge, release order and story order
              disagree, and that is the case this resolver exists for.
            </p>
            <FranchiseGraph drawn={state.drawn} />
            <p className="how__caption">
              {state.drawn.nodes.length} entries on the spine, {state.drawn.edges.length}{' '}
              edges, {state.fetched} fetched before the cap.
              {state.hidden > 0 && ` ${state.hidden} recaps and shorts are classified and left out.`}
              {state.cycles > 0 && ` ${state.cycles} cyclic edges were detected and broken.`}
            </p>
          </section>

          <section className="how__step">
            <h2><span>2</span> The two orderings</h2>
            <p>
              The same entries, sorted two ways. A line marks an entry that
              moves, and how far.
            </p>
            <Compare release={state.release} story={state.story} />
          </section>

          <section className="how__step how__step--notes">
            <h2><span>3</span> Where it is imperfect</h2>
            <ul>
              <li>
                The traversal is capped at 18 entries here and 60 in the app.
                A franchise larger than that is truncated, not resolved, and
                the count above says which happened.
              </li>
              <li>
                Relation edges are AniList's. Where an entry is mislabelled
                upstream the order inherits that, and no amount of sorting
                fixes a wrong edge.
              </li>
              <li>
                Cycles exist in real data. They are detected and broken rather
                than hung on, but a broken cycle is a judgement call, not a
                correct answer.
              </li>
              <li>
                Story order is one opinion. Some franchises have a defensible
                release-order argument, and this page does not pretend
                otherwise.
              </li>
            </ul>
          </section>
        </>
      )}
    </article>
  );
}

function Compare({ release, story }) {
  const storyIndex = new Map(story.map((e, i) => [e.id, i]));

  return (
    <ol className="how__compare">
      {release.map((entry, i) => {
        const to = storyIndex.get(entry.id);
        const moved = to !== undefined && to !== i;
        return (
          <li key={entry.id} className={moved ? 'is-moved' : ''}>
            <span className="how__from">{i + 1}</span>
            <span className="how__title">{entry.title}</span>
            <span className="how__year">{entry.startDate?.year || ''}</span>
            <span className="how__to">
              {moved ? (
                <>
                  {to + 1}
                  <i>{to < i ? `up ${i - to}` : `down ${to - i}`}</i>
                </>
              ) : (
                <em>same</em>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
