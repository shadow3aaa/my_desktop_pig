import { copyFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const destination = resolve('src-tauri/gen/android/app/src/main/assets/overlay');
await mkdir(destination, { recursive: true });
await copyFile('dist-overlay/pet.js', resolve(destination, 'pet.js'));
await copyFile('dist-overlay/pet.css', resolve(destination, 'pet.css'));
for (const name of ['LICENSE', 'NOTICE.txt']) {
  await copyFile(name, resolve(destination, name));
  await copyFile(name, resolve('dist', name));
}
await writeFile(resolve(destination, 'index.html'), `<!doctype html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><title>小猪悬浮窗</title><link rel="stylesheet" href="pet.css"></head><body><main id="app"></main><script src="pet.js"></script></body></html>
`);
// These six files were the old independently maintained animation payload.
for (const name of ['walk.png', 'dance.png', 'dragged.png', 'fall_asleep.png', 'sleep_loop.png', 'wake_up.png']) await rm(resolve(destination, name), { force: true });
console.log('Android overlay generated from shared pet runtime.');
