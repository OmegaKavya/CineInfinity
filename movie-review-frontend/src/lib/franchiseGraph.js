/**
 * Resolving the order to watch an anime franchise in.
 *
 * The problem
 * -----------
 * Anime franchises are not released in the order they are meant to be
 * watched. Bakemonogatari aired in 2009; its prequel, Nekomonogatari Kuro,
 * aired in 2012. Fate, Gundam and Monogatari are notorious enough that
 * "<franchise> watch order" is a standing search query, usually answered by a
 * forum post somebody wrote years ago.
 *
 * Underneath, this is a graph problem. AniList publishes typed relation edges
 * between entries - PREQUEL, SEQUEL, SIDE_STORY, SPIN_OFF and so on. The
 * prequel/sequel edges form a directed acyclic graph whose topological order
 * *is* the chronological story order. Everything else is either a branch off
 * that spine or not story content at all.
 *
 * This module is deliberately pure: it takes entries and edges that someone
 * else fetched and returns orderings. That keeps the interesting logic
 * testable without a network, which is the part worth testing.
 *
 * Three orderings are produced, because there is no single right answer:
 *
 *   release    what aired when. Simple, and how most people accidentally
 *              watch things. Included for comparison.
 *   story      chronological order of the narrative, from the prequel/sequel
 *              DAG. What someone usually means by "watch order".
 *   essential  story order with recaps, compilations and promotional shorts
 *              removed. The shortest path through the actual plot.
 */

/**
 * Relation types worth following when walking outward from a seed entry.
 *
 * CHARACTER and OTHER are deliberately excluded. They link works that merely
 * share a character or a studio, and following them walks out of the
 * franchise entirely - one hop from a long-running series can reach a
 * crossover film and from there most of the medium.
 */
const TRAVERSABLE = new Set([
  'PREQUEL',
  'SEQUEL',
  'SIDE_STORY',
  'PARENT',
  'SPIN_OFF',
  'ALTERNATIVE',
  'SUMMARY',
]);

/** Only these edges order the story. The rest describe branches. */
const SPINE = new Set(['PREQUEL', 'SEQUEL']);

const RECAP_PATTERN = /\b(recap|digest|compilation|summary|重|総集編)\b/i;
const PROMO_FORMATS = new Set(['MUSIC', 'PV', 'CM']);

/**
 * What kind of thing is this entry, for the purpose of a watch order?
 *
 * @returns {'main'|'side'|'recap'|'promo'}
 */
export function classify(entry, relationToSeed) {
  const format = entry.format || '';
  const title = entry.title || '';

  if (PROMO_FORMATS.has(format)) return 'promo';
  if (RECAP_PATTERN.test(title)) return 'recap';

  // A SPECIAL with a single episode is usually an OVA bundled with a disc
  // release: watchable, rarely required. Treated as a side entry rather than
  // excluded, because some of them are genuinely good.
  if (format === 'SPECIAL' && (entry.episodes || 0) <= 1) return 'side';

  if (relationToSeed === 'SIDE_STORY' || relationToSeed === 'SPIN_OFF') return 'side';
  if (relationToSeed === 'SUMMARY') return 'recap';

  return 'main';
}

/**
 * Walk the relation graph outward from a seed, collecting the franchise.
 *
 * Breadth-first with a depth cap, because relation graphs are not reliably
 * tight: a long-running franchise can reach a surprising distance through
 * ALTERNATIVE edges, and without a bound the traversal keeps going.
 *
 * `fetchEntry` is injected rather than imported so this stays testable with a
 * plain object as the data source.
 *
 * @param {number} seedId
 * @param {(id:number) => Promise<object>} fetchEntry
 * @param {{maxDepth?:number, maxEntries?:number}} [options]
 */
export async function collectFranchise(seedId, fetchEntry, options = {}) {
  const { maxDepth = 4, maxEntries = 60 } = options;

  const entries = new Map(); // id -> entry
  const edges = []; // { from, to, type }
  const seen = new Set([seedId]);
  let frontier = [{ id: seedId, depth: 0 }];

  while (frontier.length && entries.size < maxEntries) {
    const next = [];

    for (const { id, depth } of frontier) {
      // Checked here as well as in the outer loop: the outer check only runs
      // once per depth level, so a wide frontier could overshoot the cap by
      // its own width before the loop came round again.
      if (entries.size >= maxEntries) break;

      const entry = await fetchEntry(id);
      if (!entry) continue;

      entries.set(id, entry);

      for (const relation of entry.relations || []) {
        // Anime only. The manga and light novels a series was adapted from
        // are not part of a watch order.
        if (relation.type !== 'ANIME') continue;
        if (!TRAVERSABLE.has(relation.relationType)) continue;

        edges.push({ from: id, to: relation.id, type: relation.relationType });

        if (!seen.has(relation.id) && depth + 1 <= maxDepth) {
          seen.add(relation.id);
          next.push({ id: relation.id, depth: depth + 1 });
        }
      }
    }
    frontier = next;
  }

  // Drop edges pointing at entries the traversal never reached, so the graph
  // is internally consistent.
  return {
    entries,
    edges: edges.filter((e) => entries.has(e.from) && entries.has(e.to)),
  };
}

/** Release year/month as a sortable number; unknown dates sort last. */
function releaseKey(entry) {
  const { year, month } = entry.startDate || {};
  if (!year) return Number.MAX_SAFE_INTEGER;
  return year * 100 + (month || 0);
}

/**
 * Chronological story order, by topological sort of the prequel/sequel DAG.
 *
 * Kahn's algorithm, with ties broken by release date so the result is stable
 * and reads sensibly when two entries are genuinely parallel.
 *
 * Relation data contains errors, and errors here produce cycles - two entries
 * each marked as the other's prequel. Rather than failing or looping, any
 * entries left over once the queue empties are appended in release order and
 * reported in `cycles`, so the interface can say that the ordering is partly
 * unverified instead of quietly presenting a wrong one.
 */
export function storyOrder({ entries, edges }, options = {}) {
  const ids = [...entries.keys()];
  const successors = new Map(ids.map((id) => [id, []]));
  const indegree = new Map(ids.map((id) => [id, 0]));

  // Normalise to "earlier -> later". A PREQUEL edge from A says the target
  // comes before A; a SEQUEL edge says it comes after.
  const ordered = new Set();
  for (const edge of edges) {
    if (!SPINE.has(edge.type)) continue;
    const [earlier, later] =
      edge.type === 'PREQUEL' ? [edge.to, edge.from] : [edge.from, edge.to];

    const key = `${earlier}->${later}`;
    if (ordered.has(key)) continue; // relations are listed from both sides
    ordered.add(key);

    successors.get(earlier).push(later);
    indegree.set(later, indegree.get(later) + 1);
  }

  // Tie-breaking among entries that are simultaneously available.
  //
  // Release date alone is not good enough. A recap special with no
  // prequel/sequel edges has indegree zero forever, so it surfaces purely on
  // its air date - which put a 2010 recap ahead of the 2012 prequel it
  // summarises. Callers can supply a rank to say what should come first among
  // equals; `watchOrders` uses it to keep main-story entries ahead of recaps
  // and side stories.
  const { rank = () => 0 } = options;
  const byRank = (a, b) => {
    const delta = rank(entries.get(a)) - rank(entries.get(b));
    if (delta !== 0) return delta;
    return releaseKey(entries.get(a)) - releaseKey(entries.get(b));
  };

  const queue = ids.filter((id) => indegree.get(id) === 0).sort(byRank);
  const order = [];

  while (queue.length) {
    const id = queue.shift();
    order.push(id);

    for (const successor of successors.get(id)) {
      indegree.set(successor, indegree.get(successor) - 1);
      if (indegree.get(successor) === 0) {
        queue.push(successor);
        queue.sort(byRank);
      }
    }
  }

  // Set membership, not order.includes(): the latter is a linear scan inside
  // a filter, which is quadratic in the number of entries.
  const placed = new Set(order);
  const cycles = ids.filter((id) => !placed.has(id)).sort(byRank);
  return { order: [...order, ...cycles], cycles };
}

/**
 * Build the three orderings for a franchise.
 *
 * @returns {{release:object[], story:object[], essential:object[], cycles:number[]}}
 */
export function watchOrders(graph, seedId) {
  const { entries } = graph;
  const relationToSeed = new Map();
  for (const edge of graph.edges) {
    if (edge.from === seedId) relationToSeed.set(edge.to, edge.type);
  }

  const decorate = (id) => {
    const entry = entries.get(id);
    return { ...entry, kind: classify(entry, relationToSeed.get(id)) };
  };

  // Classification has to happen before ordering, because the ordering needs
  // it to break ties sensibly.
  const KIND_RANK = { main: 0, side: 1, recap: 2, promo: 3 };
  const rank = (entry) =>
    KIND_RANK[classify(entry, relationToSeed.get(entry.id))] ?? 9;

  const { order, cycles } = storyOrder(graph, { rank });
  const story = order.map(decorate);

  return {
    release: [...entries.keys()]
      .sort((a, b) => releaseKey(entries.get(a)) - releaseKey(entries.get(b)))
      .map(decorate),
    story,
    essential: story.filter((e) => e.kind === 'main'),
    cycles,
  };
}
