/**
 * Connect to MongoDB, trying again on a timer while the first connect fails.
 *
 * mongoose reconnects a connection that drops, but not one that never
 * opened: once the first connect rejects, the connection stays disconnected
 * even after the database comes up. Checked against mongoose 8.24 by failing
 * a connect to a closed port and then starting a database on it. Without
 * this, a database that was unreachable when the server started (a paused
 * cluster, an IP allowlist fixed a minute later) stayed unavailable until
 * the next deploy.
 *
 * Bounded, because a wrong URI or password fails the same way every time,
 * and retrying it forever would only fill the log.
 */
function connectMongo(connect, { attempts = 10, delayMs = 30 * 1000 } = {}) {
  return new Promise((resolve) => {
    const attempt = (n) => {
      connect().then(
        () => {
          console.log("MongoDB connected");
          resolve(true);
        },
        (err) => {
          console.error(`MongoDB connection failed (attempt ${n} of ${attempts}):`, err.message);
          if (n >= attempts) {
            console.error("Giving up on MongoDB; reviews stay unavailable until the next restart.");
            resolve(false);
            return;
          }
          setTimeout(() => attempt(n + 1), delayMs);
        }
      );
    };
    attempt(1);
  });
}

module.exports = { connectMongo };
