const { app } = require('@azure/functions');
const { hasValidKey } = require('../lib/auth');
const media = require('../lib/media');

app.http('cameraUploadUrl', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'camera/upload-url',
  handler: async (request) => {
    if (!hasValidKey(request)) {
      return { status: 401, jsonBody: { error: 'invalid or missing x-api-key' } };
    }
    let body;
    try {
      body = await request.json();
    } catch {
      return { status: 400, jsonBody: { error: 'body must be valid JSON' } };
    }
    if (!body || typeof body.sensor_id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(body.sensor_id)) {
      return { status: 400, jsonBody: { error: 'sensor_id is required' } };
    }
    const { objectKey, url, expiresOn } = media.createUploadUrl(body.sensor_id);
    return {
      status: 200,
      jsonBody: {
        object_key: objectKey,
        upload_url: url,
        method: 'PUT',
        headers: { 'x-ms-blob-type': 'BlockBlob', 'content-type': 'image/jpeg' },
        expires_at: expiresOn.toISOString(),
      },
    };
  },
});
