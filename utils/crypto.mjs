import crypto from 'crypto';

function getKey() {
  return crypto.createHash('sha256')
    .update(process.env.ID_SALT || 'changeme_set_ID_SALT_in_env')
    .digest();
}

export function encryptId(telegramId) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', getKey(), iv);
  let enc = cipher.update(String(telegramId), 'utf8', 'hex');
  enc += cipher.final('hex');
  return iv.toString('hex') + ':' + enc;
}

export function decryptId(encrypted) {
  const [ivHex, enc] = encrypted.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', getKey(), iv);
  let dec = decipher.update(enc, 'hex', 'utf8');
  dec += decipher.final('utf8');
  return Number(dec);
}

export function encryptText(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', getKey(), iv);
  let enc = cipher.update(text, 'utf8', 'hex');
  enc += cipher.final('hex');
  return iv.toString('hex') + ':' + enc;
}

export function decryptText(encrypted) {
  const [ivHex, enc] = encrypted.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', getKey(), iv);
  let dec = decipher.update(enc, 'hex', 'utf8');
  dec += decipher.final('utf8');
  return dec;
}

export function hashId(telegramId) {
  return crypto.createHash('sha256')
    .update(String(telegramId) + (process.env.ID_SALT || 'changeme_set_ID_SALT_in_env'))
    .digest('hex');
}
