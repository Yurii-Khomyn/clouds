const {
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
} = require('@azure/storage-blob');

const UPLOAD_TTL_MINUTES = 10;
const READ_TTL_MINUTES = 15;

let cached = null;
function get() {
  if (!cached) {
    const account = process.env.MEDIA_ACCOUNT_NAME;
    const credential = new StorageSharedKeyCredential(account, process.env.MEDIA_ACCOUNT_KEY);
    const service = new BlobServiceClient(`https://${account}.blob.core.windows.net`, credential);
    cached = { credential, container: service.getContainerClient(process.env.MEDIA_CONTAINER || 'camera') };
  }
  return cached;
}

function sasUrl(objectKey, permissions, minutes) {
  const { credential, container } = get();
  const blob = container.getBlockBlobClient(objectKey);
  const expiresOn = new Date(Date.now() + minutes * 60 * 1000);
  const sas = generateBlobSASQueryParameters({
    containerName: container.containerName,
    blobName: objectKey,
    permissions: BlobSASPermissions.parse(permissions),
    startsOn: new Date(Date.now() - 60 * 1000),
    expiresOn,
    protocol: 'https',
  }, credential).toString();
  return { url: `${blob.url}?${sas}`, expiresOn };
}

function createUploadUrl(sensorId) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const objectKey = `camera/${sensorId}/${stamp}.jpg`;
  const { url, expiresOn } = sasUrl(objectKey, 'cw', UPLOAD_TTL_MINUTES);
  return { objectKey, url, expiresOn };
}

function createReadUrl(objectKey) {
  return sasUrl(objectKey, 'r', READ_TTL_MINUTES);
}

async function objectSize(objectKey) {
  try {
    const props = await get().container.getBlockBlobClient(objectKey).getProperties();
    return props.contentLength;
  } catch (err) {
    if (err.statusCode === 404) return null;
    throw err;
  }
}

module.exports = { createUploadUrl, createReadUrl, objectSize, UPLOAD_TTL_MINUTES, READ_TTL_MINUTES };
