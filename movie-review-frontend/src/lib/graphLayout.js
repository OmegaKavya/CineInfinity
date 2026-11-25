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
 * What to draw for a resolved franchise: the essential entries (or the whole
 * story order when nothing is essential) and the dependency edges between
 * them, laid out. Recaps and promos triple the node count and say nothing
 * about ordering, which is what the picture is about.
 */
export function drawableFranchise(graph, orders) {
  const spine = orders.essential.length ? orders.essential : orders.story;
  const keep = new Set(spine.map((e) => e.id));
  const edges = graph.edges
    .filter((e) => keep.has(e.from) && keep.has(e.to))
    .map(dependencyEdge)
    .filter(Boolean);
  return { spine, keep, drawn: layout(spine, edges) };
}
