const { app } = require('@azure/functions');
const { ServiceBusClient } = require('@azure/service-bus');
const { hasValidKey } = require('../lib/auth');
const { validateMeasurement } = require('../lib/validate');

const queueName = process.env.SERVICEBUS_QUEUE || 'telemetry';
let sender = null;

function getSender() {
  if (!sender) {
    sender = new ServiceBusClient(process.env.SERVICEBUS_CONNECTION).createSender(queueName);
  }
  return sender;
}

app.http('ingest', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'ingest',
  handler: async (request, context) => {
    if (!hasValidKey(request)) {
      return { status: 401, jsonBody: { error: 'invalid or missing x-api-key' } };
    }
    let body;
    try {
      body = await request.json();
    } catch {
      return { status: 400, jsonBody: { error: 'body must be valid JSON' } };
    }
    const error = validateMeasurement(body);
    if (error) return { status: 400, jsonBody: { error } };

    const messageId = `${body.sensor_id}|${body.measured_at}`;
    try {
      await getSender().sendMessages({ body, messageId, contentType: 'application/json' });
    } catch (err) {
      context.error('failed to enqueue message', err.message);
      return { status: 503, jsonBody: { error: 'queue is unavailable, retry later' } };
    }
    return { status: 202, jsonBody: { message_id: messageId } };
  },
});
