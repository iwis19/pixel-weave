import { normalizeName } from './model.js';
import { uiIcon } from './ui-icons.js';

export function openProjectGallery({ store, currentId, onOpen, onRename, onRemove, onImport, trigger }) {
  const el = (tag, className = '', text = '') => { const node = document.createElement(tag); node.className = className; node.textContent = text; return node; };
  const button = (text, label, action) => { const b = el('button', '', text); b.type = 'button'; if (label) b.setAttribute('aria-label', label); b.addEventListener('click', action); return b; };
  const dialog = el('dialog', 'project-gallery'); dialog.setAttribute('aria-labelledby', 'project-gallery-title');
  const header = el('div', 'picker-header');
  const heading = el('h2', '', 'Saved projects'); heading.id = 'project-gallery-title';
  header.append(heading, button('×', 'Close saved projects', () => dialog.close()));
  const search = el('input', 'project-search'); search.type = 'search'; search.placeholder = 'Search projects'; search.setAttribute('aria-label', 'Search saved projects');
  const grid = el('div', 'project-grid'); grid.setAttribute('aria-label', 'Saved projects');
  const status = el('div', 'gallery-status', 'Loading…'); status.setAttribute('role', 'status');
  const footer = el('div', 'gallery-footer');
  footer.append(el('span', '', 'On this device'), button('Import project file', null, () => { dialog.close(); onImport(); }));
  let records = [], urls = [], revision = 0;
  const releasePreviews = () => { for (const url of urls) URL.revokeObjectURL(url); urls = []; };
  const report = error => { status.replaceChildren(); status.textContent = error.message || 'Could not open saved projects.'; };
  const render = () => {
    if (!dialog.open) return;
    releasePreviews(); grid.replaceChildren(); status.replaceChildren();
    const matches = records.filter(record => record.name.toLowerCase().includes(search.value.trim().toLowerCase()));
    status.textContent = matches.length ? '' : records.length ? 'No matching projects' : 'No saved projects yet';
    for (const record of matches) {
      const card = el('article', 'project-card');
      const open = button('', `Open ${record.name}`, async () => {
        open.disabled = true; status.textContent = 'Opening…';
        try { if (await onOpen(record.id) !== false) dialog.close(); else status.textContent = ''; } catch (error) { report(error); }
        finally { open.disabled = false; }
      }); open.className = 'open-saved-project';
      if (record.thumbnail) {
        const image = el('img'); image.alt = ''; image.loading = 'lazy'; image.decoding = 'async'; image.src = URL.createObjectURL(record.thumbnail); urls.push(image.src); open.append(image);
      } else open.append(el('span', 'project-preview-placeholder', '▦'));
      open.append(el('span', 'saved-project-name', record.name));
      const details = el('div', 'project-card-details');
      const stamp = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(record.updatedAt);
      details.append(el('span', 'project-date', record.id === currentId ? 'Current' : stamp));
      const rename = button('', `Rename ${record.name}`, () => {
        const input = el('input', 'rename-input'); input.type = 'text'; input.value = record.name; input.maxLength = 80; input.setAttribute('aria-label', 'Saved project name');
        const name = open.querySelector('.saved-project-name');
        // Keep the editor outside the Open button so clicking it cannot load the project.
        open.disabled = rename.disabled = true; name.hidden = true; card.insertBefore(input, details);
        let done = false;
        const finish = async save => {
          if (done) return; done = true; input.disabled = true;
          try {
            if (save) {
              const value = normalizeName(input.value);
              await store.rename(record.id, value); onRename(record.id, value);
              records = await store.list();
            }
            render();
          } catch (error) { report(error); input.disabled = false; done = false; }
        };
        input.addEventListener('blur', () => finish(true));
        input.addEventListener('keydown', event => { if (['Enter', 'Escape'].includes(event.key) && !event.isComposing) { event.preventDefault(); finish(event.key === 'Enter'); } });
        input.focus(); input.select();
      }); rename.append(uiIcon('edit'));
      const remove = button('', `Delete ${record.name}`, () => {
        status.replaceChildren(el('span', '', `Delete “${record.name}”?`));
        const cancel = button('Cancel', 'Cancel deletion', render);
        const confirm = button('Delete', 'Confirm delete project', async () => {
          confirm.disabled = true;
          try { await store.remove(record.id); onRemove(record.id); records = await store.list(); render(); } catch (error) { report(error); }
        }); confirm.className = 'confirm-delete-project'; status.append(cancel, confirm); cancel.focus();
      }); remove.append(uiIcon('trash')); details.append(rename, remove);
      card.append(open, details); grid.append(card);
    }
  };
  search.addEventListener('input', render);
  dialog.append(header, search, grid, status, footer);
  dialog.addEventListener('close', () => { revision++; releasePreviews(); dialog.remove(); if (trigger?.isConnected) trigger.focus(); }, { once: true });
  document.body.append(dialog); dialog.showModal(); search.focus();
  const loadRevision = revision;
  store.list().then(value => { if (revision === loadRevision) { records = value; render(); } }).catch(report);
}
