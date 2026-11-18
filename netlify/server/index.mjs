import { getConnectionString } from '@netlify/database';
import { server, connectDatabase } from '../../server.js';

connectDatabase(getConnectionString(), { secureCookies: process.env.NETLIFY_DEV !== 'true' });

export default server;
