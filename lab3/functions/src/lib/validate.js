const SENSOR_TYPES = ['temperature', 'humidity', 'light', 'camera'];
const MAX_IMAGE_BYTES = 1024 * 1024;

function validateMeasurement(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return 'body must be a JSON object';
  if (typeof b.sensor_id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(b.sensor_id)) {
    return 'sensor_id must be 1-64 characters: letters, digits, "-" or "_"';
  }
  if (!SENSOR_TYPES.includes(b.sensor_type)) return `sensor_type must be one of: ${SENSOR_TYPES.join(', ')}`;
  if (typeof b.value !== 'number' || !Number.isFinite(b.value)) return 'value must be a finite number';
  if (typeof b.unit !== 'string' || !b.unit || b.unit.length > 16) return 'unit must be a non-empty string up to 16 characters';
  const loc = b.location;
  if (!loc || typeof loc.lat !== 'number' || typeof loc.lon !== 'number') return 'location must contain numeric lat and lon';
  if (loc.lat < -90 || loc.lat > 90 || loc.lon < -180 || loc.lon > 180) return 'location is out of range';
  if (typeof b.measured_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(b.measured_at) || Number.isNaN(Date.parse(b.measured_at))) {
    return 'measured_at must be an ISO 8601 timestamp';
  }
  if (b.sensor_type === 'camera') {
    if (typeof b.object_key !== 'string' || !b.object_key.startsWith(`camera/${b.sensor_id}/`)) {
      return 'camera messages need object_key "camera/<sensor_id>/..." returned by /camera/upload-url';
    }
    if (b.unit !== 'bytes' || b.value <= 0 || b.value > MAX_IMAGE_BYTES) return 'camera value must be the image size in bytes (up to 1 MB)';
  }
  return null;
}

module.exports = { SENSOR_TYPES, MAX_IMAGE_BYTES, validateMeasurement };
