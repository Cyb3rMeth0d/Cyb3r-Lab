const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const ROOT_DIR = __dirname;
const DEFAULT_LIBRARY_DIR = path.join(ROOT_DIR, 'library');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const STATIC_FILES = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.css', ['app.css', 'text/css; charset=utf-8']],
  ['/theme.css', ['theme.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
]);

function isSafeFilePath(fileName) {
  if (typeof fileName !== 'string' || !fileName || fileName.includes('\\') || fileName.includes('\0')) {
    return false;
  }
  return fileName.split('/').every((segment) => segment && segment !== '.' && segment !== '..');
}

function displayTitle(fileName) {
  return path.basename(fileName, path.extname(fileName))
    .replace(/[._-]+/g, ' ')
    .trim();
}

function getFileType(fileName) {
  const extension = path.extname(fileName).slice(1).toUpperCase();
  return extension || 'ARCHIVO';
}

async function listFiles(libraryDir, relativeDirectory = '') {
  const directoryPath = path.join(libraryDir, ...relativeDirectory.split('/').filter(Boolean));
  let entries;
  try {
    entries = await fs.promises.readdir(directoryPath, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }

  const files = [];
  for (const entry of entries) {
    if (entry.name === '.gitkeep') continue;

    const relativePath = relativeDirectory
      ? path.posix.join(relativeDirectory, entry.name)
      : entry.name;
    const filePath = path.join(libraryDir, ...relativePath.split('/'));

    if (entry.isDirectory()) {
      files.push(...await listFiles(libraryDir, relativePath));
      continue;
    }
    if (!entry.isFile()) continue;

    let stats;
    try {
      stats = await fs.promises.lstat(filePath);
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    if (!stats.isFile() || stats.isSymbolicLink()) continue;

    files.push({
      file: relativePath,
      title: displayTitle(entry.name) || entry.name,
      type: getFileType(entry.name),
      directory: relativeDirectory,
      size: stats.size,
      modifiedAt: stats.mtime.toISOString(),
    });
  }

  return files.sort((left, right) => left.file.localeCompare(right.file, 'es'));
}

async function resolveFile(libraryDir, fileName) {
  if (!isSafeFilePath(fileName)) return null;

  let filePath = libraryDir;
  let stats;
  const segments = fileName.split('/');
  for (const [index, segment] of segments.entries()) {
    filePath = path.join(filePath, segment);
    try {
      stats = await fs.promises.lstat(filePath);
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null;
      throw error;
    }

    if (stats.isSymbolicLink()) return null;
    if (index < segments.length - 1 && !stats.isDirectory()) return null;
  }

  if (!stats.isFile()) return null;
  return { filePath, stats };
}

function sendJson(response, statusCode, value) {
  const body = JSON.stringify(value);
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(body);
}

function parseRange(rangeHeader, size) {
  if (!rangeHeader) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
  if (!match || (!match[1] && !match[2]) || size === 0) return false;

  let start;
  let end;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (suffixLength <= 0) return false;
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
  }

  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) {
    return false;
  }
  return { start, end: Math.min(end, size - 1) };
}

function sendFile(request, response, filePath, fileName, size) {
  const downloadName = path.posix.basename(fileName);
  const safeName = downloadName.replace(/[\r\n"\\]/g, '_');
  const headers = {
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`,
    'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
  };
  const range = parseRange(request.headers.range, size);

  if (range === false) {
    response.writeHead(416, { ...headers, 'Content-Range': `bytes */${size}` });
    response.end();
    return;
  }

  if (range) {
    const contentLength = range.end - range.start + 1;
    response.writeHead(206, {
      ...headers,
      'Content-Length': contentLength,
      'Content-Range': `bytes ${range.start}-${range.end}/${size}`,
    });
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    const stream = fs.createReadStream(filePath, range);
    stream.on('error', () => response.destroy());
    stream.pipe(response);
    return;
  }

  response.writeHead(200, { ...headers, 'Content-Length': size });
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  const stream = fs.createReadStream(filePath);
  stream.on('error', () => response.destroy());
  stream.pipe(response);
}

function createAppServer(options = {}) {
  const libraryDir = path.resolve(options.libraryDir || process.env.LIBRARY_DIR || DEFAULT_LIBRARY_DIR);
  const publicDir = path.resolve(options.publicDir || PUBLIC_DIR);

  return http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url, 'http://localhost');
    const pathname = requestUrl.pathname;

    try {
      if (pathname === '/api/catalog' && request.method === 'GET') {
        sendJson(response, 200, { files: await listFiles(libraryDir) });
        return;
      }

      if (pathname === '/api/download' && ['GET', 'HEAD'].includes(request.method)) {
        const fileName = requestUrl.searchParams.get('file');
        const file = await resolveFile(libraryDir, fileName);
        if (!file) {
          sendJson(response, 404, { error: 'Archivo no encontrado.' });
          return;
        }
        sendFile(request, response, file.filePath, fileName, file.stats.size);
        return;
      }

      const staticFile = STATIC_FILES.get(pathname);
      if (staticFile && ['GET', 'HEAD'].includes(request.method)) {
        const [fileName, contentType] = staticFile;
        const filePath = path.join(publicDir, fileName);
        const body = await fs.promises.readFile(filePath);
        response.writeHead(200, {
          'Content-Type': contentType,
          'Content-Length': body.length,
          'Cache-Control': 'no-cache',
          'X-Content-Type-Options': 'nosniff',
        });
        response.end(request.method === 'HEAD' ? undefined : body);
        return;
      }

      sendJson(response, 404, { error: 'No encontrado.' });
    } catch (error) {
      if (response.headersSent) {
        response.destroy(error);
        return;
      }
      sendJson(response, 500, { error: 'Error al leer la biblioteca local.' });
    }
  });
}

function getLanAddresses() {
  return Object.values(os.networkInterfaces())
    .flatMap((interfaces) => interfaces || [])
    .filter((address) => address.family === 'IPv4' && !address.internal)
    .map((address) => address.address);
}

if (require.main === module) {
  const port = Number(process.env.PORT || 8080);
  const host = process.env.HOST || '0.0.0.0';
  const server = createAppServer();
  server.listen(port, host, () => {
    console.log(`Cyb3rLab LAN disponible en http://localhost:${port}`);
    for (const address of getLanAddresses()) {
      console.log(`Red local: http://${address}:${port}`);
    }
    console.log(`Biblioteca: ${path.resolve(process.env.LIBRARY_DIR || DEFAULT_LIBRARY_DIR)}`);
  });
}

module.exports = { createAppServer, listFiles, parseRange };