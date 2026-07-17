import { requireSession } from './auth.js';
import { supabase } from './supabaseClient.js';

export const state = {
  session: null,
  user: null,
  workspace: null,
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
  return state.workspace?.plan === 'free' ? 50 : 1000;
}

const VIEW_NAMES = ['mina', 'sok', 'arkiv', 'mcp'];

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
  return true;
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
  counter.textContent = `${state.items.length} av ${limit} insättningar`;
  counter.classList.toggle('is-limit', state.items.length >= limit);
}

let editingItemId = null;

export function openItemForm(item = null) {
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
  await loadItems();
}

document.querySelector('[data-new-item-button]')?.addEventListener('click', () => openItemForm());
document.querySelector('[data-item-form-cancel]')?.addEventListener('click', () => closeItemForm());
document.querySelector('[data-item-form]')?.addEventListener('submit', saveItem);

bootstrap().then((ok) => {
  if (!ok) return;
  loadItems();
});
