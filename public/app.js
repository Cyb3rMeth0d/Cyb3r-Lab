const catalog = document.querySelector('#catalog');
const count = document.querySelector('#file-count');
const totalSize = document.querySelector('#total-size');
const search = document.querySelector('#search');
const sort = document.querySelector('#sort');
const emptyState = document.querySelector('#empty-state');
const emptyMessage = document.querySelector('#empty-message');
const errorMessage = document.querySelector('#catalog-error');
const refreshButton = document.querySelector('#refresh');

const artworkColors = ['#465b36', '#8e4536', '#354d77', '#795e32', '#32665e', '#61446f'];
let files = [];

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${new Intl.NumberFormat('es', { maximumFractionDigits: 1 }).format(value)} ${units[unit]}`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat('es', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
}

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function createCard(item, index) {
  const card = makeElement('article', 'package-card');
  const art = makeElement('div', 'package-art');
  art.style.setProperty('--art-color', artworkColors[index % artworkColors.length]);
  art.setAttribute('aria-hidden', 'true');
  art.append(makeElement('span', 'package-monogram', item.title.slice(0, 2).toUpperCase()));

  const content = makeElement('div', 'package-content');
  content.append(makeElement('span', 'package-type', `Formato / ${item.type}`));
  content.append(makeElement('h3', 'package-title', item.title));

  const meta = makeElement('div', 'package-meta');
  meta.append(makeElement('span', '', formatSize(item.size)));
  meta.append(makeElement('span', '', formatDate(item.modifiedAt)));
  if (item.directory) meta.append(makeElement('span', '', item.directory));

  const download = makeElement('a', 'package-download');
  download.href = `/api/download?file=${encodeURIComponent(item.file)}`;
  download.append(makeElement('span', 'download-arrow', '\u2193'));
  download.append(document.createTextNode('Descargar'));

  content.append(meta, download);
  card.append(art, content);
  return card;
}

function render() {
  const query = search.value.trim().toLocaleLowerCase('es');
  const visibleFiles = files
    .filter((item) => `${item.title} ${item.file} ${item.type}`.toLocaleLowerCase('es').includes(query))
    .sort((left, right) => {
      if (sort.value === 'recent') return new Date(right.modifiedAt) - new Date(left.modifiedAt);
      if (sort.value === 'size') return right.size - left.size;
      return left.file.localeCompare(right.file, 'es');
    });

  catalog.replaceChildren(...visibleFiles.map(createCard));
  emptyState.hidden = visibleFiles.length > 0;
  emptyMessage.textContent = files.length === 0
    ? 'La biblioteca está vacía.'
    : 'No hay archivos que coincidan.';
  count.textContent = `${visibleFiles.length} ${visibleFiles.length === 1 ? 'archivo' : 'archivos'}`;
  totalSize.textContent = formatSize(files.reduce((total, item) => total + item.size, 0));
}

async function loadCatalog() {
  catalog.setAttribute('aria-busy', 'true');
  errorMessage.hidden = true;
  refreshButton.classList.add('is-refreshing');

  try {
    const response = await fetch('/api/catalog', { cache: 'no-store' });
    if (!response.ok) throw new Error('No se pudo leer la biblioteca.');
    const result = await response.json();
    files = result.files;
    render();
  } catch {
    catalog.replaceChildren();
    emptyState.hidden = true;
    count.textContent = 'Sin conexión';
    errorMessage.textContent = 'No se pudo conectar con la biblioteca local.';
    errorMessage.hidden = false;
  } finally {
    catalog.setAttribute('aria-busy', 'false');
    refreshButton.classList.remove('is-refreshing');
  }
}

search.addEventListener('input', render);
sort.addEventListener('change', render);
refreshButton.addEventListener('click', loadCatalog);
document.addEventListener('keydown', (event) => {
  if (event.key === '/' && document.activeElement !== search) {
    event.preventDefault();
    search.focus();
  }
  if (event.key === 'Escape' && document.activeElement === search) {
    search.value = '';
    search.blur();
    render();
  }
});

loadCatalog();