/**
 * The only AniList documents this server will forward.
 *
 * An open GraphQL proxy would let anyone post arbitrary queries to AniList
 * with this server's address on them: their rate limit to spend, and our IP
 * to get blocked. The client sends an operation name; the document itself
 * lives here.
 *
 * These must stay in step with the shapes the frontend reads in
 * src/api/anilist.js. The field list is shared between all three, so a field
 * added for one is available to the others.
 */

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
  genres
  tags { name rank isGeneralSpoiler isMediaSpoiler }
  relations { edges { relationType node { id type } } }
`;

module.exports = {
  popular: `query ($page: Int, $perPage: Int) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { currentPage lastPage }
      media(type: ANIME, sort: POPULARITY_DESC, isAdult: false) { ${MEDIA_FIELDS} }
    }
  }`,

  search: `query ($search: String, $perPage: Int) {
    Page(perPage: $perPage) {
      media(type: ANIME, search: $search, sort: SEARCH_MATCH, isAdult: false) { ${MEDIA_FIELDS} }
    }
  }`,

  entry: `query ($id: Int) { Media(id: $id) { ${MEDIA_FIELDS} } }`,
};
