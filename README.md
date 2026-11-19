# CineInfinity

A film and anime review platform whose watch-order resolver sorts a franchise
by its story rather than its release dates.

Browse Hollywood, Bollywood and anime, read and write reviews, and for any
anime series get the order you should actually watch it in. Release order is
frequently wrong: Kizumonogatari is a prequel that arrived seven years after
the series it precedes, so sorting by date hands you the ending first.

---

## The part worth looking at

`movie-review-frontend/src/lib/franchiseGraph.js`

AniList publishes typed relation edges between entries, prequel, sequel, side
story, alternative. The resolver walks that graph from a seed entry and
topologically sorts the prequel and sequel edges, which form the spine.
Everything off the spine, recaps and shorts and side stories, is classified
and ranked so it lands somewhere sensible rather than purely by date. Cycles
are detected rather than hung on, and entries whose prequels were never
fetched are identified so they are not mistaken for roots.

Verified against the case most tools get wrong: for Monogatari it returns
Kizumonogatari, then Nekomonogatari, then Bakemonogatari, where release order
starts in the wrong place. 14 tests.

`movie-review-frontend/src/lib/similarity.js` recommends related series by
comparing AniList tag profiles, and every suggestion names the tags it was
made on. A ratings model would have had almost nothing to learn from, since
the site has no users to learn from.

---

## Running it

Two processes. Node 22 or newer.

### Backend

```bash
cd movie-review-backend
npm install
cp .env.example .env     # then fill it in
npm start                # http://localhost:5001
```

`.env` needs a MongoDB connection string, an OMDb key, a TMDb key, and a
Firebase service account. The service account can be the JSON itself in
`FIREBASE_SERVICE_ACCOUNT`, base64 of that JSON, or a
`firebaseServiceAccount.json` file beside the server for local work. Base64 is
there because the key contains newlines that a dashboard field tends to
flatten, which Firebase then rejects without saying why.

### Frontend

```bash
cd movie-review-frontend
npm install
cp .env.example .env     # then fill it in
npm run dev              # http://localhost:5173
```

`VITE_API_BASE_URL` has no default on purpose. A missing value fails at
startup rather than silently writing to the production database.

The Firebase values in that file are identifiers, not secrets. They ship in
the bundle to every visitor by design; Security Rules are what protect the
data.

---

## How it fits together

```
movie-review-frontend     React 19 + Vite
  api/                    axios client, AniList GraphQL
  components/             presentation, no data fetching
  context/                auth and theme
  hooks/                  search, reviews, catalogues, debounce
  lib/                    the resolver and the recommender

movie-review-backend      Express + MongoDB
  routes/                 films, reviews, auth
  middleware/             validation, the auth gate
  lib/                    upstream cache, credential loader
```

Anime data comes straight from AniList in the browser: it needs no key and is
the only source carrying the relation edges. Film data goes through the
backend, which holds the OMDb and TMDb keys.

Browsing is open. Authentication guards only what it must, which is writing a
review.

### Caching

Every home page load would otherwise cost two TMDb calls and every search an
OMDb one, against a free tier of 1,000 requests a day. Upstream responses are
cached with a TTL matched to how the data behaves: 24 hours for film details,
an hour for searches, half an hour for the catalogues. Measured against the
running server, a catalogue request fell from 530ms to 2.2ms and a search from
828ms to 1.9ms.

The cache is single-flight, which is what actually protects the quota: ten
simultaneous requests for a key nobody has asked for make one upstream call,
not ten. Failures are never cached, so a transient outage is not served to
everyone for an hour.

`GET /health` reports the database state and the cache hit rate.

---

## Tests

```bash
cd movie-review-frontend && npm test    # 82
cd movie-review-backend  && npm test    # 54
```

The backend suite includes the review API end to end, real HTTP against real
handlers and real Mongoose on a throwaway MongoDB, with only Firebase stubbed.
It needs no keys and nothing provisioned.

Where a test guards something subtle, it was checked by reintroducing the bug
and confirming that test, and only that test, fails. That applies to the
ownership isolation on reviews, the token revocation check, the guard against
a stale search response overwriting a newer one, and the route ordering that
once made the search endpoints unreachable.

CI runs both suites, the production build and a dependency audit on every
push.

---

## Known limits

- Reviews are not paginated. Fine at this size, wrong at a larger one.
- The cache is in-memory, so a restart clears it. A shared cache would need
  another service to run, which is not worth it to protect one daily quota.
- Catalogue cards resolve a TMDb title through OMDb to get an IMDb id, since
  reviews are keyed by it. The year is passed to disambiguate, but two films
  sharing a title and a year would still collide.
