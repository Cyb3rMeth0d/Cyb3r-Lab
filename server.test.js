const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { after, before, test } = require('node:test');
const { createAppServer } = require('./server');

let baseUrl;
let libraryDir;
let server;
let temporaryDir;

before(async () => {
  temporaryDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cyb3rlab-lan-'));
  libraryDir = path.join(temporaryDir, 'library');
  await fs.mkdir(path.join(libraryDir, 'nested'), { recursive: true });
  await fs.writeFile(path.join(libraryDir, 'Demo_Game.pkg'), '0123456789abcdef');
  await fs.writeFile(path.join(libraryDir, 'not-a-package.nsp'), 'nsp test data');
  await fs.writeFile(path.join(libraryDir, 'notes.txt'), 'text test data');
  await fs.writeFile(path.join(libraryDir, 'LICENSE'), 'extensionless file');
  await fs.writeFile(path.join(libraryDir, '.gitkeep'), '');
  await fs.writeFile(path.join(libraryDir, 'nested', 'manual.json'), '{"ok":true}');
  const outsideFile = path.join(temporaryDir, 'private.bin');
  const outsideDirectory = path.join(temporaryDir, 'private-directory');
  await fs.writeFile(outsideFile, 'private');
  await fs.mkdir(outsideDirectory);
  await fs.writeFile(path.join(outsideDirectory, 'secret.txt'), 'private');
  await fs.symlink(outsideFile, path.join(libraryDir, 'linked.bin'));
  await fs.symlink(outsideDirectory, path.join(libraryDir, 'linked-directory'));
  server = createAppServer({ libraryDir });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (temporaryDir) await fs.rm(temporaryDir, { recursive: true, force: true });
});

test('el catálogo muestra distintos formatos y subcarpetas', async () => {
  const response = await fetch(`${baseUrl}/api/catalog`);
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.files.length, 5);
  assert.ok(result.files.some((file) => file.file === 'Demo_Game.pkg' && file.type === 'PKG'));
  assert.ok(result.files.some((file) => file.file === 'not-a-package.nsp' && file.type === 'NSP'));
  assert.ok(result.files.some((file) => file.file === 'notes.txt' && file.type === 'TXT'));
  assert.ok(result.files.some((file) => file.file === 'LICENSE' && file.type === 'ARCHIVO'));
  assert.ok(result.files.some((file) => file.file === 'nested/manual.json' && file.type === 'JSON'));
  assert.ok(result.files.every((file) => !file.file.startsWith('.')));
});

test('la descarga admite rangos de bytes', async () => {
  const response = await fetch(`${baseUrl}/api/download?file=Demo_Game.pkg`, {
    headers: { Range: 'bytes=2-6' },
  });

  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-range'), 'bytes 2-6/16');
  assert.equal(await response.text(), '23456');
});

test('la descarga funciona con una extensión no especial y una ruta anidada', async () => {
  const response = await fetch(`${baseUrl}/api/download?file=nested%2Fmanual.json`);

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-disposition'), /manual\.json/);
  assert.equal(await response.text(), '{"ok":true}');
});

test('la descarga rechaza rutas fuera de la biblioteca y archivos inexistentes', async () => {
  const traversal = await fetch(`${baseUrl}/api/download?file=..%2Fsecret.pkg`);
  const missing = await fetch(`${baseUrl}/api/download?file=missing.bin`);
  const linkedFile = await fetch(`${baseUrl}/api/download?file=linked.bin`);
  const linkedDirectory = await fetch(`${baseUrl}/api/download?file=linked-directory%2Fsecret.txt`);

  assert.equal(traversal.status, 404);
  assert.equal(missing.status, 404);
  assert.equal(linkedFile.status, 404);
  assert.equal(linkedDirectory.status, 404);
});

test('la página del catálogo se sirve correctamente', async () => {
  const response = await fetch(baseUrl);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
  assert.match(await response.text(), /Cyb3rLab LAN/);

  const themeResponse = await fetch(`${baseUrl}/theme.css`);
  assert.equal(themeResponse.status, 200);
  assert.match(themeResponse.headers.get('content-type'), /text\/css/);
  assert.match(await themeResponse.text(), /--acid: #a2ffd0/);
});

test('una ruta con codificación inválida no rompe el servidor', async () => {
  const response = await fetch(`${baseUrl}/%E0%A4%A`);
  assert.equal(response.status, 404);
});

test('un rango inválido se rechaza con 416', async () => {
  const response = await fetch(`${baseUrl}/api/download?file=Demo_Game.pkg`, {
    headers: { Range: 'bytes=99-100' },
  });

  assert.equal(response.status, 416);
  assert.equal(response.headers.get('content-range'), 'bytes */16');
});