const express = require("express");
const axios = require("axios");

const router = express.Router();

const ENDPOINT = "https://graphql.anilist.co";

/**
 * AniList, proxied.
 *
 * It used to be called straight from the browser, on the reasoning that a
 * public API needing no key needs no proxy. That was wrong for two reasons
 * visible in production.
 *
 * AniList rate-limits per client IP. Called from the browser the client is
 * the visitor, so a few people on one office or campus network exhaust the
 * budget for each other, and the failure arrives as an opaque CORS error
 * because the 429 carries no CORS headers. Called from here the client is
 * one server, the limit is one budget we control, and the cache below means
 * most requests never reach AniList at all.
 *
 * It also means the resolver's data path is ours end to end: the same cache,
 * the same error shape and the same health reporting as every other upstream.
 */

// Only these operations are forwarded. An open GraphQL proxy would let
// anyone post arbitrary queries to AniList with this server's address on
// them, which is their rate limit to spend and our IP to get blocked.
const OPERATIONS = require("../lib/anilistQueries");

module.exports = function createAnilistRouter(cache) {
  router.post("/graphql", async (req, res) => {
    const { operation, variables } = req.body || {};

    const document = OPERATIONS[operation];
    if (!document) {
      return res.status(400).json({
        error: `Unknown operation. Expected one of: ${Object.keys(OPERATIONS).join(", ")}.`,
      });
    }

    // Variables are part of the cache identity, so "popular page 2" and
    // "popular page 3" are different entries rather than one overwriting
    // the other.
    const key = `anilist:${operation}:${JSON.stringify(variables || {})}`;

    try {
      const data = await cache.wrap(key, async () => {
        const response = await axios.post(
          ENDPOINT,
          { query: document, variables: variables || {} },
          {
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            timeout: 12000,
          }
        );
        if (response.data?.errors?.length) {
          const message = response.data.errors[0].message || "AniList rejected the query.";
          const error = new Error(message);
          error.status = 502;
          throw error;
        }
        return response.data?.data;
      });

      res.json({ data });
    } catch (error) {
      // AniList's own 429 is worth passing through as a 429, so the client
      // can say "try again shortly" rather than "something went wrong".
      const upstream = error.response?.status;
      if (upstream === 429) {
        return res.status(429).json({ error: "AniList is rate-limiting. Try again shortly." });
      }
      res.status(error.status || 502).json({
        error: error.message || "Could not reach AniList.",
      });
    }
  });

  return router;
};
