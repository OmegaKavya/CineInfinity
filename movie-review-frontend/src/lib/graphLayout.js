/**
 * Lay the franchise graph out for drawing.
 *
 * Separate from the component and pure, because the placement rules are the
 * part that can be wrong in a way that still renders: a node drawn on top of
 * another, or an edge pointing backwards, looks like a styling problem and
 * is not one.
 *
 * Nodes are placed in columns by their depth in the dependency order, which
 * is what makes the picture say something. A prequel released in 2016 sits
 * in column 0 next to a 2009 entry in column 1, and the edge between them
 * points forwards while the years run backwards. That contradiction is the
 * whole argument of the page, drawn rather than asserted.
 */

/**
 * Longest path from any root, which is the column a node belongs in.
 *
 * Longest rather than shortest: a node must sit to the right of everything
 * it depends on, and the shortest path would place it beside a dependency it
 * also reaches by a longer route, drawing an edge straight through a column.
 */
export function depths(nodeIds, edges) {
  const incoming = new Map(nodeIds.map((id) => [id, []]));
  for (const edge of edges) {
    if (incoming.has(edge.to) && incoming.has(edge.from)) {
      incoming.get(edge.to).push(edge.from);
    }
  }

  const depth = new Map();
  // Memoised with an in-progress marker, so a cycle returns rather than
  // recursing until the stack gives out. The resolver detects cycles too,
  // but the layout must not depend on having been handed an acyclic graph.
  const visiting = new Set();

  const of = (id) => {
    if (depth.has(id)) return depth.get(id);
    if (visiting.has(id)) return 0;
    visiting.add(id);

    const parents = incoming.get(id) || [];
    const value = parents.length ? Math.max(...parents.map((p) => of(p) + 1)) : 0;

    visiting.delete(id);
    depth.set(id, value);
    return value;
  };

  for (const id of nodeIds) of(id);
  return depth;
}

/**
 * Positions for every node, in abstract units the component scales.
 *
 * @param {Array<{id:number}>} nodes in dependency order
 * @param {Array<{from:number,to:number,type:string}>} edges
 */
export function layout(nodes, edges) {
  const ids = nodes.map((n) => n.id);
  const depth = depths(ids, edges);

  // Group by column, then stack within it. Ordering inside a column follows
  // the dependency order it was given, so sibling entries stay in the order
  // the resolver would play them.
  const columns = new Map();
  for (const node of nodes) {
    const d = depth.get(node.id) ?? 0;
    if (!columns.has(d)) columns.set(d, []);
    columns.get(d).push(node);
  }

  const placed = [];
  const tallest = Math.max(...[...columns.values()].map((c) => c.length), 1);

  for (const [column, members] of [...columns.entries()].sort((a, b) => a[0] - b[0])) {
    members.forEach((node, row) => {
      placed.push({
        ...node,
        column,
        row,
        // Centred vertically, so a column of one sits level with the middle
        // of a column of four rather than at its top.
        offset: (tallest - members.length) / 2 + row,
      });
    });
  }

  const byId = new Map(placed.map((n) => [n.id, n]));
  const drawnEdges = edges
    .filter((e) => byId.has(e.from) && byId.has(e.to))
    .map((e) => ({ ...e, source: byId.get(e.from), target: byId.get(e.to) }));

  return {
    nodes: placed,
    edges: drawnEdges,
    columns: columns.size,
    rows: tallest,
  };
}


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
export function dependencyEdge(edge) {
  if (edge.type === 'PREQUEL') return { ...edge, from: edge.to, to: edge.from };
  if (edge.type === 'SEQUEL' || edge.type === 'SIDE_STORY') return edge;
  return null;
}

/**
 * When both ends state a link, the statement that names the merged arrow.
 * Fixed rather than whichever came first: the traversal meets either end
 * first depending on the seed, so the same link was drawn differently from
 * one franchise page to the next.
 */
const TYPE_RANK = ['SEQUEL', 'PREQUEL', 'SIDE_STORY'];

/**
 * Whether date a is known to fall after date b. AniList sends an undated
 * entry as { year: null }, and 2020 > null is true, so a missing year has to
 * answer false rather than reach the comparison. Within one year the months
 * decide, and only when both are known: an unknown month is not January.
 */
function releasedAfter(a, b) {
  if (!a?.year || !b?.year) return false;
  if (a.year !== b.year) return a.year > b.year;
  return Boolean(a.month && b.month) && a.month > b.month;
}

/**
 * What to draw for a resolved franchise: the essential entries (or the whole
 * story order when nothing is essential) and the dependency edges between
 * them, laid out. Recaps and promos triple the node count and say nothing
 * about ordering, which is what the picture is about.
 */
export function drawableFranchise(graph, orders) {
  const spine = orders.essential.length ? orders.essential : orders.story;
  const keep = new Set(spine.map((e) => e.id));
  const released = new Map(spine.map((e) => [e.id, e.startDate]));
  // AniList states each link from both ends: A names B as its SEQUEL and B
  // names A as its PREQUEL. Once the PREQUEL is flipped the two are the same
  // arrow, and drawing both stacked two on every spine link and doubled the
  // edge count in the caption.
  const merged = new Map();
  for (const relation of graph.edges) {
    if (!keep.has(relation.from) || !keep.has(relation.to)) continue;
    const edge = dependencyEdge(relation);
    if (!edge) continue;
    const key = `${edge.from}->${edge.to}`;
    const held = merged.get(key);
    if (!held || TYPE_RANK.indexOf(edge.type) < TYPE_RANK.indexOf(held.type)) {
      merged.set(key, edge);
    }
  }
  const edges = [...merged.values()].map((edge) => ({
    ...edge,
    // A prequel released after the entry it leads into, so the arrow points
    // forwards while the dates run backwards: the case the page is about.
    // Every link is a PREQUEL from one end and a SEQUEL from the other, so
    // the relation type cannot single these out; the dates can.
    backwards: releasedAfter(released.get(edge.from), released.get(edge.to)),
  }));
  return { spine, keep, drawn: layout(spine, edges) };
}
