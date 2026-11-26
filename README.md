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
starts in the wrong place. 16 tests.

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
cd movie-review-frontend && npm test    # 155
cd movie-review-backend  && npm test    # 113
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

## Architecture

The engineering detail, including the resolver, the signal maths and where
the system degrades rather than fails, is in [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Deployment

Live at **https://cineinfinity.web.app**.


The frontend is a static build on Firebase Hosting. The backend runs on
Render from `movie-review-backend`, with `npm install` to build and
`npm start` to run.

Three settings, all on the backend service:

| Variable | Required | What happens without it |
|---|---|---|
| `MONGO_URI` | for reviews | Reviews return an error; browsing and search still work |
| `FIREBASE_SERVICE_ACCOUNT` | for sign-in | Authenticated routes answer 503; everything else works |
| `CORS_ORIGINS` | when the frontend URL changes | The browser blocks every request from the new origin |

`FIREBASE_SERVICE_ACCOUNT` takes the service-account JSON, or base64 of it.
Base64 is safer in a dashboard field, which tends to mangle the newlines in
the private key:

```bash
base64 -i firebaseServiceAccount.json | pbcopy
```

The server does not exit when a setting is missing or a dependency is
unreachable. It binds its port, logs the specific fault, and reports it:

```bash
curl https://<service>/health
```

A healthy server returns 200. A degraded one returns 503 and names the
subsystem that is down, so a bad deploy is one request to diagnose rather
than a scroll through logs. This matters on a host that redeploys per commit:
exiting on a missing variable turns one wrong setting into a crash loop, a
failed deploy and a notification on every push, while taking down the parts
of the API that never needed that variable.

---

## Known limits

- Review search is a case-insensitive regular expression, not a text index.
  Correct and fast enough at this size; a real corpus wants a MongoDB text
  index or Atlas Search.
- Your Signal compares a user against the people who rated the same films
  here, which is a small crowd. It says so rather than implying a verdict
  drawn from everyone.
- The cache is in-memory, so a restart clears it. A shared cache would need
  another service to run, which is not worth it to protect one daily quota.
- Catalogue cards resolve a TMDb title through OMDb to get an IMDb id, since
  reviews are keyed by it. The year is passed to disambiguate, but two films
  sharing a title and a year would still collide.
