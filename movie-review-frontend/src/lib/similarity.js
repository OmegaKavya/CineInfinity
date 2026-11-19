/**
 * "If you liked this" for anime, scored from AniList's tag profiles.
 *
 * Why tags rather than ratings: a recommender trained on this site's own
 * ratings would be trained on almost nothing, and one trained on a public
 * ratings dump would recommend whatever is popular. AniList publishes a
 * ranked tag profile per series, voted on by its users. Comparing two of
 * those profiles asks a question with an actual answer: how much do these
 * two shows overlap in what they are about?
 *
 * The scoring is deliberately simple and explainable. Every recommendation
 * can name the tags it was made on, which is the part a viewer can argue
 * with. A black-box score they cannot interrogate is worth less than a
 * slightly worse one they can.
 */

/** Tags below this rank are noise: a handful of votes on a long tail. */
const MIN_RANK = 60;

/** Spoiler tags are excluded. A recommendation should not give the plot away. */
function usableTags(entry) {
  return (entry?.tags || []).filter(
    (tag) =>
      tag &&
      typeof tag.name === 'string' &&
      (tag.rank ?? 0) >= MIN_RANK &&
      !tag.isGeneralSpoiler &&
      !tag.isMediaSpoiler
  );
}

/**
 * Weighted overlap between two tag profiles.
 *
 * A shared tag contributes the product of its ranks, so two series that both
 * lean heavily on a tag count for more than two that merely touch it. The
 * total is normalised by the smaller profile's own weight, which stops a
 * series with forty tags beating one with eight purely on volume.
 */
export function tagSimilarity(a, b) {
  const left = usableTags(a);
  const right = usableTags(b);
  if (!left.length || !right.length) return { score: 0, shared: [] };

  const rightByName = new Map(right.map((tag) => [tag.name, tag.rank ?? 0]));

  let overlap = 0;
  const shared = [];
  left.forEach((tag) => {
    const otherRank = rightByName.get(tag.name);
    if (otherRank === undefined) return;
    const weight = ((tag.rank ?? 0) / 100) * (otherRank / 100);
    overlap += weight;
    shared.push({ name: tag.name, weight });
  });

  if (!overlap) return { score: 0, shared: [] };

  const selfWeight = (tags) =>
    tags.reduce((total, tag) => total + ((tag.rank ?? 0) / 100) ** 2, 0);
  const denominator = Math.min(selfWeight(left), selfWeight(right)) || 1;

  shared.sort((x, y) => y.weight - x.weight);

  return {
    score: overlap / denominator,
    shared: shared.map((tag) => tag.name),
  };
}

/** Genres agreeing is weaker evidence than tags, so it only nudges the score. */
function genreBonus(a, b) {
  const left = new Set(a?.genres || []);
  if (!left.size) return 0;
  const shared = (b?.genres || []).filter((genre) => left.has(genre));
  return shared.length / Math.max(left.size, (b?.genres || []).length, 1);
}

/**
 * Rank `candidates` by how much they resemble `seed`.
 *
 * Anything already in the franchise is excluded: recommending the sequel of
 * the thing you just looked up is not a recommendation, and the watch-order
 * panel already covers it.
 */
export function similarTo(seed, candidates, { exclude = [], limit = 6 } = {}) {
  if (!seed) return [];
  const excluded = new Set([seed.id, ...exclude]);

  return (candidates || [])
    .filter((candidate) => candidate && !excluded.has(candidate.id))
    .map((candidate) => {
      const { score, shared } = tagSimilarity(seed, candidate);
      return {
        entry: candidate,
        score: score + 0.25 * genreBonus(seed, candidate),
        shared: shared.slice(0, 3),
      };
    })
    .filter((result) => result.shared.length > 0 && result.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
