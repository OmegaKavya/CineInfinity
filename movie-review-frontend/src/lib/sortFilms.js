/**
 * Sorting and filtering for a catalogue row.
 *
 * Pure, and separate from the component, because the ordering rules are the
 * part worth testing: a sort that silently drops titles with no year, or
 * that puts unrated films at the top of "highest rated", is the kind of bug
 * that looks like a styling problem.
 */

/** Both APIs expose a year differently, and neither guarantees one. */
export function yearOf(item) {
  const raw = item.year ?? item.startDate?.year;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/** One score out of ten, or null. TMDb rates out of 10, AniList out of 100. */
export function scoreOf(item) {
  if (Number.isFinite(item.rating) && item.rating > 0) return item.rating;
  if (Number.isFinite(item.averageScore) && item.averageScore > 0) return item.averageScore / 10;
  return null;
}

export const SORTS = [
  { id: 'default', label: 'Popular' },
  { id: 'rating', label: 'Highest rated' },
  { id: 'newest', label: 'Newest' },
  { id: 'oldest', label: 'Oldest' },
  { id: 'title', label: 'A to Z' },
];

/**
 * @param {Array} items
 * @param {object} options
 * @param {string} options.sort one of SORTS
 * @param {number|null} options.decade e.g. 1990, or null for all
 * @param {number|null} options.minScore
 */
export function arrange(items, { sort = 'default', decade = null, minScore = null } = {}) {
  let out = items;

  if (decade !== null) {
    out = out.filter((item) => {
      const year = yearOf(item);
      return year !== null && year >= decade && year < decade + 10;
    });
  }

  if (minScore !== null) {
    out = out.filter((item) => {
      const score = scoreOf(item);
      return score !== null && score >= minScore;
    });
  }

  if (sort === 'default') return out;

  // Copied before sorting: the caller's array is the hook's state, and
  // sorting in place mutates it without React knowing.
  const sorted = [...out];

  switch (sort) {
    case 'rating':
      // An unrated film is not a zero-rated film, so it sorts last in both
      // directions rather than topping "highest rated" by accident.
      return sorted.sort((a, b) => {
        const sa = scoreOf(a);
        const sb = scoreOf(b);
        if (sa === null && sb === null) return 0;
        if (sa === null) return 1;
        if (sb === null) return -1;
        return sb - sa;
      });
    case 'newest':
    case 'oldest': {
      const direction = sort === 'newest' ? -1 : 1;
      return sorted.sort((a, b) => {
        const ya = yearOf(a);
        const yb = yearOf(b);
        if (ya === null && yb === null) return 0;
        if (ya === null) return 1;
        if (yb === null) return -1;
        return (ya - yb) * direction;
      });
    }
    case 'title':
      return sorted.sort((a, b) =>
        String(a.title || '').localeCompare(String(b.title || ''), undefined, {
          sensitivity: 'base',
        })
      );
    default:
      return sorted;
  }
}

/** The decades actually present, so the filter never offers an empty one. */
export function decadesIn(items) {
  const found = new Set();
  for (const item of items) {
    const year = yearOf(item);
    if (year !== null && year >= 1900) found.add(Math.floor(year / 10) * 10);
  }
  return [...found].sort((a, b) => b - a);
}
