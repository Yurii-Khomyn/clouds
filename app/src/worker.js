const { pool, init } = require('./db');
const queue = require('./queue');
const { processOrderRequest } = require('./orders');

if (!queue.enabled) {
  console.error('SERVICEBUS_CONNECTION is not set');
  process.exit(1);
}

let receiver;

init()
  .then(() => {
    receiver = queue.consume(async (body, deliveryCount) => {
      const started = Date.now();
      await processOrderRequest(body);
      console.log(`order request ${body.requestId} processed in ${Date.now() - started}ms (delivery ${deliveryCount})`);
    }, { concurrency: Number(process.env.WORKER_CONCURRENCY || 4) });
    console.log('Worker started');
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

async function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  setTimeout(() => process.exit(1), 10000).unref();
  await queue.close(receiver);
  await pool.end().catch(() => {});
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
