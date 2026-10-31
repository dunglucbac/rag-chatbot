import {
  fileType,
  money,
  localInput,
  receiptInput,
  renderReply,
} from './ui-model.mjs';

const $ = (id) => document.getElementById(id);
const icons = {
  receipt:
    '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h8M8 15h5"/>',
  refresh:
    '<path d="M20 7v5h-5M4 17v-5h5M19 11a7 7 0 0 0-12-5L4 9m16 6-3 3a7 7 0 0 1-12-5"/>',
  logout: '<path d="M9 4H5v16h4m5-12 4 4-4 4m-5-4h12"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  trash: '<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v6m4-6v6"/>',
  chart: '<path d="M4 3v17h17M8 15v-4m5 4V7m5 8V4"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
  upload: '<path d="M4 15v5h16v-5M12 16V3M7 8l5-5 5 5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  camera: '<path d="M8 6l2-3h4l2 3h5v14H3V6z"/><circle cx="12" cy="13" r="4"/>',
  arrow: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
};
function icon(name) {
  const span = document.createElement('span');
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] ?? icons.receipt}</svg>`;
  return span;
}
document
  .querySelectorAll('[data-icon]')
  .forEach((node) => node.replaceChildren(icon(node.dataset.icon)));
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function button(text, className, action) {
  const node = el('button', className, text);
  node.type = 'button';
  node.addEventListener('click', action);
  return node;
}
function brandMark() {
  const node = el('span', 'brand-mark', 'L');
  node.setAttribute('aria-hidden', 'true');
  node.append(el('span', '', '↗'));
  return node;
}
const state = {
  user: null,
  token: '',
  current: null,
  messages: [],
  jobs: new Map(),
  sessions: [],
  historyOffset: null,
  before: null,
  sending: false,
  uploading: false,
  loading: false,
  localUploads: [],
  draftMessage: '',
  drawerTab: 'saved',
  results: [],
  resultOffset: null,
  editorDirty: false,
  editorBusy: false,
};
let createPromise,
  viewGeneration = 0,
  resultsGeneration = 0,
  editorGeneration = 0,
  toastTimer,
  polling = false;

function notify(message) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').hidden = false;
  toastTimer = setTimeout(() => ($('toast').hidden = true), 6500);
}
function dateLabel(value) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(value));
}
function signedOut(message = '') {
  state.token = '';
  sessionStorage.removeItem('ledger.token');
  viewGeneration++;
  resultsGeneration++;
  editorGeneration++;
  Object.assign(state, {
    user: null,
    current: null,
    messages: [],
    sessions: [],
    sending: false,
    uploading: false,
    loading: false,
    localUploads: [],
    draftMessage: '',
  });
  state.jobs.clear();
  $('app').hidden = true;
  $('boot').hidden = true;
  $('login').hidden = false;
  $('message').value = '';
  $('timeline').replaceChildren();
  $('history').replaceChildren();
  $('drawer-results').replaceChildren();
  $('editor-content').replaceChildren();
  $('drawer').close();
  $('editor').close();
  $('login-error').textContent = message;
}
async function api(path, options = {}) {
  const token = state.token;
  const response = await fetch(path, {
    signal: AbortSignal.timeout(180000),
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  if (token !== state.token) throw new Error('The signed-in account changed.');
  if (response.status === 401) {
    signedOut(
      'Your session has expired. Sign in with Google again.',
    );
    throw new Error('Please sign in again.');
  }
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.status === 'error') {
    const error = new Error(
      payload?.message ?? `Request failed (${response.status}). Try again.`,
    );
    error.status = response.status;
    throw error;
  }
  return payload?.data;
}
const post = (path, body) =>
  api(path, {
    method: 'POST',
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

function navBusy() {
  return state.sending || state.uploading || state.loading;
}
function setBusy() {
  $('send').disabled = state.sending || state.loading;
  $('message').disabled = state.sending || state.loading;
  ['attach', 'camera', 'welcome-upload'].forEach(
    (id) => ($(id).disabled = state.uploading || state.loading),
  );
  $('new-chat').disabled = navBusy();
  $('delete-chat').disabled = navBusy();
  $('history')
    .querySelectorAll('button')
    .forEach((node) => (node.disabled = navBusy()));
  $('activity').textContent = state.sending
    ? 'Looking through your spending…'
    : state.uploading
      ? 'Uploading receipts. You can keep chatting while they process.'
      : '';
}
function menu(open) {
  const mobile = matchMedia('(max-width:700px)').matches;
  $('app').classList.toggle('sidebar-open', open);
  $('sidebar-scrim').hidden = !open || !mobile;
  $('menu').setAttribute('aria-expanded', String(open));
  $('sidebar').inert = mobile && !open;
  $('sidebar').setAttribute('aria-hidden', String(mobile && !open));
  document.querySelector('.main').inert = mobile && open;
  if (mobile && open) $('new-chat').focus();
}
function renderHistory() {
  const history = $('history');
  history.replaceChildren();
  if (!state.sessions.length)
    history.append(
      el(
        'p',
        'empty-history',
        'A fresh page. Your conversations will appear here.',
      ),
    );
  for (const session of state.sessions) {
    const node = button(
      '',
      `history-button${session.id === state.current?.id ? ' active' : ''}`,
      () => openSession(session.id),
    );
    node.append(
      el('strong', '', session.title),
      el('small', '', dateLabel(session.updatedAt)),
    );
    node.disabled = navBusy();
    history.append(node);
  }
  $('more-history').hidden = state.historyOffset === null;
}
async function loadHistory(more = false) {
  const result = await api(
    `/chat/sessions?offset=${more ? state.historyOffset : 0}`,
  );
  state.sessions = more
    ? [
        ...state.sessions,
        ...result.sessions.filter(
          (s) => !state.sessions.some((old) => old.id === s.id),
        ),
      ]
    : result.sessions;
  state.historyOffset = result.nextOffset;
  if (state.current)
    state.current =
      state.sessions.find((session) => session.id === state.current.id) ??
      state.current;
  renderHistory();
}
function renderTitle() {
  $('chat-title').textContent = state.current?.title ?? 'New conversation';
  $('delete-chat').hidden = !state.current;
  renderHistory();
}
function scrollEnd() {
  $('conversation').scrollTop = $('conversation').scrollHeight;
}
function uploadCard(job, local) {
  const card = el('article', 'upload-card');
  const file = el('div', 'file-icon');
  file.append(icon('receipt'));
  const info = el('div', 'upload-info');
  info.append(
    el('strong', '', job?.originalFilename ?? local?.file.name ?? 'Receipt'),
  );
  const status = job?.status ?? local?.status ?? 'pending';
  const labels = {
    pending: 'Queued for processing',
    processing: 'Reading the details…',
    needs_review: 'A quick review is needed',
    completed:
      job?.classification === 'receipt'
        ? 'Saved to your spending'
        : 'Processing complete',
    failed: 'Couldn’t process this upload',
    rejected: 'Not included in spending',
    uploading: 'Uploading securely…',
    queued: 'Waiting to upload',
    linking: 'Saving to this conversation…',
  };
  const meta = el('div', 'upload-meta');
  meta.append(
    el('span', `status-dot ${status}`),
    el('span', '', labels[status] ?? status),
  );
  info.append(meta);
  if (local?.error || job?.errorMessage)
    info.append(el('p', 'card-error', local?.error ?? job.errorMessage));
  if (job?.status === 'needs_review')
    info.append(
      button('Review details ↗', 'card-action', () => openReview(job.id)),
    );
  if (job?.status === 'completed' && job.classification === 'receipt')
    info.append(
      button('View & edit receipt ↗', 'card-action', () =>
        openReceiptForJob(job.id),
      ),
    );
  if (job?.status === 'failed')
    info.append(
      button('Retry processing ↗', 'card-action', async (event) => {
        const trigger = event.currentTarget;
        trigger.disabled = true;
        try {
          const result = await post(`/ingest/jobs/${job.id}/retry`);
          state.jobs.set(job.id, result.job);
          renderTimeline();
          if ($('drawer').open && state.drawerTab === 'uploads')
            renderResults();
        } catch (error) {
          notify(error.message);
          trigger.disabled = false;
        }
      }),
    );
  if (local?.status === 'failed')
    info.append(
      button(
        local.job ? 'Save to conversation ↗' : 'Retry upload ↗',
        'card-action',
        () => retryUpload(local),
      ),
    );
  if (job?.status === 'completed' && job.classification === 'document')
    info.append(
      el(
        'p',
        'form-note',
        'Recognized as a document; it does not count toward spending.',
      ),
    );
  card.append(file, info);
  return card;
}
function renderTimeline(scroll = false) {
  const timeline = $('timeline');
  const nearEnd =
    $('conversation').scrollHeight -
      $('conversation').scrollTop -
      $('conversation').clientHeight <
    120;
  timeline.replaceChildren();
  $('welcome').hidden = !!(
    state.messages.length ||
    state.localUploads.length ||
    state.draftMessage
  );
  if (state.before !== null)
    timeline.append(button('Load earlier messages', 'load-more', loadEarlier));
  for (const message of state.messages) {
    if (message.role === 'upload') {
      const job = state.jobs.get(message.ingestionJobId);
      timeline.append(
        job
          ? uploadCard(job)
          : button(`Load upload: ${message.content}`, 'load-more', () =>
              refreshUpload(message.ingestionJobId).catch((error) =>
                notify(error.message),
              ),
            ),
      );
      continue;
    }
    const row = el('article', `message ${message.role}`);
    const body = el('div', 'message-body');
    if (message.role === 'assistant') {
      row.append(brandMark());
      renderReply(body, message.content);
    } else body.textContent = message.content;
    row.append(body);
    timeline.append(row);
  }
  state.localUploads
    .filter(
      (upload) => !upload.sessionId || upload.sessionId === state.current?.id,
    )
    .forEach((upload) => timeline.append(uploadCard(null, upload)));
  if (state.draftMessage) {
    const row = el('article', 'message user');
    row.append(el('div', 'message-body', state.draftMessage));
    timeline.append(row);
  }
  if (state.sending)
    timeline.append(el('div', 'pending-message', 'Working on your question'));
  if (scroll || nearEnd) requestAnimationFrame(scrollEnd);
}
async function ensureSession() {
  if (state.current) return state.current.id;
  if (!createPromise)
    createPromise = post('/chat/sessions')
      .then((session) => {
        state.current = session;
        sessionStorage.setItem(`ledger.session.${state.user.id}`, session.id);
        renderTitle();
        return session.id;
      })
      .finally(() => (createPromise = null));
  return createPromise;
}
async function fetchMessages(id, before) {
  return api(
    `/chat/sessions/${encodeURIComponent(id)}${before ? `?before=${before}` : ''}`,
  );
}
async function loadJobsForMessages(messages) {
  await Promise.all(
    messages
      .filter((m) => m.role === 'upload')
      .map(async (m) => {
        try {
          const result = await api(
            `/ingest/jobs/${encodeURIComponent(m.ingestionJobId)}`,
          );
          state.jobs.set(m.ingestionJobId, result.job);
        } catch (error) {
          if (error.status !== 404) throw error;
        }
      }),
  );
}
async function openSession(id) {
  if (navBusy()) return;
  const generation = ++viewGeneration;
  state.loading = true;
  setBusy();
  menu(false);
  $('activity').textContent = 'Opening conversation…';
  try {
    const result = await fetchMessages(id);
    await loadJobsForMessages(result.messages);
    if (generation !== viewGeneration) return;
    state.current = result.session;
    state.messages = result.messages;
    state.before = result.nextBefore;
    state.draftMessage = '';
    state.localUploads = [];
    $('message').value = '';
    sessionStorage.setItem(`ledger.session.${state.user.id}`, id);
    renderTitle();
    renderTimeline(true);
  } catch (error) {
    notify(error.message);
  } finally {
    if (generation === viewGeneration) {
      state.loading = false;
      setBusy();
    }
  }
}
async function loadEarlier() {
  if (!state.current || !state.before) return;
  const id = state.current.id;
  const generation = viewGeneration;
  const height = $('conversation').scrollHeight;
  try {
    const result = await fetchMessages(id, state.before);
    await loadJobsForMessages(result.messages);
    if (generation !== viewGeneration) return;
    state.messages = [...result.messages, ...state.messages];
    state.before = result.nextBefore;
    renderTimeline();
    requestAnimationFrame(
      () =>
        ($('conversation').scrollTop +=
          $('conversation').scrollHeight - height),
    );
  } catch (error) {
    notify(error.message);
  }
}
function newChat() {
  if (navBusy()) return;
  viewGeneration++;
  menu(false);
  state.current = null;
  state.messages = [];
  state.before = null;
  state.localUploads = [];
  state.draftMessage = '';
  $('message').value = '';
  $('message').style.height = '';
  sessionStorage.removeItem(`ledger.session.${state.user.id}`);
  renderTitle();
  renderTimeline();
  $('message').focus();
}
async function sendMessage(event) {
  event?.preventDefault();
  const message = $('message').value.trim();
  if (!message || state.sending || state.loading) return;
  state.sending = true;
  state.draftMessage = message;
  $('message').value = '';
  $('message').style.height = '';
  setBusy();
  renderTimeline(true);
  try {
    const id = await ensureSession();
    const result = await post(`/chat/sessions/${id}/messages`, { message });
    state.draftMessage = '';
    state.messages.push(
      { role: 'user', content: message },
      { role: 'assistant', content: result.reply },
    );
    const history = await fetchMessages(id);
    state.messages = history.messages;
    state.before = history.nextBefore;
    state.current = history.session;
    await loadHistory();
    renderTitle();
  } catch (error) {
    if (state.user) {
      if (state.draftMessage) $('message').value = message;
      notify(error.message);
    }
  } finally {
    state.sending = false;
    state.draftMessage = '';
    setBusy();
    renderTimeline(true);
    if (state.user) $('message').focus();
  }
}

async function uploadOne(local, sessionId) {
  local.status = 'uploading';
  local.error = '';
  renderTimeline();
  try {
    if (!local.job) {
      const mimeType = fileType(local.file);
      const target = await post('/storage/upload-targets', {
        originalFilename: local.file.name,
        mimeType,
      });
      const response = await fetch(target.uploadUrl, {
        method: 'PUT',
        headers: target.uploadHeaders,
        body: local.file,
        signal: AbortSignal.timeout(120000),
      });
      if (!response.ok)
        throw new Error(
          'The file could not reach storage. Try uploading again.',
        );
      const digest = await crypto.subtle.digest(
        'SHA-256',
        await local.file.arrayBuffer(),
      );
      const checksumSha256 = [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
      const result = await post('/ingest', {
        storageKey: target.storageKey,
        checksumSha256,
      });
      local.job = result.job;
    }
    local.status = 'linking';
    renderTimeline();
    const entry = await post(`/chat/sessions/${sessionId}/uploads`, {
      ingestionJobId: local.job.id,
    });
    state.jobs.set(local.job.id, local.job);
    if (
      state.current?.id === sessionId &&
      !state.messages.some((message) => message.id === entry.id)
    )
      state.messages.push(entry);
    state.localUploads = state.localUploads.filter((item) => item !== local);
  } catch (error) {
    if (state.user) {
      local.status = 'failed';
      local.error = error.message;
    }
  }
  renderTimeline();
}
async function uploadFiles(files) {
  if (!files.length || state.uploading) return;
  const uploads = files.map((file) => ({
    file,
    status: 'queued',
    error: '',
    sessionId: null,
    job: null,
  }));
  state.localUploads.push(...uploads);
  state.uploading = true;
  setBusy();
  renderTimeline(true);
  try {
    const id = await ensureSession();
    for (const upload of uploads) {
      if (!state.user) break;
      upload.sessionId = id;
      await uploadOne(upload, id);
    }
    if (state.user) {
      await loadHistory();
      renderTitle();
    }
  } catch (error) {
    uploads.forEach((upload) => {
      upload.status = 'failed';
      upload.error = error.message;
    });
  } finally {
    state.uploading = false;
    setBusy();
    renderTimeline(true);
  }
}
async function retryUpload(local) {
  if (state.uploading) return;
  state.uploading = true;
  setBusy();
  try {
    await uploadOne(local, local.sessionId ?? (await ensureSession()));
    await loadHistory();
    renderTitle();
  } catch (error) {
    notify(error.message);
  } finally {
    state.uploading = false;
    setBusy();
  }
}
async function refreshUpload(id) {
  const result = await api(`/ingest/jobs/${encodeURIComponent(id)}`);
  state.jobs.set(id, result.job);
  renderTimeline();
  return result.job;
}

function renderResults() {
  const container = $('drawer-results');
  container.replaceChildren();
  if (!state.results.length)
    container.append(
      el(
        'div',
        'empty-state',
        state.drawerTab === 'saved'
          ? 'No receipts found. Upload a receipt in chat, or try another search.'
          : 'No uploads yet. Your receipts and processing status will appear here.',
      ),
    );
  for (const item of state.results) {
    if (state.drawerTab === 'uploads') {
      container.append(uploadCard(state.jobs.get(item.id) ?? item));
      continue;
    }
    const row = button('', 'receipt-row', () => openSavedReceipt(item.id));
    const file = el('div', 'file-icon');
    file.append(icon('receipt'));
    const summary = el('div', 'receipt-summary');
    summary.append(
      el('strong', '', item.merchant),
      el('small', '', dateLabel(item.purchasedAt)),
    );
    row.append(
      file,
      summary,
      el('span', 'amount', money(item.total, item.currency)),
    );
    container.append(row);
  }
  $('more-results').hidden = state.resultOffset === null;
}
async function loadResults(more = false) {
  const generation = ++resultsGeneration;
  const tab = state.drawerTab;
  if (!more) {
    $('drawer-results').replaceChildren(
      el('div', 'empty-state', 'Loading your records…'),
    );
    state.resultOffset = null;
    $('more-results').hidden = true;
  }
  const query = new URLSearchParams({
    offset: String(more ? (state.resultOffset ?? 0) : 0),
  });
  if (tab === 'saved') {
    if ($('receipt-search').value.trim())
      query.set('q', $('receipt-search').value.trim());
    if ($('date-from').value) query.set('from', $('date-from').value);
    if ($('date-to').value) query.set('to', $('date-to').value);
  }
  try {
    const result = await api(
      `/${tab === 'saved' ? 'receipts' : 'ingest/jobs'}?${query}`,
    );
    if (generation !== resultsGeneration) return;
    const rows = tab === 'saved' ? result.receipts : result.jobs;
    if (tab === 'uploads') rows.forEach((job) => state.jobs.set(job.id, job));
    state.results = more
      ? [
          ...state.results,
          ...rows.filter(
            (row) => !state.results.some((old) => old.id === row.id),
          ),
        ]
      : rows;
    state.resultOffset = result.nextOffset;
    renderResults();
  } catch (error) {
    if (generation === resultsGeneration) {
      const failure = el('div', 'empty-state', error.message);
      failure.append(button('Try again', 'load-more', () => loadResults()));
      $('drawer-results').replaceChildren(failure);
    }
  }
}
function showDrawer(tab = 'saved') {
  menu(false);
  state.drawerTab = tab;
  $('saved-tab').setAttribute('aria-selected', String(tab === 'saved'));
  $('uploads-tab').setAttribute('aria-selected', String(tab === 'uploads'));
  $('filters').hidden = tab !== 'saved';
  if (!$('drawer').open) $('drawer').showModal();
  loadResults();
}

function editorLoading(title) {
  const generation = ++editorGeneration;
  state.editorDirty = false;
  state.editorBusy = false;
  $('editor-title').textContent = title;
  $('editor-label').textContent = 'CHECK THE DETAILS';
  $('editor-content').replaceChildren(el('p', 'form-note', 'Loading details…'));
  if (!$('editor').open) $('editor').showModal();
  return generation;
}
function editorFailure(error) {
  $('editor-content').replaceChildren(el('p', 'form-error', error.message));
}
function closeEditor() {
  if (state.editorBusy) return;
  if (state.editorDirty && !confirm('Discard your unsaved changes?')) return;
  editorGeneration++;
  $('editor').close();
}
async function openSavedReceipt(id) {
  const generation = editorLoading('Receipt details');
  try {
    const receipt = await api(`/receipts/${encodeURIComponent(id)}`);
    if (generation === editorGeneration)
      receiptForm(receipt, { receiptId: id, revision: receipt.revision });
  } catch (error) {
    if (generation === editorGeneration) editorFailure(error);
  }
}
async function openReceiptForJob(jobId) {
  const generation = editorLoading('Receipt details');
  try {
    const result = await api(
      `/receipts?ingestionJobId=${encodeURIComponent(jobId)}`,
    );
    if (generation !== editorGeneration) return;
    if (!result.receipts.length)
      throw new Error(
        'This receipt may have matched an existing record. Find it in Saved receipts.',
      );
    await openSavedReceipt(result.receipts[0].id);
  } catch (error) {
    if (generation === editorGeneration) editorFailure(error);
  }
}
async function openReview(jobId) {
  const generation = editorLoading('Review upload');
  try {
    const job = await refreshUpload(jobId);
    if (generation !== editorGeneration) return;
    const payment = job.metadata?.paymentReview;
    const result = await api(
      `/ingest/jobs/${encodeURIComponent(jobId)}/${payment ? 'payment-review' : 'review'}`,
    );
    if (generation !== editorGeneration) return;
    if (job.status !== 'needs_review' || result.review.status !== 'pending')
      throw new Error('This upload has already been reviewed.');
    if (payment) paymentForm(result.review, jobId);
    else receiptForm(result.review.receipt, { jobId });
  } catch (error) {
    if (generation === editorGeneration) editorFailure(error);
  }
}
function field(label, name, value, type = 'text', required = true) {
  const node = el('label', 'field', label);
  const input = el('input');
  input.name = name;
  input.type = type;
  input.required = required;
  input.value = value ?? '';
  if (type === 'number') {
    input.min = '0';
    input.step = 'any';
    input.inputMode = 'decimal';
  }
  if (type === 'datetime-local') input.step = '1';
  if (type === 'text') input.maxLength = 255;
  node.append(input);
  return node;
}
function lineItem(item = {}) {
  const row = el('div', 'line-item');
  const name = el('div', 'line-name');
  const nameField = field('Item name', 'itemName', item.name);
  nameField.querySelector('input').dataset.field = 'name';
  const remove = button('', 'icon-button', () => {
    row.remove();
    state.editorDirty = true;
  });
  remove.setAttribute('aria-label', 'Remove line item');
  remove.append(icon('trash'));
  name.append(nameField, remove);
  row.append(name);
  const values = el('div', 'line-values');
  for (const [label, key, required] of [
    ['Quantity', 'quantity', false],
    ['Unit price', 'unitPrice', false],
    ['Item total', 'totalPrice', true],
  ]) {
    const node = field(label, key, item[key], 'number', required);
    node.querySelector('input').dataset.field = key;
    values.append(node);
  }
  row.append(values);
  return row;
}
async function afterReview(jobId) {
  state.editorDirty = false;
  $('editor').close();
  await refreshUpload(jobId);
  if ($('drawer').open) await loadResults();
  notify(
    'Review saved. Approved receipts appear in your spending after processing.',
  );
}
function receiptForm(source, context) {
  $('editor-title').textContent = context.receiptId
    ? 'Receipt details'
    : 'Review receipt';
  $('editor-label').textContent = context.receiptId
    ? 'YOUR SAVED RECEIPT'
    : 'A QUICK DOUBLE-CHECK';
  const form = el('form', 'editor-form');
  const grid = el('div', 'field-grid');
  const merchant = field('Merchant', 'merchant', source.merchant);
  merchant.classList.add('wide');
  const currency = field('Currency', 'currency', source.currency);
  const currencyInput = currency.querySelector('input');
  currencyInput.minLength = 3;
  currencyInput.maxLength = 3;
  currencyInput.pattern = '[A-Za-z]{3}';
  const purchaseDate = field(
    'Purchased at · Vietnam time',
    'purchasedAt',
    localInput(source.purchasedAt),
    'datetime-local',
  );
  purchaseDate.classList.add('date-field');
  grid.append(
    merchant,
    purchaseDate,
    currency,
    field('Total', 'total', source.total, 'number'),
    field('Tax (optional)', 'tax', source.tax, 'number', false),
  );
  form.append(grid, el('h3', '', 'Line items'));
  const items = el('div');
  (source.lineItems ?? []).forEach((item) => items.append(lineItem(item)));
  form.append(
    items,
    button('＋ Add line item', 'text-button', () => {
      items.append(lineItem());
      state.editorDirty = true;
    }),
  );
  form.append(
    el(
      'p',
      'form-note',
      context.receiptId
        ? 'Saving updates your spending totals. Item categories will be refreshed automatically.'
        : 'Check the merchant, date, amounts, and items before including this receipt in your spending.',
    ),
  );
  const errorNode = el('p', 'form-error');
  errorNode.setAttribute('role', 'alert');
  const actions = el('div', 'editor-actions');
  const save = el(
    'button',
    'primary',
    context.receiptId ? 'Save changes' : 'Approve receipt',
  );
  save.type = 'submit';
  if (context.jobId)
    actions.append(
      button('Reject receipt', 'danger-text', () => submit('reject')),
    );
  else actions.append(button('Cancel', 'text-button', closeEditor));
  actions.append(save);
  form.append(errorNode, actions);
  form.addEventListener('input', () => (state.editorDirty = true));
  async function submit(action) {
    if (state.editorBusy || (action !== 'reject' && !form.reportValidity()))
      return;
    state.editorBusy = true;
    form.querySelectorAll('button').forEach((node) => (node.disabled = true));
    errorNode.replaceChildren();
    try {
      if (context.receiptId) {
        const result = await api(`/receipts/${context.receiptId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            revision: context.revision,
            receipt: receiptInput(form, source),
          }),
        });
        state.editorDirty = false;
        $('editor').close();
        if ($('drawer').open) await loadResults();
        notify(
          result.categorizationQueued
            ? 'Receipt updated. Your spending totals now use these details.'
            : 'Receipt saved. Category processing could not be queued; spending totals are updated.',
        );
      } else {
        await post(
          `/ingest/jobs/${context.jobId}/review`,
          action === 'reject'
            ? { action }
            : { action, receipt: receiptInput(form, source) },
        );
        await afterReview(context.jobId);
      }
    } catch (error) {
      errorNode.textContent = error.message;
      if (error.status === 409 && context.receiptId)
        errorNode.append(
          button('Reload latest receipt', 'load-more', () => {
            if (confirm('Reload and discard these unsaved changes?'))
              openSavedReceipt(context.receiptId);
          }),
        );
    } finally {
      state.editorBusy = false;
      form
        .querySelectorAll('button')
        .forEach((node) => (node.disabled = false));
    }
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    submit('approve');
  });
  $('editor-content').replaceChildren(form);
}
function paymentForm(review, jobId) {
  $('editor-title').textContent = 'What was this payment for?';
  const form = el('form', 'editor-form');
  const facts = el('div', 'payment-facts');
  const payment = review.payment;
  facts.append(
    el('strong', '', money(payment.total, payment.currency)),
    el('p', '', payment.merchant),
    el('p', '', dateLabel(payment.purchasedAt)),
  );
  form.append(
    facts,
    field('What did you buy?', 'itemName', '', 'text'),
    el(
      'p',
      'form-note',
      'A bank transfer needs a purchase description before it can count toward spending. It will be saved as one receipt item.',
    ),
  );
  const errorNode = el('p', 'form-error');
  errorNode.setAttribute('role', 'alert');
  const actions = el('div', 'editor-actions');
  const save = el('button', 'primary', 'Confirm & save');
  save.type = 'submit';
  actions.append(
    button('Exclude payment', 'danger-text', () => submit('reject')),
    save,
  );
  form.append(errorNode, actions);
  form.addEventListener('input', () => (state.editorDirty = true));
  async function submit(action) {
    if (state.editorBusy || (action === 'approve' && !form.reportValidity()))
      return;
    state.editorBusy = true;
    form.querySelectorAll('button').forEach((node) => (node.disabled = true));
    errorNode.textContent = '';
    try {
      await post(`/ingest/jobs/${jobId}/payment-review`, {
        action,
        ...(action === 'approve'
          ? { itemName: form.elements.itemName.value.trim() }
          : {}),
      });
      await afterReview(jobId);
    } catch (error) {
      errorNode.textContent = error.message;
    } finally {
      state.editorBusy = false;
      form
        .querySelectorAll('button')
        .forEach((node) => (node.disabled = false));
    }
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    submit('approve');
  });
  $('editor-content').replaceChildren(form);
}

async function poll() {
  if (!state.user || document.hidden || polling) return;
  polling = true;
  try {
    const jobs = [...state.jobs.values()].filter((job) =>
      ['pending', 'processing', 'needs_review'].includes(job.status),
    );
    let changed = false;
    for (const job of jobs) {
      const result = await api(`/ingest/jobs/${job.id}`);
      if (
        result.job.updatedAt !== job.updatedAt ||
        result.job.status !== job.status
      )
        changed = true;
      state.jobs.set(job.id, result.job);
    }
    if (changed) {
      renderTimeline();
      if ($('drawer').open && state.drawerTab === 'uploads') renderResults();
    }
  } catch {
    /* Polling resumes on the next interval; manual refresh remains available. */
  } finally {
    polling = false;
  }
}

$('new-chat').addEventListener('click', newChat);
$('menu').addEventListener('click', () => menu(true));
$('sidebar-scrim').addEventListener('click', () => menu(false));
$('open-receipts').addEventListener('click', () => showDrawer());
$('sidebar-receipts').addEventListener('click', () => showDrawer());
$('close-drawer').addEventListener('click', () => $('drawer').close());
$('saved-tab').addEventListener('click', () => showDrawer('saved'));
$('uploads-tab').addEventListener('click', () => showDrawer('uploads'));
$('filters').addEventListener('submit', (event) => {
  event.preventDefault();
  loadResults();
});
$('more-results').addEventListener('click', () => loadResults(true));
$('refresh-history').addEventListener('click', () =>
  loadHistory().catch((error) => notify(error.message)),
);
$('more-history').addEventListener('click', () =>
  loadHistory(true).catch((error) => notify(error.message)),
);
$('composer').addEventListener('submit', sendMessage);
$('message').addEventListener('input', () => {
  $('message').style.height = 'auto';
  $('message').style.height = `${Math.min($('message').scrollHeight, 180)}px`;
});
$('message').addEventListener('keydown', (event) => {
  if (
    event.key === 'Enter' &&
    !event.shiftKey &&
    !event.isComposing &&
    matchMedia('(min-width:701px)').matches
  ) {
    event.preventDefault();
    sendMessage();
  }
});
document.querySelectorAll('[data-prompt]').forEach((node) =>
  node.addEventListener('click', () => {
    $('message').value = node.dataset.prompt;
    sendMessage();
  }),
);
['attach', 'welcome-upload'].forEach((id) =>
  $(id).addEventListener('click', () => $('files').click()),
);
$('camera').addEventListener('click', () => $('photo').click());
['files', 'photo'].forEach((id) =>
  $(id).addEventListener('change', (event) => {
    const files = [...event.target.files];
    event.target.value = '';
    uploadFiles(files);
  }),
);
$('conversation').addEventListener('dragover', (event) => {
  event.preventDefault();
  if (!state.uploading) $('conversation').classList.add('drop-target');
});
$('conversation').addEventListener('dragleave', (event) => {
  if (!$('conversation').contains(event.relatedTarget))
    $('conversation').classList.remove('drop-target');
});
$('conversation').addEventListener('drop', (event) => {
  event.preventDefault();
  $('conversation').classList.remove('drop-target');
  uploadFiles([...event.dataTransfer.files]);
});
$('close-editor').addEventListener('click', closeEditor);
$('editor').addEventListener('cancel', (event) => {
  event.preventDefault();
  closeEditor();
});
$('delete-chat').addEventListener('click', async () => {
  if (
    !state.current ||
    navBusy() ||
    !confirm('Delete this conversation? Your saved receipts will remain.')
  )
    return;
  try {
    await api(`/chat/sessions/${state.current.id}`, { method: 'DELETE' });
    newChat();
    await loadHistory();
  } catch (error) {
    notify(error.message);
  }
});
$('sign-out').addEventListener('click', () => signedOut());
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && state.user) {
    poll();
    loadHistory().catch(() => {});
  }
});
setInterval(poll, 4000);
matchMedia('(max-width:700px)').addEventListener('change', () => menu(false));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && $('app').classList.contains('sidebar-open')) {
    menu(false);
    $('menu').focus();
  }
});
menu(false);

async function start() {
  const fragment = new URLSearchParams(location.hash.slice(1));
  const receivedToken = fragment.get('access_token');
  if (fragment.has('sign_in_error')) {
    history.replaceState(null, '', location.pathname + location.search);
    signedOut(fragment.get('sign_in_error'));
    return;
  }
  if (receivedToken) {
    sessionStorage.setItem('ledger.token', receivedToken);
    history.replaceState(null, '', location.pathname + location.search);
  }
  state.token = sessionStorage.getItem('ledger.token') ?? '';
  if (!state.token) {
    signedOut();
    return;
  }
  try {
    state.user = await api('/auth/me');
    $('user-name').textContent = state.user.name ?? state.user.email;
    $('avatar').textContent = (state.user.name ?? state.user.email)
      .slice(0, 1)
      .toUpperCase();
    $('boot').hidden = true;
    $('login').hidden = true;
    $('app').hidden = false;
    renderTimeline();
    await loadHistory();
    const jobs = await api('/ingest/jobs');
    jobs.jobs.forEach((job) => state.jobs.set(job.id, job));
    const previous = sessionStorage.getItem(`ledger.session.${state.user.id}`);
    if (previous) await openSession(previous);
  } catch (error) {
    if (state.user) {
      $('activity').textContent =
        'Couldn’t load your records. Use refresh or try again.';
      notify(error.message);
    } else signedOut(error.message);
  }
}
start();
