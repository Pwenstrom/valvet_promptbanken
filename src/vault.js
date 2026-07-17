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
