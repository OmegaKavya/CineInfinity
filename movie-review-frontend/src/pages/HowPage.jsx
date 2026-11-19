import { useCallback, useEffect, useState } from 'react';
import { fetchEntry, searchAnime } from '../api/anilist';
import { collectFranchise, watchOrders } from '../lib/franchiseGraph';
import { layout } from '../lib/graphLayout';
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

// Drawing units. The SVG scales to its container; these only set proportion.
const COL_W = 210;
const ROW_H = 92;
const NODE_W = 170;
const NODE_H = 62;

/**
 * Point an edge the way the dependency runs.
 *
 * AniList states relations from the entry outwards: a PREQUEL edge runs from
 * an entry TO the thing that precedes it, which is the opposite of "must be
 * watched first". Fed to the layout as given, the graph came out newest
 * first and every arrow pointed backwards in time.
 *
 * SEQUEL and SIDE_STORY already run forwards. Anything else is not an
 * ordering claim and is dropped rather than drawn as one.
 */
function dependencyEdge(edge) {
  if (edge.type === 'PREQUEL') return { ...edge, from: edge.to, to: edge.from };
  if (edge.type === 'SEQUEL' || edge.type === 'SIDE_STORY') return edge;
  return null;
}

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

      // Only the spine is drawn. Recaps and promos triple the node count and
      // say nothing about ordering, which is what the picture is about.
      const spine = orders.essential.length ? orders.essential : orders.story;
      const keep = new Set(spine.map((e) => e.id));
      const edges = graph.edges
        .filter((e) => keep.has(e.from) && keep.has(e.to))
        .map(dependencyEdge)
        .filter(Boolean);

      setState({
        status: 'ready',
        seed,
        drawn: layout(spine, edges),
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
            <Graph drawn={state.drawn} />
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

function Graph({ drawn }) {
  const width = drawn.columns * COL_W + 40;
  const height = drawn.rows * ROW_H + 40;

  const x = (n) => n.column * COL_W + 20;
  const y = (n) => n.offset * ROW_H + 20;

  return (
    <div className="how__graph" role="img"
         aria-label={`Dependency graph of ${drawn.nodes.length} entries in ${drawn.columns} columns`}>
      {/* Sized in pixels, not scaled to the container. Scaled, a thirteen
          column graph was squeezed into the text width and every label went
          to a grey smear. It scrolls sideways instead, which is the right
          trade for a diagram whose labels are the content. */}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        preserveAspectRatio="xMinYMin meet"
      >
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5"
                  markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
          </marker>
        </defs>

        {drawn.edges.map((edge, i) => {
          const x1 = x(edge.source) + NODE_W;
          const y1 = y(edge.source) + NODE_H / 2;
          const x2 = x(edge.target);
          const y2 = y(edge.target) + NODE_H / 2;
          const mid = (x1 + x2) / 2;
          return (
            <g key={i} className={`how__edge is-${(edge.type || '').toLowerCase()}`}>
              <path
                d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
                fill="none"
                markerEnd="url(#arrow)"
              />
            </g>
          );
        })}

        {drawn.nodes.map((node) => (
          <g key={node.id} className={`how__node is-${node.kind || 'main'}`}
             transform={`translate(${x(node)} ${y(node)})`}>
            <rect width={NODE_W} height={NODE_H} rx="8" />
            <text className="how__node-title" x="10" y="24">
              {truncate(node.title, 22)}
            </text>
            <text className="how__node-year" x="10" y="45">
              {node.startDate?.year || 'year unknown'}
            </text>
          </g>
        ))}
      </svg>
    </div>
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

function truncate(text, max) {
  const value = String(text || '');
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
