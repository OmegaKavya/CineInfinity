// @vitest-environment node
//
// This file tests pure functions with no DOM involvement. Left on the
// project's default jsdom environment it took over ten minutes to start;
// under node it finishes in about two seconds. Component tests keep jsdom
// via the config - only the pure-logic suites opt out.

import { describe, it, expect } from 'vitest';
import {
  classify,
  collectFranchise,
  storyOrder,
  watchOrders,
} from './franchiseGraph';

/**
 * A miniature franchise with the property that makes this feature necessary:
 * the prequel aired three years after the entry it precedes. Watching these
 * in release order tells the story backwards, which is exactly the trap a
 * newcomer falls into.
 *
 * Modelled on Monogatari, where Bakemonogatari (2009) is preceded by
 * Nekomonogatari Kuro (2012).
 */
const FIXTURE = {
  1: {
    id: 1,
    title: 'Bakemonogatari',
    type: 'ANIME',
    format: 'TV',
    episodes: 15,
    startDate: { year: 2009, month: 7 },
    relations: [
      { id: 2, relationType: 'PREQUEL', type: 'ANIME' },
      { id: 3, relationType: 'SEQUEL', type: 'ANIME' },
      { id: 4, relationType: 'SIDE_STORY', type: 'ANIME' },
      { id: 5, relationType: 'ADAPTATION', type: 'MANGA' },
      { id: 6, relationType: 'ALTERNATIVE', type: 'ANIME' },
      { id: 9, relationType: 'CHARACTER', type: 'ANIME' },
    ],
  },
  2: {
    id: 2,
    title: 'Nekomonogatari Kuro',
    type: 'ANIME',
    format: 'TV',
    episodes: 4,
    startDate: { year: 2012, month: 12 },
    relations: [{ id: 1, relationType: 'SEQUEL', type: 'ANIME' }],
  },
  3: {
    id: 3,
    title: 'Nisemonogatari',
    type: 'ANIME',
    format: 'TV',
    episodes: 11,
    startDate: { year: 2012, month: 1 },
    relations: [{ id: 1, relationType: 'PREQUEL', type: 'ANIME' }],
  },
  4: {
    id: 4,
    title: 'Koyomimonogatari',
    type: 'ANIME',
    format: 'ONA',
    episodes: 12,
    startDate: { year: 2016, month: 1 },
    relations: [{ id: 1, relationType: 'PARENT', type: 'ANIME' }],
  },
  5: { id: 5, title: 'Bakemonogatari (novel)', type: 'MANGA', format: 'NOVEL' },
  6: {
    id: 6,
    title: 'Bakemonogatari Recap',
    type: 'ANIME',
    format: 'SPECIAL',
    episodes: 1,
    startDate: { year: 2010, month: 1 },
    relations: [],
  },
  9: {
    id: 9,
    title: 'Unrelated Crossover Film',
    type: 'ANIME',
    format: 'MOVIE',
    startDate: { year: 2020, month: 1 },
    relations: [],
  },
};

const fetchEntry = async (id) => FIXTURE[id] || null;

describe('classify', () => {
  it('treats a recap as a recap, however it is related', () => {
    expect(classify(FIXTURE[6], 'ALTERNATIVE')).toBe('recap');
  });

  it('treats a side story as a side entry', () => {
    expect(classify(FIXTURE[4], 'SIDE_STORY')).toBe('side');
  });

  it('treats a main TV entry as main', () => {
    expect(classify(FIXTURE[1], undefined)).toBe('main');
  });

  it('treats promotional formats as promos', () => {
    expect(classify({ title: 'OP Theme', format: 'MUSIC' })).toBe('promo');
  });
});

describe('collectFranchise', () => {
  it('collects the anime entries reachable through franchise relations', async () => {
    const { entries } = await collectFranchise(1, fetchEntry);
    expect([...entries.keys()].sort()).toEqual([1, 2, 3, 4, 6]);
  });

  it('does not follow adaptations into manga or novels', async () => {
    const { entries } = await collectFranchise(1, fetchEntry);
    expect(entries.has(5)).toBe(false);
  });

  it('does not follow CHARACTER edges out of the franchise', async () => {
    // One shared character should not drag an unrelated crossover film in.
    const { entries } = await collectFranchise(1, fetchEntry);
    expect(entries.has(9)).toBe(false);
  });

  it('respects the entry cap', async () => {
    const { entries } = await collectFranchise(1, fetchEntry, { maxEntries: 2 });
    expect(entries.size).toBeLessThanOrEqual(2);
  });
});

describe('storyOrder', () => {
  it('puts the prequel first even though it aired three years later', async () => {
    const graph = await collectFranchise(1, fetchEntry);
    const { order } = storyOrder(graph);

    const neko = order.indexOf(2); // 2012, but first chronologically
    const bake = order.indexOf(1); // 2009
    const nise = order.indexOf(3); // 2012, after Bakemonogatari

    expect(neko).toBeLessThan(bake);
    expect(bake).toBeLessThan(nise);
  });

  it('reports nothing as cyclic for a well-formed franchise', async () => {
    const graph = await collectFranchise(1, fetchEntry);
    expect(storyOrder(graph).cycles).toEqual([]);
  });

  it('survives contradictory relation data instead of looping', () => {
    // Each entry claims the other is its prequel, which happens in real data.
    const entries = new Map([
      [1, { id: 1, title: 'A', startDate: { year: 2001 } }],
      [2, { id: 2, title: 'B', startDate: { year: 2002 } }],
    ]);
    const edges = [
      { from: 1, to: 2, type: 'PREQUEL' },
      { from: 2, to: 1, type: 'PREQUEL' },
    ];

    const { order, cycles } = storyOrder({ entries, edges });
    expect(order).toHaveLength(2);
    expect(cycles).toHaveLength(2); // surfaced, not silently mis-ordered
  });
});

describe('watchOrders', () => {
  it('gives release order that differs from story order', async () => {
    const graph = await collectFranchise(1, fetchEntry);
    const { release, story } = watchOrders(graph, 1);

    expect(release.map((e) => e.id)).not.toEqual(story.map((e) => e.id));
    expect(release[0].id).toBe(1); // 2009 aired first
    expect(story[0].id).toBe(2); // but the prequel comes first in the story
  });

  it('strips recaps and side entries from the essential path', async () => {
    const graph = await collectFranchise(1, fetchEntry);
    const { essential } = watchOrders(graph, 1);

    const kinds = new Set(essential.map((e) => e.kind));
    expect(kinds).toEqual(new Set(['main']));
    expect(essential.some((e) => e.id === 6)).toBe(false); // the recap
    expect(essential.some((e) => e.id === 4)).toBe(false); // the side story
  });

  it('keeps every entry in the full story order', async () => {
    const graph = await collectFranchise(1, fetchEntry);
    const { story } = watchOrders(graph, 1);
    expect(story).toHaveLength(5);
  });
});
