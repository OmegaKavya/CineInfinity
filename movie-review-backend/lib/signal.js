/**
 * The taste analytics behind "Your Signal".
 *
 * Kept as pure functions over plain rows so the shape of every number is
 * testable without a database, and so the route stays a thin wrapper. The
 * aggregation that feeds it lives in the route; everything judgemental about
 * what the numbers mean lives here.
 */

/** Ratings are 1..10, so a histogram has ten fixed buckets, not however many
 *  distinct values happen to appear. An empty bucket is information. */
function histogram(ratings) {
  const buckets = Array.from({ length: 10 }, (_, i) => ({ rating: i + 1, count: 0 }));
  for (const r of ratings) {
    const index = Math.round(r) - 1;
    if (index >= 0 && index < 10) buckets[index].count += 1;
  }
  return buckets;
}

function mean(numbers) {
  if (!numbers.length) return null;
  return numbers.reduce((a, b) => a + b, 0) / numbers.length;
}

/** Population standard deviation. One rating has no spread, not a spread of
 *  zero divided by zero. */
function spread(numbers) {
  if (numbers.length < 2) return null;
  const m = mean(numbers);
  const variance = mean(numbers.map((n) => (n - m) ** 2));
  return Math.sqrt(variance);
}

/**
 * How far this user sits from everyone else on the films both have rated.
 *
 * Only titles with a crowd verdict from someone other than this user count:
 * comparing a user against an average they are the sole contributor to
 * would report a difference of exactly zero and mean nothing.
 */
function divergence(pairs) {
  const comparable = pairs.filter(
    (p) => p.crowdCount > 0 && Number.isFinite(p.crowdMean)
  );
  if (!comparable.length) return { count: 0, bias: null, contrarian: [] };

  const deltas = comparable.map((p) => p.mine - p.crowdMean);

  // Sorted by how far apart the two verdicts are, in either direction: the
  // interesting ones are where the user is most alone, not where they are
  // merely highest.
  const contrarian = [...comparable]
    .sort((a, b) => Math.abs(b.mine - b.crowdMean) - Math.abs(a.mine - a.crowdMean))
    .slice(0, 5)
    .map((p) => ({
      movieId: p.movieId,
      title: p.title || null,
      mine: round(p.mine, 1),
      crowd: round(p.crowdMean, 1),
      delta: round(p.mine - p.crowdMean, 1),
      crowdCount: p.crowdCount,
    }));

  return { count: comparable.length, bias: round(mean(deltas), 2), contrarian };
}

function round(value, places) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/**
 * A one-line reading of the numbers, so the panel says something rather than
 * leaving the visitor to interpret a histogram. The thresholds are
 * deliberately wide: a bias of 0.2 is noise, not a personality.
 */
function verdict({ total, bias, spreadValue }) {
  if (!total) return "No ratings yet. Review something and this fills in.";
  if (total < 3) return "Too few ratings to read much into yet.";

  const parts = [];
  if (bias !== null && Math.abs(bias) >= 0.5) {
    parts.push(bias > 0 ? "more generous than the crowd" : "harder to please than the crowd");
  } else if (bias !== null) {
    parts.push("broadly in line with the crowd");
  }

  if (spreadValue !== null) {
    if (spreadValue < 1.2) parts.push("and you rate within a narrow band");
    else if (spreadValue > 2.4) parts.push("and you use the whole scale");
  }

  return parts.length ? `You are ${parts.join(", ")}.` : "A steady rater.";
}

function buildSignal({ reviews, pairs }) {
  const ratings = reviews.map((r) => r.rating).filter(Number.isFinite);
  const spreadValue = spread(ratings);
  const div = divergence(pairs);

  // Which decades the user actually reviews, from the year carried on the
  // review's film. Absent years are dropped rather than bucketed as zero.
  const decades = {};
  for (const r of reviews) {
    const year = Number.parseInt(r.year, 10);
    if (!Number.isFinite(year) || year < 1900) continue;
    const decade = Math.floor(year / 10) * 10;
    decades[decade] = (decades[decade] || 0) + 1;
  }

  return {
    total: ratings.length,
    mean: round(mean(ratings), 2),
    spread: round(spreadValue, 2),
    histogram: histogram(ratings),
    highest: ratings.length ? Math.max(...ratings) : null,
    lowest: ratings.length ? Math.min(...ratings) : null,
    comparedOn: div.count,
    bias: div.bias,
    contrarian: div.contrarian,
    decades: Object.entries(decades)
      .map(([decade, count]) => ({ decade: Number(decade), count }))
      .sort((a, b) => a.decade - b.decade),
    verdict: verdict({ total: ratings.length, bias: div.bias, spreadValue }),
  };
}

module.exports = { buildSignal, histogram, mean, spread, divergence, round, verdict };
