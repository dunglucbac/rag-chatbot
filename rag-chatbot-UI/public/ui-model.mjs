export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export function fileType(file) {
  const extensions = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    tif: 'image/tiff',
    tiff: 'image/tiff',
    heic: 'image/heic',
    heif: 'image/heif',
    heifs: 'image/heif-sequence',
  };
  const type = extensions[file.name.split('.').pop().toLowerCase()];
  if (!type)
    throw new Error(
      'Choose a PDF or a supported receipt image (JPEG, PNG, WebP, TIFF, or HEIC).',
    );
  if (!file.size)
    throw new Error('This file is empty. Choose another receipt.');
  if (file.size > MAX_FILE_BYTES)
    throw new Error('Choose a file smaller than 25 MB.');
  return type;
}

export function money(amount, currency) {
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(Number(amount));
  } catch {
    return `${Number(amount).toLocaleString('en')} ${currency}`;
  }
}

export function localInput(iso) {
  return new Date(new Date(iso).getTime() + 7 * 3600000)
    .toISOString()
    .slice(0, 19);
}

export function inputTimestamp(value) {
  const timestamp = new Date(`${value}+07:00`);
  if (!Number.isFinite(timestamp.getTime()))
    throw new Error('Choose a valid purchase date.');
  return timestamp.toISOString();
}

export function receiptInput(form, source) {
  const read = (name) => form.elements.namedItem(name).value.trim();
  return {
    merchant: read('merchant'),
    purchasedAt: inputTimestamp(read('purchasedAt')),
    currency: read('currency').toUpperCase(),
    total: Number(read('total')),
    tax: read('tax') === '' ? null : Number(read('tax')),
    confidence: source.confidence ?? 1,
    discrepancy: null,
    lineItems: [...form.querySelectorAll('.line-item')].map((row) => {
      const value = (name) =>
        row.querySelector(`[data-field="${name}"]`).value.trim();
      return {
        name: value('name'),
        totalPrice: Number(value('totalPrice')),
        ...(value('quantity') !== ''
          ? { quantity: Number(value('quantity')) }
          : {}),
        ...(value('unitPrice') !== ''
          ? { unitPrice: Number(value('unitPrice')) }
          : {}),
      };
    }),
  };
}

// Build only text nodes and known elements; uploaded text never becomes HTML.
export function renderReply(container, text) {
  const doc = container.ownerDocument;
  function inline(parent, value) {
    const pattern =
      /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
    let start = 0;
    for (const match of value.matchAll(pattern)) {
      parent.append(doc.createTextNode(value.slice(start, match.index)));
      const element = doc.createElement(
        match[1] ? 'strong' : match[2] ? 'code' : 'a',
      );
      element.textContent = match[1] ?? match[2] ?? match[3];
      if (match[4]) {
        element.href = match[4];
        element.target = '_blank';
        element.rel = 'noopener noreferrer';
      }
      parent.append(element);
      start = match.index + match[0].length;
    }
    parent.append(doc.createTextNode(value.slice(start)));
  }
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    if (line.startsWith('```')) {
      const pre = doc.createElement('pre');
      const block = [];
      while (++i < lines.length && !lines[i].startsWith('```'))
        block.push(lines[i]);
      pre.textContent = block.join('\n');
      container.append(pre);
      continue;
    }
    if (line.includes('|') && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1] ?? '')) {
      const wrap = doc.createElement('div');
      wrap.className = 'table-wrap';
      const table = doc.createElement('table');
      const addRow = (value, heading) => {
        const row = doc.createElement('tr');
        value
          .trim()
          .replace(/^\||\|$/g, '')
          .split('|')
          .forEach((cell) => {
            const td = doc.createElement(heading ? 'th' : 'td');
            inline(td, cell.trim());
            row.append(td);
          });
        table.append(row);
      };
      addRow(line, true);
      i++;
      while (
        i + 1 < lines.length &&
        lines[i + 1].includes('|') &&
        lines[i + 1].trim()
      )
        addRow(lines[++i], false);
      wrap.append(table);
      container.append(wrap);
      continue;
    }
    const element = doc.createElement(/^#{1,6}\s/.test(line) ? 'h3' : 'p');
    inline(element, line.replace(/^#{1,6}\s+/, '').replace(/^[-*]\s+/, '• '));
    container.append(element);
  }
}
