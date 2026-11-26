// Sent as `code` on every 502 this server returns because a service it calls
// (AniList, OMDb, TMDb) failed. Render answers 502 as well while a sleeping
// instance starts, and the frontend wakes and retries on that. Without a tag
// it could not tell the two apart, so a broken upstream looked like a
// sleeping server and the visitor waited through a wake that changed nothing.
// The frontend checks for the same string in src/api/client.js.
const UPSTREAM_UNAVAILABLE = "UPSTREAM_UNAVAILABLE";

module.exports = { UPSTREAM_UNAVAILABLE };
