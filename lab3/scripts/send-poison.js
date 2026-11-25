const { ServiceBusClient } = require('@azure/service-bus');

const connection = process.env.SERVICEBUS_CONNECTION;
const queueName = process.env.SERVICEBUS_QUEUE || 'telemetry';
if (!connection) {
  console.error('SERVICEBUS_CONNECTION is required (terraform output -raw servicebus_connection)');
  process.exit(1);
}

const poison = {
  sensor_id: 'broken-01',
  sensor_type: 'pressure',
  value: 'not-a-number',
  unit: 'hPa',
  location: { lat: 50.45, lon: 30.52 },
  measured_at: new Date().toISOString(),
};

(async () => {
  const client = new ServiceBusClient(connection);
  const sender = client.createSender(queueName);
  const messageId = `poison|${poison.measured_at}`;
  await sender.sendMessages({ body: poison, messageId, contentType: 'application/json' });
  console.log(`sent poison message ${messageId} straight to the queue (bypassing ingest validation)`);
  await client.close();
})().catch((err) => { console.error(err.message); process.exit(1); });
