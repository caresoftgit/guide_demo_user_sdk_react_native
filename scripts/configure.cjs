const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source =
  process.env.VOICE_CONFIG_FILE || path.join(root, 'config/voice.local.json');
const config = JSON.parse(
  fs.readFileSync(
    fs.existsSync(source)
      ? source
      : path.join(root, 'config/voice.example.json'),
    'utf8',
  ),
);
const allowed = [
  'backendUrl',
  'bootstrapUrl',
  'accountId',
  'appId',
  'businessNumber',
  'supportName',
  'pushEnvironment',
  'firebase',
];
if (Object.keys(config).some(key => !allowed.includes(key))) {
  throw new Error('Only public application configuration is accepted');
}
if (
  config.firebase &&
  Object.keys(config.firebase).some(
    key => !['appId', 'apiKey', 'projectId', 'senderId'].includes(key),
  )
) {
  throw new Error('Only public Firebase application configuration is accepted');
}
for (const key of ['backendUrl', 'bootstrapUrl']) {
  const url = new URL(config[key]);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      'Application backends require HTTPS without embedded credentials',
    );
  }
}
const encoded = JSON.stringify(config, null, 2) + '\n';
if (/cvsk_|cvr_|cva_|cvt_|PRIVATE KEY/.test(encoded)) {
  throw new Error('Server secrets and session credentials cannot be bundled');
}
for (const file of [
  'src/voice.config.json',
  'android/app/src/main/assets/voice_config.json',
  'ios/CustomerVoiceDemo/voice_config.json',
]) {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, encoded);
}
