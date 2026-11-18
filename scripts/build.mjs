import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'dist');
const require = createRequire(import.meta.url);
const socketIo = path.dirname(require.resolve('socket.io/package.json'));

await mkdir(path.join(output, 'socket.io'), { recursive: true });
for (const file of ['index.html', 'styles.css', 'app.js', 'sw.js']) {
  await copyFile(path.join(root, file), path.join(output, file));
}
await copyFile(
  path.join(socketIo, 'client-dist', 'socket.io.js'),
  path.join(output, 'socket.io', 'socket.io.js'),
);
