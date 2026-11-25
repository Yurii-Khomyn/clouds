const { app } = require('@azure/functions');
const { processMeasurement } = require('../lib/processing');

app.serviceBusQueue('process', {
  queueName: process.env.SERVICEBUS_QUEUE || 'telemetry',
  connection: 'SERVICEBUS_CONNECTION',
  handler: async (message, context) => {
    const started = Date.now();
    const result = await processMeasurement(message);
    context.log(
      `processed ${message.sensor_id} ${message.measured_at} ` +
      `inserted=${result.inserted} anomaly=${result.anomaly} in ${Date.now() - started}ms`
    );
  },
});
