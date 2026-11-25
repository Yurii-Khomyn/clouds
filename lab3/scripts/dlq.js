const { ServiceBusClient } = require('@azure/service-bus');

const connection = process.env.SERVICEBUS_CONNECTION;
const queueName = process.env.SERVICEBUS_QUEUE || 'telemetry';
if (!connection) {
  console.error('SERVICEBUS_CONNECTION is required (terraform output -raw servicebus_connection)');
  process.exit(1);
}

(async () => {
  const client = new ServiceBusClient(connection);
  const receiver = client.createReceiver(queueName, { subQueueType: 'deadLetter' });
  const messages = await receiver.peekMessages(20);
  console.log(`dead-letter queue ${queueName}/$deadletterqueue: ${messages.length} message(s)`);
  for (const m of messages) {
    console.log(JSON.stringify({
      messageId: m.messageId,
      deliveryCount: m.deliveryCount,
      reason: m.deadLetterReason,
      description: m.deadLetterErrorDescription,
      enqueuedAt: m.enqueuedTimeUtc,
      body: m.body,
    }, null, 2));
  }
  await client.close();
})().catch((err) => { console.error(err.message); process.exit(1); });
