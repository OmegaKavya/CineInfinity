/**
 * AniList, called directly from the browser.
 *
 * No proxy and no key. AniList's public GraphQL API needs neither, and it is
 * the only source that publishes the typed relation edges - PREQUEL, SEQUEL,
 * SIDE_STORY - that the watch-order resolver is built on. Routing it through
 * our backend would add a hop and a failure point for nothing.
 */

const ENDPOINT = 'https://graphql.anilist.co';

async function query(document, variables) {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: document, variables }),
  });

  if (response.status === 429) {
    throw new Error('AniList is rate-limiting us. Try again in a moment.');
  }
  if (!response.ok) {
    throw new Error(`AniList returned ${response.status}.`);
  }

  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(payload.errors[0].message || 'AniList rejected the query.');
  }
  return payload.data;
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
    relations: (media.relations?.edges || []).map((edge) => ({
      id: edge.node.id,
      relationType: edge.relationType,
      type: edge.node.type,
    })),
  };
}

const MEDIA_FIELDS = `
  id
  title { romaji english }
  format
  episodes
  startDate { year month }
  averageScore
  description(asHtml: false)
  coverImage { large }
  bannerImage
  siteUrl
  relations { edges { relationType node { id type } } }
`;

/** Popular anime, for the catalogue grid. */
export async function popularAnime(page = 1, perPage = 20) {
  const data = await query(
    `query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        pageInfo { currentPage lastPage }
        media(type: ANIME, sort: POPULARITY_DESC, isAdult: false) { ${MEDIA_FIELDS} }
      }
    }`,
    { page, perPage }
  );

  return {
    page: data.Page.pageInfo.currentPage,
    totalPages: Math.min(data.Page.pageInfo.lastPage, 50),
    results: data.Page.media.map(toEntry),
  };
}

/** Search anime by title. */
export async function searchAnime(search, perPage = 12) {
  const data = await query(
    `query ($search: String, $perPage: Int) {
      Page(perPage: $perPage) {
        media(type: ANIME, search: $search, sort: SEARCH_MATCH, isAdult: false) { ${MEDIA_FIELDS} }
      }
    }`,
    { search, perPage }
  );
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

  const promise = query(`query ($id: Int) { Media(id: $id) { ${MEDIA_FIELDS} } }`, { id })
    .then((data) => toEntry(data.Media))
    .catch(() => null); // a missing entry must not abort the whole traversal

  cache.set(id, promise);
  return promise;
}
