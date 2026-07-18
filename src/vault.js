import { requireSession } from './auth.js';
import { supabase } from './supabaseClient.js';

export const state = {
  session: null,
  user: null,
  workspace: null,
  usage: null,      // senaste get_plan_usage-rad, null = okänd (fallback till konstanter)
  items: [],       // aktiva "Mina insättningar"
  archived: []      // arkiverade
};

const statusTargets = new Map();

export function setStatus(selector, message, isError = false) {
  const el = document.querySelector(selector);
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('is-error', isError);
  el.classList.toggle('is-success', !isError && Boolean(message));
}

export function setErrorStatus(selector, error, fallbackMessage) {
  setStatus(selector, error?.message || fallbackMessage, true);
}

export async function sha256Hex(value) {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function slugify(value) {
  const base = (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/å/g, 'a')
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
  return base || `insattning-${randomToken().slice(0, 8)}`;
}

export function vaultItemLimit() {
  return state.usage?.valvet_items_max ?? (state.workspace?.plan === 'free' ? 50 : 1000);
}

const VIEW_NAMES = ['mina', 'sok', 'arkiv', 'katalog', 'mcp'];

export function switchView(name) {
  VIEW_NAMES.forEach((view) => {
    const panel = document.querySelector(`[data-view-panel="${view}"]`);
    if (panel) panel.hidden = view !== name;
    const tab = document.querySelector(`[data-view-tab="${view}"]`);
    if (tab) tab.classList.toggle('active', view === name);
  });
}

document.querySelectorAll('[data-view-tab]').forEach((tab) => {
  tab.addEventListener('click', () => switchView(tab.dataset.viewTab));
});

const signOutButton = document.querySelector('[data-sign-out]');
if (signOutButton) {
  signOutButton.addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.replace('login.html');
  });
}

export async function bootstrap() {
  const session = await requireSession();
  if (!session) return false; // requireSession redirectar redan till login.html

  state.session = session;
  state.user = session.user;

  const { data: workspaceId, error: wsError } = await supabase.rpc('ensure_personal_workspace');
  if (wsError) {
    setStatus('[data-item-list-empty]', wsError.message || 'Kunde inte ladda workspace.', true);
    return false;
  }

  const { data: workspace, error: loadError } = await supabase
    .from('workspaces')
    .select('id, plan, mcp_enabled')
    .eq('id', workspaceId)
    .single();

  if (loadError) {
    setStatus('[data-item-list-empty]', loadError.message || 'Kunde inte ladda workspace.', true);
    return false;
  }

  state.workspace = workspace;
  await refreshUsage();
  return true;
}

export async function refreshUsage() {
  if (!state.workspace) return;
  const { data, error } = await supabase.rpc('get_plan_usage', { p_workspace_id: state.workspace.id });
  if (error) {
    // Gränserna upprätthålls server-side (triggrar/RPC:er) -- vid fel behåller
    // vi senaste kända värden och faller annars tillbaka till konstanterna.
    renderUsage();
    return;
  }
  state.usage = Array.isArray(data) ? (data[0] ?? null) : (data ?? null);
  renderUsage();
}

function renderUsage() {
  const el = document.querySelector('[data-mcp-usage]');
  if (!el) return;
  if (!state.usage) {
    el.textContent = '';
    return;
  }
  const u = state.usage;
  const parts = [`${u.used_mcp_keys} av ${u.max_mcp_keys} aktiva MCP-nycklar.`];
  if ('monthly_saves_max' in u) {
    parts.push(u.monthly_saves_max === null
      ? 'Obegränsade sparningar via MCP (Pro).'
      : `${u.monthly_saves_used} av ${u.monthly_saves_max} sparningar via MCP denna månad.`);
  }
  if ('catalog_copies_max' in u) {
    parts.push(u.catalog_copies_max === null
      ? 'Obegränsade katalogkopior (Pro).'
      : `${u.catalog_copies_used} av ${u.catalog_copies_max} katalogkopior denna månad.`);
  }
  el.textContent = parts.join(' ');
}

function renderItemRow(item, { showRestoreOnly = false } = {}) {
  const row = document.createElement('div');
  row.className = 'item-row';
  row.innerHTML = `
    <div class="item-meta">
      <div class="item-title">${escapeHtml(item.title)} <span style="font-weight:400; color:var(--muted);">(${item.type === 'assistant' ? 'Assistent' : 'Prompt'})</span></div>
      <div class="item-sub">${item.category ? escapeHtml(item.category) + ' — ' : ''}Ändrad ${new Date(item.updated_at).toLocaleString('sv-SE')}</div>
    </div>
    <div class="item-actions"></div>
  `;

  const actions = row.querySelector('.item-actions');

  if (showRestoreOnly) {
    const restoreBtn = document.createElement('button');
    restoreBtn.type = 'button';
    restoreBtn.className = 'secondary';
    restoreBtn.textContent = 'Återställ';
    restoreBtn.addEventListener('click', () => restoreItem(item));
    actions.appendChild(restoreBtn);
    return row;
  }

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'secondary';
  editBtn.textContent = 'Redigera';
  editBtn.addEventListener('click', () => openItemForm(item));
  actions.appendChild(editBtn);

  const archiveBtn = document.createElement('button');
  archiveBtn.type = 'button';
  archiveBtn.className = 'danger';
  archiveBtn.textContent = 'Arkivera';
  archiveBtn.addEventListener('click', () => confirmThenArchive(archiveBtn, item));
  actions.appendChild(archiveBtn);

  return row;
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

export async function loadItems() {
  const { data, error } = await supabase
    .from('content_items')
    .select('id, type, title, content, category, status, updated_at')
    .eq('workspace_id', state.workspace.id)
    .eq('module', 'valvet')
    .eq('owner_user_id', state.user.id)
    .neq('status', 'archived')
    .order('updated_at', { ascending: false });

  if (error) {
    setErrorStatus('[data-item-list-empty]', error, 'Kunde inte ladda insättningar.');
    return;
  }

  state.items = data || [];
  renderItems();
}

function renderItems() {
  const list = document.querySelector('[data-item-list]');
  const empty = document.querySelector('[data-item-list-empty]');
  list.innerHTML = '';

  if (!state.items.length) {
    empty.hidden = false;
    empty.classList.remove('is-error');
    empty.textContent = 'Du har inga insättningar än. Klicka "+ Ny insättning" för att skapa din första.';
  } else {
    empty.hidden = true;
    state.items.forEach((item) => list.appendChild(renderItemRow(item)));
  }

  const counter = document.querySelector('[data-item-counter]');
  const limit = vaultItemLimit();
  const used = state.usage?.valvet_items_used ?? state.items.length;
  counter.textContent = `${used} av ${limit} insättningar`;
  counter.classList.toggle('is-limit', used >= limit);
}

let editingItemId = null;

export function openItemForm(item = null) {
  // renderItemRow (och dess Redigera-knapp) återanvänds av bade "Mina
  // insättningar" och Sök-fliken -- utan detta öppnas formuläret i den
  // dolda mina-panelen när man redigerar fran ett sökresultat.
  switchView('mina');
  editingItemId = item?.id ?? null;
  document.querySelector('[data-item-form-card]').hidden = false;
  document.querySelector('[data-item-form-title]').textContent = item ? 'Redigera insättning' : 'Ny insättning';
  document.querySelector('[data-item-id]').value = item?.id ?? '';
  document.querySelector('[data-item-type]').value = item?.type ?? 'prompt';
  document.querySelector('[data-item-title]').value = item?.title ?? '';
  document.querySelector('[data-item-category]').value = item?.category ?? '';
  document.querySelector('[data-item-content]').value = item?.content ?? '';
  setStatus('[data-item-form-status]', '');
}

export function closeItemForm() {
  editingItemId = null;
  document.querySelector('[data-item-form-card]').hidden = true;
  document.querySelector('[data-item-form]').reset();
}

async function saveItem(event) {
  event.preventDefault();

  const type = document.querySelector('[data-item-type]').value;
  const title = document.querySelector('[data-item-title]').value.trim();
  const category = document.querySelector('[data-item-category]').value.trim() || null;
  const content = document.querySelector('[data-item-content]').value.trim();

  if (!title || !content) {
    setStatus('[data-item-form-status]', 'Titel och innehåll krävs.', true);
    return;
  }

  if (editingItemId) {
    const { error } = await supabase
      .from('content_items')
      .update({ title, category, content })
      .eq('id', editingItemId);

    if (error) {
      setErrorStatus('[data-item-form-status]', error, 'Kunde inte uppdatera insättningen.');
      return;
    }
  } else {
    if (state.items.length >= vaultItemLimit()) {
      setStatus('[data-item-form-status]', `Du har nått gränsen på ${vaultItemLimit()} insättningar.`, true);
      return;
    }

    const baseSlug = slugify(title);
    const slug = `${baseSlug}-${randomToken().slice(0, 6)}`;

    const { error } = await supabase.from('content_items').insert({
      workspace_id: state.workspace.id,
      owner_user_id: state.user.id,
      created_by: state.user.id,
      type,
      module: 'valvet',
      title,
      slug,
      category,
      content,
      status: 'draft',
      visibility: 'private'
    });

    if (error) {
      setErrorStatus('[data-item-form-status]', error, 'Kunde inte spara insättningen.');
      return;
    }
  }

  closeItemForm();
  await Promise.all([loadItems(), refreshUsage()]);
}

document.querySelector('[data-new-item-button]')?.addEventListener('click', () => openItemForm());
document.querySelector('[data-item-form-cancel]')?.addEventListener('click', () => closeItemForm());
document.querySelector('[data-item-form]')?.addEventListener('submit', saveItem);

let searchDebounceTimer = null;

async function runSearch(query) {
  const results = document.querySelector('[data-search-results]');
  const empty = document.querySelector('[data-search-empty]');

  if (!query.trim()) {
    results.innerHTML = '';
    empty.hidden = true;
    return;
  }

  const like = `%${query.trim()}%`;
  const { data, error } = await supabase
    .from('content_items')
    .select('id, type, title, content, category, status, updated_at')
    .eq('workspace_id', state.workspace.id)
    .eq('module', 'valvet')
    .eq('owner_user_id', state.user.id)
    .neq('status', 'archived')
    .or(`title.ilike.${like},content.ilike.${like},category.ilike.${like}`)
    .order('updated_at', { ascending: false });

  if (error) {
    results.innerHTML = '';
    setErrorStatus('[data-search-empty]', error, 'Sökningen misslyckades.');
    empty.hidden = false;
    return;
  }

  results.innerHTML = '';
  if (!data.length) {
    empty.hidden = false;
    empty.classList.remove('is-error');
    empty.textContent = 'Inga träffar.';
  } else {
    empty.hidden = true;
    data.forEach((item) => results.appendChild(renderItemRow(item)));
  }
}

document.querySelector('[data-search-input]')?.addEventListener('input', (event) => {
  clearTimeout(searchDebounceTimer);
  const query = event.target.value;
  searchDebounceTimer = setTimeout(() => runSearch(query), 250);
});

const CATALOG_TYPE_LABELS = {
  prompt: 'Prompt',
  routine: 'Rutin',
  checklist: 'Checklista',
  guide: 'Guide',
  faq: 'FAQ',
  document: 'Dokument',
  template: 'Mall',
  assistant: 'Assistent'
};

function renderCatalogRow(item) {
  const row = document.createElement('div');
  row.className = 'item-row';
  row.innerHTML = `
    <div class="item-meta">
      <div class="item-title">${escapeHtml(item.title)} <span style="font-weight:400; color:var(--muted);">(${escapeHtml(CATALOG_TYPE_LABELS[item.type] || item.type)})</span></div>
      <div class="item-sub">${item.category ? escapeHtml(item.category) + ' — ' : ''}Publicerad ${new Date(item.published_at).toLocaleDateString('sv-SE')}</div>
    </div>
    <div class="item-actions"></div>
  `;

  const actions = row.querySelector('.item-actions');
  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'secondary';
  copyBtn.textContent = 'Kopiera till mitt Valv';
  copyBtn.addEventListener('click', () => copyToValvet(copyBtn, item));
  actions.appendChild(copyBtn);

  return row;
}

async function copyToValvet(button, item) {
  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = 'Kopierar...';

  const { error } = await supabase.rpc('copy_catalog_item_to_valvet', { p_source_item_id: item.id });

  button.disabled = false;
  button.textContent = originalText;

  if (error) {
    setErrorStatus('[data-catalog-status]', error, 'Kunde inte kopiera posten.');
    return;
  }

  setStatus('[data-catalog-status]', `"${item.title}" kopierad till ditt valv.`);
  await Promise.all([loadItems(), updateCatalogQuota(), refreshUsage()]);
}

async function updateCatalogQuota() {
  const quotaEl = document.querySelector('[data-catalog-quota]');
  if (!quotaEl) return;

  const { data, error } = await supabase.rpc('valvet_catalog_copy_quota');

  if (error || !data || !data.length) {
    quotaEl.textContent = '';
    return;
  }

  const { used, monthly_limit } = data[0];
  quotaEl.textContent = monthly_limit === null
    ? 'Obegränsad kopiering (Pro).'
    : `${used} av ${monthly_limit} kopior denna månad.`;
}

async function loadCatalog(query = '') {
  const view = state.workspace?.plan === 'pro' ? 'published_workspace_content' : 'published_public_content';
  let request = supabase.from(view).select('id, type, title, content, category, published_at');

  const trimmed = query.trim();
  if (trimmed) {
    const like = `%${trimmed}%`;
    request = request.or(`title.ilike.${like},content.ilike.${like},category.ilike.${like}`);
  }

  const { data, error } = await request.order('published_at', { ascending: false });

  const list = document.querySelector('[data-catalog-list]');
  const empty = document.querySelector('[data-catalog-empty]');
  list.innerHTML = '';

  if (error) {
    setErrorStatus('[data-catalog-empty]', error, 'Kunde inte ladda katalogen.');
    empty.hidden = false;
    return;
  }

  if (!data.length) {
    empty.hidden = false;
    empty.classList.remove('is-error');
    empty.textContent = 'Inga träffar.';
  } else {
    empty.hidden = true;
    data.forEach((item) => list.appendChild(renderCatalogRow(item)));
  }

  await updateCatalogQuota();
}

let catalogSearchDebounceTimer = null;

document.querySelector('[data-catalog-search-input]')?.addEventListener('input', (event) => {
  clearTimeout(catalogSearchDebounceTimer);
  const query = event.target.value;
  catalogSearchDebounceTimer = setTimeout(() => loadCatalog(query), 250);
});

document.querySelector('[data-view-tab="katalog"]')?.addEventListener('click', () => {
  loadCatalog(document.querySelector('[data-catalog-search-input]')?.value || '');
});

bootstrap().then((ok) => {
  if (!ok) return;
  loadItems();
});

const pendingArchiveConfirms = new WeakMap();

function confirmThenArchive(button, item) {
  if (pendingArchiveConfirms.has(button)) {
    clearTimeout(pendingArchiveConfirms.get(button));
    pendingArchiveConfirms.delete(button);
    archiveItem(item);
    return;
  }

  const originalText = button.textContent;
  button.textContent = 'Bekräfta arkivering?';
  const timer = setTimeout(() => {
    button.textContent = originalText;
    pendingArchiveConfirms.delete(button);
  }, 4000);
  pendingArchiveConfirms.set(button, timer);
}

async function archiveItem(item) {
  // Arkivera-knappen renderas aven i Sök-resultat (renderItemRow delas mellan
  // vyerna) -- utan detta blir statusmeddelandet och den uppdaterade listan
  // osynliga i den dolda mina-panelen, och den arkiverade raden ligger kvar
  // synlig i sökresultatet tills nästa sökning.
  switchView('mina');

  const { error } = await supabase
    .from('content_items')
    .update({ status: 'archived' })
    .eq('id', item.id);

  if (error) {
    setErrorStatus('[data-item-list-empty]', error, 'Kunde inte arkivera insättningen.');
    return;
  }

  await Promise.all([loadItems(), refreshUsage()]);
}

export async function loadArchive() {
  const { data, error } = await supabase
    .from('content_items')
    .select('id, type, title, content, category, status, updated_at')
    .eq('workspace_id', state.workspace.id)
    .eq('module', 'valvet')
    .eq('owner_user_id', state.user.id)
    .eq('status', 'archived')
    .order('updated_at', { ascending: false });

  const list = document.querySelector('[data-archive-list]');
  const empty = document.querySelector('[data-archive-empty]');
  list.innerHTML = '';

  if (error) {
    setErrorStatus('[data-archive-empty]', error, 'Kunde inte ladda arkivet.');
    empty.hidden = false;
    return;
  }

  state.archived = data || [];

  if (!state.archived.length) {
    empty.hidden = false;
    empty.classList.remove('is-error');
    empty.textContent = 'Arkivet är tomt.';
  } else {
    empty.hidden = true;
    state.archived.forEach((item) => list.appendChild(renderItemRow(item, { showRestoreOnly: true })));
  }
}

async function restoreItem(item) {
  if (state.items.length >= vaultItemLimit()) {
    setErrorStatus('[data-archive-empty]', { message: `Du har nått gränsen på ${vaultItemLimit()} insättningar — arkivera något annat först.` }, '');
    document.querySelector('[data-archive-empty]').hidden = false;
    return;
  }

  const { error } = await supabase
    .from('content_items')
    .update({ status: 'draft' })
    .eq('id', item.id);

  if (error) {
    setErrorStatus('[data-archive-empty]', error, 'Kunde inte återställa insättningen.');
    return;
  }

  await Promise.all([loadItems(), loadArchive(), refreshUsage()]);
}

document.querySelector('[data-view-tab="arkiv"]')?.addEventListener('click', () => loadArchive());

function mcpKeyLimit() {
  return state.usage?.max_mcp_keys ?? (state.workspace?.plan === 'pro' ? 3 : 1);
}

async function loadMcpKeys() {
  const { data, error } = await supabase
    .from('api_keys')
    .select('id, name, key_prefix, revoked_at, created_at')
    .eq('workspace_id', state.workspace.id)
    .contains('scopes', ['mcp'])
    .order('created_at', { ascending: false });

  const container = document.querySelector('[data-mcp-key-list]');
  container.innerHTML = '';

  if (error) {
    setErrorStatus('[data-mcp-key-status]', error, 'Kunde inte ladda MCP-nycklar.');
    return;
  }

  (data || []).forEach((key) => {
    const row = document.createElement('div');
    row.className = 'item-row';
    const status = key.revoked_at ? 'Återkallad' : 'Aktiv';
    row.innerHTML = `
      <div class="item-meta">
        <div class="item-title">${escapeHtml(key.name)}</div>
        <div class="item-sub">${escapeHtml(key.key_prefix)}... — ${status}</div>
      </div>
      <div class="item-actions"></div>
    `;
    if (!key.revoked_at) {
      const revokeBtn = document.createElement('button');
      revokeBtn.type = 'button';
      revokeBtn.className = 'danger';
      revokeBtn.textContent = 'Återkalla';
      revokeBtn.addEventListener('click', async () => {
        const { error: revokeError } = await supabase
          .from('api_keys')
          .update({ revoked_at: new Date().toISOString() })
          .eq('id', key.id);
        if (revokeError) {
          setErrorStatus('[data-mcp-key-status]', revokeError, 'Kunde inte återkalla nyckeln.');
          return;
        }
        await Promise.all([loadMcpKeys(), refreshUsage()]);
      });
      row.querySelector('.item-actions').appendChild(revokeBtn);
    }
    container.appendChild(row);
  });
}

async function createMcpKey(event) {
  event.preventDefault();

  const nameInput = document.querySelector('#mcp-key-name');
  const name = nameInput.value.trim();
  if (!name) {
    setStatus('[data-mcp-key-status]', 'Namn krävs.', true);
    return;
  }

  const { count } = await supabase
    .from('api_keys')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', state.workspace.id)
    .contains('scopes', ['mcp'])
    .is('revoked_at', null);

  if ((count ?? 0) >= mcpKeyLimit()) {
    setStatus('[data-mcp-key-status]', `Du har nått gränsen på ${mcpKeyLimit()} aktiva MCP-nyckel(ar) för din plan.`, true);
    return;
  }

  const rawKey = `pb_mcp_${randomToken()}`;
  const keyPrefix = rawKey.slice(0, 16);
  const keyHash = await sha256Hex(rawKey);

  const { error } = await supabase.from('api_keys').insert({
    workspace_id: state.workspace.id,
    created_by: state.user.id,
    name,
    key_prefix: keyPrefix,
    key_hash: keyHash,
    scopes: ['mcp']
  });

  if (error) {
    setErrorStatus('[data-mcp-key-status]', error, 'Kunde inte skapa MCP-nyckel.');
    return;
  }

  document.querySelector('[data-mcp-key-form]').reset();
  document.querySelector('[data-new-mcp-key-panel]').hidden = false;
  document.querySelector('[data-new-mcp-key]').textContent = rawKey;
  setStatus('[data-mcp-key-status]', 'Nyckeln skapades. Kopiera den nu, den visas bara en gång.');
  await Promise.all([loadMcpKeys(), refreshUsage()]);
}

document.querySelector('[data-mcp-key-form]')?.addEventListener('submit', createMcpKey);
document.querySelector('[data-view-tab="mcp"]')?.addEventListener('click', () => loadMcpKeys());

function exportItems() {
  const all = [...state.items, ...state.archived];
  if (!all.length) {
    setStatus('[data-mcp-key-status]', 'Du har inga insättningar att exportera än.', true);
    return;
  }

  const payload = all.map((item) => ({
    id: item.id,
    type: item.type,
    title: item.title,
    content: item.content,
    category: item.category,
    status: item.status,
    updated_at: item.updated_at
  }));

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `valvet-export-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

document.querySelector('[data-export-button]')?.addEventListener('click', async () => {
  await loadArchive(); // säkerställ att arkivet är laskat innan export inkluderar det
  exportItems();
});
