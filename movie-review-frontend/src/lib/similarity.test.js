// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { tagSimilarity, similarTo } from './similarity';

const tag = (name, rank, extra = {}) => ({ name, rank, ...extra });

const mystery = {
  id: 1,
  title: 'Mystery A',
  genres: ['Mystery', 'Psychological'],
  tags: [tag('Philosophy', 90), tag('Urban Fantasy', 85), tag('Ensemble Cast', 70)],
};

const nearTwin = {
  id: 2,
  title: 'Mystery B',
  genres: ['Mystery', 'Psychological'],
  tags: [tag('Philosophy', 88), tag('Urban Fantasy', 80), tag('Coming of Age', 65)],
};

const unrelated = {
  id: 3,
  title: 'Sports',
  genres: ['Sports'],
  tags: [tag('Basketball', 95), tag('Rivalry', 80)],
};

describe('tagSimilarity', () => {
  it('scores a near twin above an unrelated show', () => {
    expect(tagSimilarity(mystery, nearTwin).score).toBeGreaterThan(
      tagSimilarity(mystery, unrelated).score
    );
  });

  it('names the tags the score was built on', () => {
    expect(tagSimilarity(mystery, nearTwin).shared).toContain('Philosophy');
  });

  it('ignores weakly ranked tags rather than treating them as agreement', () => {
    const faint = { id: 9, tags: [tag('Philosophy', 10)] };
    expect(tagSimilarity(mystery, faint).score).toBe(0);
  });

  it('never recommends on a spoiler tag', () => {
    const spoilery = {
      id: 10,
      tags: [tag('Philosophy', 90, { isMediaSpoiler: true }), tag('Urban Fantasy', 88)],
    };
    expect(tagSimilarity(mystery, spoilery).shared).not.toContain('Philosophy');
  });

  it('is not fooled by a long tag list', () => {
    // A show that tags everything lightly should not beat a genuine match.
    const padded = {
      id: 11,
      tags: Array.from({ length: 40 }, (_, i) => tag(`Filler ${i}`, 61)).concat([
        tag('Philosophy', 61),
      ]),
    };
    expect(tagSimilarity(mystery, nearTwin).score).toBeGreaterThan(
      tagSimilarity(mystery, padded).score
    );
  });

  it('returns nothing when either side has no usable tags', () => {
    expect(tagSimilarity(mystery, { id: 12, tags: [] }).score).toBe(0);
    expect(tagSimilarity({ id: 13 }, nearTwin).score).toBe(0);
  });
});

describe('similarTo', () => {
  it('ranks the closest candidate first', () => {
    const results = similarTo(mystery, [unrelated, nearTwin]);
    expect(results[0].entry.id).toBe(nearTwin.id);
  });

  it('never recommends the seed back to itself', () => {
    const results = similarTo(mystery, [mystery, nearTwin]);
    expect(results.map((r) => r.entry.id)).not.toContain(mystery.id);
  });

  it('excludes entries already in the franchise', () => {
    // The watch-order panel covers sequels; repeating them is not a
    // recommendation.
    const results = similarTo(mystery, [nearTwin], { exclude: [nearTwin.id] });
    expect(results).toHaveLength(0);
  });

  it('drops candidates with nothing in common rather than padding the row', () => {
    const results = similarTo(mystery, [unrelated]);
    expect(results).toHaveLength(0);
  });

  it('honours the limit', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      ...nearTwin,
      id: 100 + i,
    }));
    expect(similarTo(mystery, many, { limit: 4 })).toHaveLength(4);
  });

  it('carries reasons with every recommendation', () => {
    const [top] = similarTo(mystery, [nearTwin]);
    expect(top.shared.length).toBeGreaterThan(0);
    expect(top.shared.length).toBeLessThanOrEqual(3);
  });
});
