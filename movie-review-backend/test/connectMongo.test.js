const test = require("node:test");
const assert = require("node:assert/strict");
const net = require("node:net");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { connectMongo } = require("../lib/connectMongo");

const realConsoleError = console.error;
const realConsoleLog = console.log;
test.beforeEach(() => {
  console.error = () => {};
  console.log = () => {};
});
test.afterEach(() => {
  console.error = realConsoleError;
  console.log = realConsoleLog;
});

test("a connect that fails is tried again until it succeeds", async () => {
  let calls = 0;
  const connect = async () => {
    calls += 1;
    if (calls < 3) throw new Error("connect ECONNREFUSED");
  };
  assert.equal(await connectMongo(connect, { attempts: 5, delayMs: 1 }), true);
  assert.equal(calls, 3);
});

test("a connect that keeps failing is given up on after the last attempt", async () => {
  let calls = 0;
  const connect = async () => {
    calls += 1;
    throw new Error("bad auth : authentication failed");
  };
  assert.equal(await connectMongo(connect, { attempts: 3, delayMs: 1 }), false);
  assert.equal(calls, 3);
});

// The reason this exists, against the real driver: mongoose leaves a
// connection whose first connect failed disconnected for good, even once the
// database is up.
test("mongoose reaches a database that starts after the first attempt failed", async (t) => {
  const port = await new Promise((resolve) => {
    const probe = net.createServer().listen(0, "127.0.0.1", () => {
      const { port: free } = probe.address();
      probe.close(() => resolve(free));
    });
  });

  let mongo;
  let calls = 0;
  const connect = async () => {
    calls += 1;
    try {
      await mongoose.connect(`mongodb://127.0.0.1:${port}/late`, { serverSelectionTimeoutMS: 500 });
    } finally {
      // Nothing listens on the port during the first attempt.
      if (calls === 1) mongo = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1", port } });
    }
  };
  t.after(async () => {
    await mongoose.disconnect();
    await mongo?.stop();
  });

  assert.equal(await connectMongo(connect, { attempts: 5, delayMs: 50 }), true);
  assert.ok(calls > 1, "the first attempt should have failed");
  assert.equal(mongoose.connection.readyState, 1);
});
