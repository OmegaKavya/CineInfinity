/**
 * AniList, through our own backend.
 *
 * This called graphql.anilist.co straight from the browser, on the reasoning
 * that a public API needing no key needs no proxy. Production disagreed.
 *
 * AniList rate-limits per client IP, and from the browser the client is the
 * visitor. People on one network exhaust the budget for each other, and the
 * failure arrives as an opaque CORS error rather than a 429, because the
 * rate-limit response carries no CORS headers. The portfolio's embedded demo
 * hit exactly this and fell back to its saved run.
 *
 * Proxied, the client is one server with one budget, responses are cached
 * for an hour across every visitor, and a rate limit comes back as a 429 the
 * UI can actually explain. The query documents live on the server, so this
 * sends an operation name rather than arbitrary GraphQL.
 */
import { api, looksAsleep, visitorError, wakeBackend } from './client';

async function query(operation, variables, { retried = false } = {}) {
  try {
    const { data } = await api.post(
      '/anilist/graphql',
      { operation, variables },
      // Generous once, because the first call after the instance sleeps is
      // competing with a cold start.
      retried ? { timeout: 45000 } : undefined
    );
    return data.data;
  } catch (error) {
    if (error.response?.status === 429) {
      throw visitorError('AniList is rate-limiting us. Try again in a moment.');
    }

    // A sleeping instance is not a broken feature. Start it, wait, try once
    // more, and only then report a failure.
    if (!retried && looksAsleep(error)) {
      const awake = await wakeBackend();
      if (awake) return query(operation, variables, { retried: true });
      throw visitorError(
        'The server was asleep and did not wake in time. It is on a free ' +
          'instance; give it a moment and try again.'
      );
    }

    // Not the server's error text: that is for the server's log.
    throw visitorError('Could not reach AniList. Try again in a moment.');
  }
}

/** Shape AniList returns into the flat form the rest of the app expects. */
function toEntry(media) {
  if (!media) return null;
  return {
    id: media.id,
    title: media.title?.english || media.title?.romaji || 'Untitled',
    romaji: media.title?.romaji,
    format: media.format,
    episodes: media.episodes,
    startDate: media.startDate,
    averageScore: media.averageScore,
    description: media.description,
    cover: media.coverImage?.large || null,
    banner: media.bannerImage || null,
    siteUrl: media.siteUrl,
    genres: media.genres || [],
    tags: media.tags || [],
    relations: (media.relations?.edges || []).map((edge) => ({
      id: edge.node.id,
      relationType: edge.relationType,
      type: edge.node.type,
    })),
  };
}

// The documents themselves now live in the backend, at
// movie-review-backend/lib/anilistQueries.js. They still request the ranked
// tag profile with its spoiler flags, which is what the "if you liked this"
// scoring reads, and the typed relation edges the resolver walks.

/** Popular anime, for the catalogue grid. */
export async function popularAnime(page = 1, perPage = 20) {
  const data = await query('popular', { page, perPage });

  return {
    page: data.Page.pageInfo.currentPage,
    totalPages: Math.min(data.Page.pageInfo.lastPage, 50),
    results: data.Page.media.map(toEntry),
  };
}

/** Search anime by title. */
export async function searchAnime(search, perPage = 12) {
  const data = await query('search', { search, perPage });
  return data.Page.media.map(toEntry);
}

/**
 * One entry by id, with its relations.
 *
 * Memoised for the life of the page because the watch-order traversal
 * revisits entries constantly: every sequel names its prequel, so a franchise
 * of twenty entries would otherwise be fetched roughly twice over, and
 * AniList rate-limits at 90 requests a minute.
 */
const cache = new Map();

export async function fetchEntry(id) {
  if (cache.has(id)) return cache.get(id);

  const promise = query('entry', { id })
    .then((data) => toEntry(data.Media))
    .catch(() => {
      // A missing entry must not abort the whole traversal, so this resolves
      // to null rather than rejecting. But the null is not cached: a failure
      // is usually the server being asleep, and caching it meant the same
      // entries stayed empty after it woke, until the page was reloaded.
      cache.delete(id);
      return null;
    });

  cache.set(id, promise);
  return promise;
}
