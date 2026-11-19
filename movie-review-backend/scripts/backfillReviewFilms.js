#!/usr/bin/env node
/**
 * Fill in the film details on reviews written before they were stored.
 *
 * Reviews used to hold only an IMDb id. The feeds and Your Signal now read a
 * title, year and poster off the review itself, so a feed does not make one
 * upstream call per row. Rows written before that change have none, and they
 * render as a raw "tt1568346" where a film name belongs.
 *
 * Run once after deploying that change:
 *
 *   node scripts/backfillReviewFilms.js            # report only
 *   node scripts/backfillReviewFilms.js --write    # apply
 *
 * It is deliberately conservative. It reads nothing but reviews missing a
 * title, writes nothing but the three display fields, never overwrites a
 * value that is already there, and reports a dry run unless --write is
 * passed. Running it twice is a no-op.
 */
const mongoose = require("mongoose");
const axios = require("axios");
require("dotenv").config();

const Review = require("../models/review");

const WRITE = process.argv.includes("--write");
const OMDB = "https://www.omdbapi.com/";

async function lookup(imdbID) {
  const { data } = await axios.get(OMDB, {
    params: { i: imdbID, apikey: process.env.OMDB_API_KEY },
    timeout: 15000,
  });
  if (data.Response === "False") return null;
  return {
    title: data.Title,
    year: data.Year,
    // OMDb returns the string "N/A" rather than omitting the field.
    poster: data.Poster && data.Poster !== "N/A" ? data.Poster : undefined,
  };
}

async function main() {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not set.");
  if (!process.env.OMDB_API_KEY) throw new Error("OMDB_API_KEY is not set.");

  await mongoose.connect(process.env.MONGO_URI);
  console.log(WRITE ? "Applying changes.\n" : "Dry run. Pass --write to apply.\n");

  // Only rows actually missing a title. An empty string counts as missing;
  // a real title never does.
  const stale = await Review.find({
    $or: [{ title: { $exists: false } }, { title: null }, { title: "" }],
  }).lean();

  if (!stale.length) {
    console.log("Nothing to backfill.");
    return;
  }

  // One lookup per distinct film, not per review: several people reviewing
  // the same film should not cost several identical upstream calls.
  const ids = [...new Set(stale.map((r) => r.movieId))];
  console.log(`${stale.length} reviews across ${ids.length} films.\n`);

  const details = new Map();
  for (const id of ids) {
    try {
      const film = await lookup(id);
      if (film) details.set(id, film);
      console.log(`  ${id}  ${film ? film.title : "not found at OMDb, skipping"}`);
    } catch (error) {
      console.log(`  ${id}  lookup failed (${error.message}), skipping`);
    }
  }

  let updated = 0;
  for (const review of stale) {
    const film = details.get(review.movieId);
    if (!film) continue;
    if (WRITE) {
      // $set only the display fields. Nothing else on the document is
      // touched, so a rating or comment cannot be lost to this script.
      await Review.updateOne({ _id: review._id }, { $set: film });
    }
    updated += 1;
  }

  console.log(
    `\n${WRITE ? "Updated" : "Would update"} ${updated} of ${stale.length} reviews.`
  );
}

main()
  .catch((error) => {
    console.error("Backfill failed:", error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
