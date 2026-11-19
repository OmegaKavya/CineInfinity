import { describe, it, expect } from 'vitest';
import { depths, layout } from './graphLayout';

describe('depth', () => {
  it('places a root at zero and each dependant after it', () => {
    const d = depths([1, 2, 3], [{ from: 1, to: 2 }, { from: 2, to: 3 }]);
    expect([d.get(1), d.get(2), d.get(3)]).toEqual([0, 1, 2]);
  });

  it('uses the longest path, not the shortest', () => {
    // 3 is reachable from 1 directly and via 2. Drawn at the shortest depth
    // it would sit beside 2, and the 2 -> 3 edge would run backwards.
    const d = depths([1, 2, 3], [
      { from: 1, to: 2 }, { from: 2, to: 3 }, { from: 1, to: 3 },
    ]);
    expect(d.get(3)).toBe(2);
  });

  it('returns rather than overflowing the stack on a cycle', () => {
    const d = depths([1, 2], [{ from: 1, to: 2 }, { from: 2, to: 1 }]);
    expect(Number.isFinite(d.get(1))).toBe(true);
    expect(Number.isFinite(d.get(2))).toBe(true);
  });

  it('ignores edges pointing outside the node set', () => {
    const d = depths([1], [{ from: 99, to: 1 }]);
    expect(d.get(1)).toBe(0);
  });
});

describe('layout', () => {
  const nodes = [{ id: 1 }, { id: 2 }, { id: 3 }];

  it('gives every node a column and a row', () => {
    const out = layout(nodes, [{ from: 1, to: 2 }, { from: 2, to: 3 }]);
    expect(out.nodes).toHaveLength(3);
    expect(out.columns).toBe(3);
    out.nodes.forEach((n) => {
      expect(Number.isFinite(n.column)).toBe(true);
      expect(Number.isFinite(n.offset)).toBe(true);
    });
  });

  it('stacks nodes that share a column without overlapping', () => {
    const out = layout(nodes, [{ from: 1, to: 2 }, { from: 1, to: 3 }]);
    const second = out.nodes.filter((n) => n.column === 1);
    expect(second).toHaveLength(2);
    expect(second[0].offset).not.toBe(second[1].offset);
  });

  it('centres a short column against the tallest one', () => {
    const out = layout([{ id: 1 }, { id: 2 }, { id: 3 }], [
      { from: 1, to: 2 }, { from: 1, to: 3 },
    ]);
    // One node in column 0, two in column 1: the single node sits between
    // them rather than level with the first.
    expect(out.nodes.find((n) => n.id === 1).offset).toBe(0.5);
  });

  it('resolves each edge to the nodes it joins', () => {
    const out = layout(nodes, [{ from: 1, to: 2, type: 'SEQUEL' }]);
    expect(out.edges[0].source.id).toBe(1);
    expect(out.edges[0].target.id).toBe(2);
  });

  it('drops an edge whose endpoint was never collected', () => {
    // The traversal caps entries, so edges can point at nodes that were
    // never fetched. Drawing one would throw on a missing position.
    const out = layout(nodes, [{ from: 1, to: 404 }]);
    expect(out.edges).toHaveLength(0);
  });
});
