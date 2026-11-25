const { CosmosClient } = require('@azure/cosmos');

let container = null;

function enabled() {
  return !!(process.env.COSMOS_ENDPOINT && process.env.COSMOS_KEY);
}

function getContainer() {
  if (!container) {
    const client = new CosmosClient({ endpoint: process.env.COSMOS_ENDPOINT, key: process.env.COSMOS_KEY });
    container = client
      .database(process.env.COSMOS_DATABASE || 'telemetry')
      .container(process.env.COSMOS_CONTAINER || 'raw');
  }
  return container;
}

async function saveRaw(message) {
  const doc = { ...message, id: message.measured_at, stored_at: new Date().toISOString() };
  await getContainer().items.upsert(doc);
}

async function history(sensorId, from, to, limit) {
  const { resources } = await getContainer().items.query(
    {
      query: `SELECT TOP @limit c.sensor_id, c.sensor_type, c["value"], c.unit, c.location, c.measured_at, c.object_key
              FROM c
              WHERE c.sensor_id = @id AND c.measured_at >= @from AND c.measured_at <= @to
              ORDER BY c.measured_at DESC`,
      parameters: [
        { name: '@id', value: sensorId },
        { name: '@from', value: from },
        { name: '@to', value: to },
        { name: '@limit', value: limit },
      ],
    },
    { partitionKey: sensorId }
  ).fetchAll();
  return resources;
}

module.exports = { enabled, saveRaw, history };
