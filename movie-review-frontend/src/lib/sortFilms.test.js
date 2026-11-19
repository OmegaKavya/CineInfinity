import { describe, it, expect } from 'vitest';
import { arrange, decadesIn, scoreOf, yearOf } from './sortFilms';

const film = (over) => ({ title: 'A', year: '2000', rating: 7, ...over });

describe('reading a film', () => {
  it('takes the year from either shape', () => {
    expect(yearOf({ year: '1994' })).toBe(1994);
    expect(yearOf({ startDate: { year: 2013 } })).toBe(2013);
  });

  it('treats a missing or unusable year as absent, not as zero', () => {
    expect(yearOf({ year: 'N/A' })).toBe(null);
    expect(yearOf({})).toBe(null);
  });

  it('puts both score scales on ten', () => {
    expect(scoreOf({ rating: 7.4 })).toBe(7.4);
    // AniList rates out of 100.
    expect(scoreOf({ averageScore: 85 })).toBe(8.5);
  });

  it('treats a zero score as unrated', () => {
    // Both APIs return 0 for "nobody has rated this", which is not the same
    // as everybody rating it zero.
    expect(scoreOf({ rating: 0 })).toBe(null);
    expect(scoreOf({ averageScore: 0 })).toBe(null);
  });
});

describe('sorting', () => {
  it('leaves the API order alone by default', () => {
    const items = [film({ title: 'B' }), film({ title: 'A' })];
    expect(arrange(items, { sort: 'default' }).map((f) => f.title)).toEqual(['B', 'A']);
  });

  it('does not mutate the array it was given', () => {
    // The caller's array is hook state; sorting in place changes it without
    // React knowing anything happened.
    const items = [film({ title: 'B' }), film({ title: 'A' })];
    const before = [...items];
    arrange(items, { sort: 'title' });
    expect(items).toEqual(before);
  });

  it('sorts unrated films last, not first', () => {
    const items = [
      film({ title: 'unrated', rating: 0 }),
      film({ title: 'good', rating: 8 }),
    ];
    expect(arrange(items, { sort: 'rating' })[0].title).toBe('good');
  });

  it('sorts films with no year last in both directions', () => {
    const items = [
      film({ title: 'undated', year: 'N/A' }),
      film({ title: 'old', year: '1970' }),
      film({ title: 'new', year: '2020' }),
    ];
    expect(arrange(items, { sort: 'newest' }).map((f) => f.title)).toEqual([
      'new', 'old', 'undated',
    ]);
    expect(arrange(items, { sort: 'oldest' }).map((f) => f.title)).toEqual([
      'old', 'new', 'undated',
    ]);
  });

  it('sorts titles without case deciding the order', () => {
    const items = [film({ title: 'banana' }), film({ title: 'Apple' })];
    expect(arrange(items, { sort: 'title' }).map((f) => f.title)).toEqual([
      'Apple', 'banana',
    ]);
  });
});

describe('filtering', () => {
  it('keeps only the chosen decade', () => {
    const items = [
      film({ title: 'nineties', year: '1994' }),
      film({ title: 'noughties', year: '2004' }),
      film({ title: 'edge', year: '1999' }),
    ];
    expect(arrange(items, { decade: 1990 }).map((f) => f.title)).toEqual([
      'nineties', 'edge',
    ]);
  });

  it('drops a film with no year rather than guessing a decade for it', () => {
    const items = [film({ title: 'undated', year: 'N/A' })];
    expect(arrange(items, { decade: 1990 })).toEqual([]);
  });

  it('offers only decades that are actually present, newest first', () => {
    const items = [
      film({ year: '1994' }), film({ year: '2021' }), film({ year: 'N/A' }),
    ];
    expect(decadesIn(items)).toEqual([2020, 1990]);
  });
});
