import https from 'https';
import axios from 'axios';
import fs from 'fs';

export const rejectUnauthorizedSetting = !process.env.VHOST.endsWith('.localhost');

export const httpsAgent = new https.Agent({
  ca: fs.readFileSync(process.env.SSL_CACERT, 'utf8'),
  rejectUnauthorized: rejectUnauthorizedSetting,
});

export const request = axios.create({ httpsAgent });