const { ServiceBusClient } = require('@azure/service-bus');

const connection = process.env.SERVICEBUS_CONNECTION;
const queueName = process.env.SERVICEBUS_QUEUE || 'orders';
const enabled = !!connection && process.env.ORDERS_MODE !== 'direct';

let client = null;
let sender = null;
function getClient() {
  if (!client) client = new ServiceBusClient(connection);
  return client;
}

async function enqueue(message) {
  if (!sender) sender = getClient().createSender(queueName);
  await sender.sendMessages({ body: message, messageId: message.requestId, contentType: 'application/json' });
}

function consume(handler, { concurrency = 4 } = {}) {
  const receiver = getClient().createReceiver(queueName, { receiveMode: 'peekLock' });
  receiver.subscribe(
    {
      processMessage: async (msg) => handler(msg.body, msg.deliveryCount),
      processError: async (args) => console.error('queue error:', args.error.message),
    },
    { maxConcurrentCalls: concurrency, autoCompleteMessages: true }
  );
  return receiver;
}

async function close(receiver) {
  if (receiver) await receiver.close().catch(() => {});
  if (sender) await sender.close().catch(() => {});
  if (client) await client.close().catch(() => {});
}

module.exports = { enabled, enqueue, consume, close };
