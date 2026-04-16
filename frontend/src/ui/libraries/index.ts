import './index.scss';
import { settings, saveSettings } from '../../core/settings';

type Library = { name: string; size_kb: number; count: number; isDefault: boolean };

async function fetchLibraries(): Promise<Library[]> {
  const res = await fetch('/api/libraries');
  if (!res.ok) return [];
  return res.json() as Promise<Library[]>;
}

function validateSong(song: unknown, index: number): string | null {
  if (!song || typeof song !== 'object') return `Song at index ${index} is not an object.`;
  const s = song as Record<string, unknown>;
  if (typeof s.id !== 'string') return `Song at index ${index} is missing or has an invalid "id" (expected a string).`;
  for (const coord of ['x', 'y', 'z']) {
    if (typeof s[coord] !== 'number') return `Song at index ${index} has an invalid "${coord}" — expected a number.`;
  }
  return null;
}

// Validate uploaded JSON and return an error string, or null if valid.
function validateLibraryJson(parsed: unknown): string | null {
  let songs: unknown[];
  if (Array.isArray(parsed)) {
    songs = parsed;
  } else if (parsed && typeof parsed === 'object' && 'songs' in parsed && Array.isArray((parsed as { songs: unknown[] }).songs)) {
    songs = (parsed as { songs: unknown[] }).songs;
  } else {
    return 'File must be a JSON array of songs, or an object with a "songs" array.';
  }
  if (songs.length === 0) return 'The file contains no songs.';
  for (let i = 0; i < Math.min(5, songs.length); i++) {
    const err = validateSong(songs[i], i);
    if (err) return err;
  }
  return null;
}

// Mirror Python sanitize_library_name() so we can detect conflicts before uploading
function sanitizeName(raw: string): string {
  let name = raw.replace(/^.*[/\\]/, '');        // basename
  name = name.replace(/[^\w\-.]/g, '_');          // only word chars, hyphens, dots
  if (!name.toLowerCase().endsWith('.json')) name += '.json';
  if (name.startsWith('.')) name = '_' + name.slice(1);
  return name.slice(0, 69);
}

function showConflictDialog(opts: {
  displayName: string;
  existingCount: number;
  newCount: number;
  onReplace: () => void;
  onKeepBoth: () => void;
  onCancel: () => void;
}): void {
  const overlay = document.createElement('div');
  overlay.className = 'lib-conflict-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'lib-conflict-dialog';

  const title = document.createElement('div');
  title.className = 'lib-conflict-title';
  title.textContent = 'Library already exists';

  const nameEl = document.createElement('div');
  nameEl.className = 'lib-conflict-name';
  nameEl.textContent = `"${opts.displayName}"`;

  const counts = document.createElement('div');
  counts.className = 'lib-conflict-counts';

  const row = (label: string, n: number) => {
    const el = document.createElement('div');
    el.className = 'lib-conflict-row';
    const lbl = document.createElement('span');
    lbl.textContent = label;
    const val = document.createElement('span');
    val.textContent = `${n.toLocaleString()} songs`;
    el.appendChild(lbl);
    el.appendChild(val);
    return el;
  };
  counts.appendChild(row('Existing', opts.existingCount));
  counts.appendChild(row('Uploading', opts.newCount));

  const actions = document.createElement('div');
  actions.className = 'lib-conflict-actions';

  const btnReplace  = document.createElement('button');
  const btnKeepBoth = document.createElement('button');
  const btnCancel   = document.createElement('button');

  btnReplace.className  = 'lib-conflict-btn lib-conflict-replace';
  btnKeepBoth.className = 'lib-conflict-btn lib-conflict-keep';
  btnCancel.className   = 'lib-conflict-btn lib-conflict-cancel';

  btnReplace.textContent  = 'Replace';
  btnKeepBoth.textContent = 'Keep both';
  btnCancel.textContent   = 'Cancel';

  actions.appendChild(btnReplace);
  actions.appendChild(btnKeepBoth);
  actions.appendChild(btnCancel);

  dialog.appendChild(title);
  dialog.appendChild(nameEl);
  dialog.appendChild(counts);
  dialog.appendChild(actions);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  const dismiss = () => overlay.remove();

  btnReplace.addEventListener('click',  () => { dismiss(); opts.onReplace(); });
  btnKeepBoth.addEventListener('click', () => { dismiss(); opts.onKeepBoth(); });
  btnCancel.addEventListener('click',   () => { dismiss(); opts.onCancel(); });
  overlay.addEventListener('click', e => { if (e.target === overlay) { dismiss(); opts.onCancel(); } });
}

function isActive(lib: Library): boolean {
  if (settings.activeLibrary) return lib.name === settings.activeLibrary;
  return lib.isDefault;
}

function renderList(
  libs: Library[],
  reinitGalaxy: () => Promise<void>,
  refresh: () => Promise<void>,
): void {
  const list = document.getElementById('lib-list')!;
  list.innerHTML = '';

  const onlyOne = libs.length === 1;

  libs.forEach(lib => {
    const active = isActive(lib);
    const li = document.createElement('li');
    li.className = 'lib-item' + (active ? ' lib-active' : '');

    // Name — click to rename inline (shown without .json)
    const nameSpan = document.createElement('span');
    nameSpan.className = 'lib-name';
    nameSpan.textContent = lib.name.replace(/\.json$/i, '');
    nameSpan.title = `${lib.count.toLocaleString()} songs · ${lib.size_kb} KB${active ? '' : ' · click to rename'}`;

    nameSpan.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'lib-rename-input';
      input.value = lib.name.replace(/\.json$/i, '');
      nameSpan.replaceWith(input);
      input.focus();
      input.select();

      let submitted = false;
      const submit = async () => {
        if (submitted) return;
        submitted = true;
        const newName = input.value.trim();
        if (!newName || newName === lib.name.replace(/\.json$/i, '')) { await refresh(); return; }
        const res = await fetch('/api/libraries/rename', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: lib.name, to: newName }),
        });
        const body = await res.json() as { error?: string };
        if (!res.ok) alert(body.error ?? 'Rename failed');
        await refresh();
      };

      input.addEventListener('blur', submit);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { input.blur(); }
        if (e.key === 'Escape') { submitted = true; refresh(); }
      });
    });

    li.appendChild(nameSpan);

    // Song count
    const countEl = document.createElement('span');
    countEl.className = 'lib-count';
    countEl.textContent = lib.count.toLocaleString();
    li.appendChild(countEl);

    // Active badge
    if (active) {
      const badge = document.createElement('span');
      badge.className = 'lib-badge';
      badge.textContent = 'active';
      li.appendChild(badge);
    }

    // Activate button (hidden when already active)
    if (!active) {
      const btn = document.createElement('button');
      btn.className = 'lib-btn lib-btn-activate';
      btn.textContent = 'Use';
      btn.addEventListener('click', async () => {
        settings.activeLibrary = lib.isDefault ? '' : lib.name;
        saveSettings(settings);
        await reinitGalaxy();
        refresh();
      });
      li.appendChild(btn);
    }

    // Delete button
    const delBtn = document.createElement('button');
    delBtn.className = 'lib-btn lib-btn-delete';
    delBtn.textContent = '✕';
    if (lib.isDefault) {
      delBtn.title = 'Cannot delete the default library';
      delBtn.disabled = true;
    } else if (active) {
      delBtn.title = 'Cannot delete the active library';
      delBtn.disabled = true;
    } else if (onlyOne) {
      delBtn.title = 'Cannot delete the last library';
      delBtn.disabled = true;
    } else {
      delBtn.title = `Delete ${lib.name.replace(/\.json$/i, '')}`;
      delBtn.addEventListener('click', async () => {
        if (!confirm(`Delete "${lib.name.replace(/\.json$/i, '')}"?`)) return;
        const res = await fetch(`/api/libraries/${encodeURIComponent(lib.name)}`, { method: 'DELETE' });
        const body = await res.json() as { error?: string };
        if (!res.ok) { alert(body.error ?? 'Delete failed'); return; }
        // If the deleted library was the stored active, fall back to default
        if (settings.activeLibrary === lib.name) {
          settings.activeLibrary = '';
          saveSettings(settings);
        }
        await refresh();
      });
    }
    li.appendChild(delBtn);

    list.appendChild(li);
  });
}

export function wireLibraryUI(reinitGalaxy: () => Promise<void>): void {
  let currentLibs: Library[] = [];

  const refresh = async () => {
    currentLibs = await fetchLibraries();
    renderList(currentLibs, reinitGalaxy, refresh);
  };

  refresh();

  const uploadBtn   = document.getElementById('lib-upload-btn') as HTMLButtonElement;
  const uploadInput = document.getElementById('lib-upload') as HTMLInputElement;

  uploadBtn.addEventListener('click', () => uploadInput.click());

  uploadInput.addEventListener('change', async () => {
    const file = uploadInput.files?.[0];
    if (!file) return;
    uploadInput.value = '';

    // Validate and count songs client-side before uploading
    let newCount = 0;
    try {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        alert('This file is not valid JSON. Please check the file and try again.');
        return;
      }
      const validationError = validateLibraryJson(parsed);
      if (validationError) {
        alert(`Invalid library file: ${validationError}`);
        return;
      }
      const songs = Array.isArray(parsed) ? parsed : (parsed as { songs: unknown[] }).songs;
      newCount = songs.length;
    } catch {
      alert('Could not read the file. Please try again.');
      return;
    }

    const doUpload = async (strategy: 'replace' | 'keep_both' | '') => {
      uploadBtn.disabled = true;
      uploadBtn.textContent = 'Uploading…';

      const fd = new FormData();
      fd.append('file', file);
      const url = strategy ? `/api/libraries/upload?strategy=${strategy}` : '/api/libraries/upload';
      const res = await fetch(url, { method: 'POST', body: fd });
      const body = await res.json() as { error?: string; conflict?: boolean; existing_count?: number };

      uploadBtn.disabled = false;
      uploadBtn.textContent = 'Choose file';

      if (!res.ok) { alert(body.error ?? 'Upload failed'); return; }
      // Switch to the uploaded library
      const uploadedName = (body as { name?: string }).name;
      if (uploadedName) {
        settings.activeLibrary = uploadedName;
        saveSettings(settings);
      }
      await reinitGalaxy();
      await refresh();
    };

    // Check for name conflict against the already-fetched library list
    const safeName = sanitizeName(file.name);
    const existing = currentLibs.find(l => l.name === safeName);

    if (existing) {
      showConflictDialog({
        displayName: existing.name.replace(/\.json$/i, ''),
        existingCount: existing.count,
        newCount,
        onReplace:  () => doUpload('replace'),
        onKeepBoth: () => doUpload('keep_both'),
        onCancel:   () => {},
      });
    } else {
      await doUpload('');
    }
  });
}
