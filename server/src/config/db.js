const mongoose = require('mongoose');

async function connectDB(uri) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  console.log(`MongoDB connected: ${mongoose.connection.host}`);
}

/**
 * Run `fn` inside a MongoDB transaction.
 *
 * Transactions need a replica set (Atlas, or the docker-compose setup here).
 * A plain local `mongod` is a standalone server and rejects transactions,
 * so we fall back to running without one - fine for local dev, but
 * production should always be a replica set.
 */
async function withTransaction(fn) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } catch (err) {
    const notSupported =
      err.code === 20 || /Transaction numbers are only allowed/i.test(err.message);
    if (!notSupported) throw err;
    return fn(undefined);
  } finally {
    await session.endSession();
  }
}

module.exports = { connectDB, withTransaction };
