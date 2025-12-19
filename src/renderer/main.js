import { Crepe, CrepeFeature } from '@milkdown/crepe';
import {
  toggleStrongCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleLinkCommand,
  wrapInHeadingCommand,
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
  wrapInBlockquoteCommand,
  createCodeBlockCommand,
  orderedListSchema,
  listItemSchema
} from '@milkdown/preset-commonmark';
import {
  toggleStrikethroughCommand
} from '@milkdown/preset-gfm';
import { callCommand, $prose } from '@milkdown/utils';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';
import './styles/core.css';
import './styles/themes/index.css';

// Custom plugin to fix ordered list numbering
// This addresses a bug where new list items don't get proper sequential numbers
const fixOrderedListPlugin = $prose((ctx) => {
  return new Plugin({
    key: new PluginKey('STOODIO_FIX_LIST_ORDER'),
    appendTransaction: (transactions, _oldState, newState) => {
      // Skip if no meaningful changes
      if (!transactions.some(tr => tr.docChanged)) return null;

      const orderedListType = orderedListSchema.type(ctx);
      const listItemType = listItemSchema.type(ctx);

      let tr = newState.tr;
      let needDispatch = false;

      // Find all ordered lists and update their item labels
      newState.doc.descendants((node, pos) => {
        if (node.type === orderedListType) {
          let itemIndex = 0;
          node.forEach((child, offset) => {
            if (child.type === listItemType) {
              const expectedLabel = `${itemIndex + 1}.`;
              const itemPos = pos + offset + 1;

              if (child.attrs.label !== expectedLabel || child.attrs.listType !== 'ordered') {
                tr = tr.setNodeMarkup(itemPos, undefined, {
                  ...child.attrs,
                  label: expectedLabel,
                  listType: 'ordered'
                });
                needDispatch = true;
              }
              itemIndex++;
            }
          });
        }
        return true; // Continue traversing
      });

      return needDispatch ? tr.setMeta('addToHistory', false) : null;
    }
  });
});

// Default content for new documents
const defaultContent = `# Welcome to Stoodio MD

A minimal markdown editor with live preview.

## Features

- **Bold** and *italic* text
- Headings (H1-H6)
- Lists (bullet, numbered, task)
- Code blocks with syntax highlighting
- Links and images
- Tables
- And more...

## Numbered List Example

1. First item
2. Second item
3. Third item

## Getting Started

Start typing to edit this document, or use **File > Open** to open an existing markdown file.

### Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Save | ⌘S |
| Open | ⌘O |
| Bold | ⌘B |
| Italic | ⌘I |
| Heading 1 | ⌘1 |
| Heading 2 | ⌘2 |

---

Happy writing!
`;

let crepe = null;
let currentContent = defaultContent;
let isSourceMode = false;
let isPopoverOpen = false;
let currentSidebarTab = 'outline';

// File tree icons (SVG)
const folderIcon = `<svg class="file-tree-icon folder" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
</svg>`;

const fileIcon = `<svg class="file-tree-icon markdown" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
  <polyline points="14 2 14 8 20 8"></polyline>
</svg>`;

const chevronIcon = `<svg class="file-tree-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <polyline points="9 18 15 12 9 6"></polyline>
</svg>`;

// Command registry - maps command names to Milkdown actions
const formatCommands = {
  bold: () => callCommand(toggleStrongCommand.key),
  italic: () => callCommand(toggleEmphasisCommand.key),
  strike: () => callCommand(toggleStrikethroughCommand.key),
  code: () => callCommand(toggleInlineCodeCommand.key),
  link: () => callCommand(toggleLinkCommand.key)
};

const paragraphCommands = {
  h1: () => callCommand(wrapInHeadingCommand.key, 1),
  h2: () => callCommand(wrapInHeadingCommand.key, 2),
  h3: () => callCommand(wrapInHeadingCommand.key, 3),
  paragraph: () => null, // No direct command available
  bullet: () => callCommand(wrapInBulletListCommand.key),
  ordered: () => callCommand(wrapInOrderedListCommand.key),
  quote: () => callCommand(wrapInBlockquoteCommand.key),
  codeblock: () => callCommand(createCodeBlockCommand.key)
};

// Initialize the editor
async function initEditor(content = defaultContent) {
  console.log('Initializing editor...');
  currentContent = content;

  try {
    // Destroy existing editor if any
    if (crepe) {
      await crepe.destroy();
      crepe = null;
    }

    // Hide source area and show editor
    const editorEl = document.getElementById('editor');
    const sourceEl = document.getElementById('source-area');
    if (editorEl) editorEl.style.display = 'block';
    if (sourceEl) sourceEl.style.display = 'none';

    crepe = new Crepe({
      root: '#editor',
      defaultValue: content,
    });

    // Add custom plugin to fix ordered list numbering
    crepe.editor.use(fixOrderedListPlugin);

    // Listen for updates
    crepe.on((listener) => {
      listener.updated((ctx, doc, prevDoc) => {
        if (window.electronAPI) {
          window.electronAPI.documentModified();
        }
        updateOutline();
      });
    });

    await crepe.create();

    // Initial outline
    setTimeout(updateOutline, 100);

    console.log('Editor initialized successfully');
  } catch (error) {
    console.error('Failed to initialize editor:', error);
  }
}

// Update the document outline
function updateOutline() {
  const outlineEl = document.getElementById('outline');
  if (!outlineEl || !crepe) return;

  // Get markdown content and extract headings
  const markdown = crepe.getMarkdown();
  const headings = [];
  const lines = markdown.split('\n');

  lines.forEach((line, index) => {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      headings.push({
        level: match[1].length,
        text: match[2],
        line: index
      });
    }
  });

  // Build outline HTML
  if (headings.length === 0) {
    outlineEl.innerHTML = '<p class="outline-empty">No headings found</p>';
    return;
  }

  const html = headings.map(h => `
    <a href="#" class="outline-item outline-h${h.level}" data-line="${h.line}">
      ${escapeHtml(h.text)}
    </a>
  `).join('');

  outlineEl.innerHTML = html;
}

// Escape HTML entities
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Get current markdown content
function getMarkdown() {
  if (isSourceMode) {
    const sourceEl = document.getElementById('source-area');
    return sourceEl ? sourceEl.value : '';
  }

  if (crepe) {
    return crepe.getMarkdown();
  }
  return '';
}

// Update the filename in the title bar
function updateFilename(path) {
  const filenameEl = document.getElementById('filename');
  if (filenameEl) {
    if (path) {
      // Extract just the filename from the path
      const filename = path.split('/').pop();
      filenameEl.textContent = filename;
    } else {
      filenameEl.textContent = 'Untitled';
    }
  }
}

// Theme management
let currentTheme = 'github';

function setTheme(themeName) {
  currentTheme = themeName;
  document.documentElement.setAttribute('data-theme', themeName);

  // Save to localStorage for persistence
  localStorage.setItem('stoodio-theme', themeName);

  console.log('Theme changed to:', themeName);
}

function loadSavedTheme() {
  const savedTheme = localStorage.getItem('stoodio-theme');
  if (savedTheme) {
    setTheme(savedTheme);
    return savedTheme;
  }
  return 'github';
}

// Sidebar tab switching
function switchSidebarTab(tabName) {
  currentSidebarTab = tabName;

  // Update tab buttons
  document.querySelectorAll('.sidebar-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });

  // Update panels
  document.querySelectorAll('.sidebar-panel').forEach(panel => {
    panel.classList.remove('active');
  });

  if (tabName === 'outline') {
    document.getElementById('outline')?.classList.add('active');
  } else if (tabName === 'files') {
    document.getElementById('file-tree')?.classList.add('active');
    refreshFileTree();
  }
}

// Refresh file tree
async function refreshFileTree() {
  const fileTreeEl = document.getElementById('file-tree');
  if (!fileTreeEl || !window.electronAPI) return;

  try {
    const result = await window.electronAPI.getDirectoryContents();

    if (!result.success || result.items.length === 0) {
      fileTreeEl.innerHTML = '<p class="file-tree-empty">No markdown files in current folder</p>';
      return;
    }

    fileTreeEl.innerHTML = renderFileTreeItems(result.items);
    attachFileTreeListeners();
  } catch (err) {
    console.error('Failed to load file tree:', err);
    fileTreeEl.innerHTML = '<p class="file-tree-empty">Failed to load files</p>';
  }
}

// Render file tree items recursively
function renderFileTreeItems(items) {
  return items.map(item => {
    if (item.type === 'folder') {
      return `
        <div class="file-tree-folder" data-path="${escapeHtml(item.path)}">
          <div class="file-tree-item">
            ${chevronIcon}
            ${folderIcon}
            <span class="file-tree-name">${escapeHtml(item.name)}</span>
          </div>
          <div class="file-tree-folder-contents">
            ${item.children ? renderFileTreeItems(item.children) : ''}
          </div>
        </div>
      `;
    } else {
      return `
        <div class="file-tree-item${item.isActive ? ' active' : ''}" data-path="${escapeHtml(item.path)}">
          ${fileIcon}
          <span class="file-tree-name">${escapeHtml(item.name)}</span>
        </div>
      `;
    }
  }).join('');
}

// Attach click listeners to file tree items
function attachFileTreeListeners() {
  const fileTreeEl = document.getElementById('file-tree');
  if (!fileTreeEl) return;

  // File clicks
  fileTreeEl.querySelectorAll('.file-tree-item[data-path]').forEach(item => {
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      const filePath = item.dataset.path;
      if (filePath && window.electronAPI) {
        await window.electronAPI.openFileFromTree(filePath);
        // Refresh to update active state
        setTimeout(refreshFileTree, 100);
      }
    });
  });

  // Folder clicks (toggle expand)
  fileTreeEl.querySelectorAll('.file-tree-folder > .file-tree-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const folder = item.closest('.file-tree-folder');
      folder?.classList.toggle('expanded');
    });
  });
}

// Toggle Source Mode
function toggleSourceMode(enable) {
  isSourceMode = enable;
  const editorEl = document.getElementById('editor');
  let sourceEl = document.getElementById('source-area');
  const toggleBtn = document.getElementById('toggle-source-btn');

  // Update button state
  if (toggleBtn) {
    if (enable) {
      toggleBtn.classList.add('active');
    } else {
      toggleBtn.classList.remove('active');
    }
  }

  // Create source textarea if it doesn't exist
  if (!sourceEl) {
    sourceEl = document.createElement('textarea');
    sourceEl.id = 'source-area';
    sourceEl.className = 'source-editor';
    sourceEl.spellcheck = false;
    sourceEl.addEventListener('input', () => {
      if (window.electronAPI) window.electronAPI.documentModified();
    });

    // Insert after editor
    const container = document.querySelector('.editor-container');
    container.appendChild(sourceEl);
  }

  if (enable) {
    // Switching to source mode
    const content = crepe ? crepe.getMarkdown() : currentContent;
    sourceEl.value = content;

    if (crepe) {
      editorEl.style.display = 'none';
      sourceEl.style.display = 'block';
      sourceEl.focus();
    }
  } else {
    // Switching back to visual mode
    const content = sourceEl.value;
    sourceEl.style.display = 'none';
    editorEl.style.display = 'block';

    // Re-init editor with new content
    initEditor(content);
  }
}

// Set up IPC listeners for Electron
function setupElectronListeners() {
  if (!window.electronAPI) {
    console.log('Running in browser mode (no Electron API)');
    return;
  }

  // New document
  window.electronAPI.onNewDocument(() => {
    initEditor(defaultContent);
    updateFilename(null);
  });

  // File opened
  window.electronAPI.onFileOpened((data) => {
    initEditor(data.content);
    updateFilename(data.path);
  });

  // Request content for save
  window.electronAPI.onRequestContent(() => {
    const content = getMarkdown();
    window.electronAPI.sendContent(content);
  });

  // Toggle sidebar
  window.electronAPI.onToggleSidebar(() => {
    const sidebar = document.getElementById('sidebar');
    sidebar?.classList.toggle('collapsed');
  });

  // Toggle source mode
  window.electronAPI.onToggleSource((enabled) => {
    toggleSourceMode(enabled);
  });

  // Theme change
  window.electronAPI.onThemeChange?.((themeName) => {
    setTheme(themeName);
  });

  // Send current theme to main process on load
  const savedTheme = loadSavedTheme();
  window.electronAPI.sendCurrentTheme?.(savedTheme);

  // Format commands
  window.electronAPI.onFormat((type) => {
    if (isSourceMode || !crepe) return;
    const command = formatCommands[type];
    if (command) {
      const action = command();
      if (action) crepe.action(action);
    }
  });

  // Paragraph commands
  window.electronAPI.onParagraph((type) => {
    if (isSourceMode || !crepe) return;
    const command = paragraphCommands[type];
    if (command) {
      const action = command();
      if (action) crepe.action(action);
    }
  });
}

function closePopover() {
  const container = document.getElementById('filename-container');
  const popover = document.getElementById('filename-popover');
  if (popover) popover.classList.remove('show');
  if (container) container.classList.remove('active');
  isPopoverOpen = false;
}

async function togglePopover(e) {
  const container = document.getElementById('filename-container');
  const popover = document.getElementById('filename-popover');
  const nameInput = document.getElementById('document-name');
  const locationText = document.getElementById('location-text');

  if (!container || !popover) return;
  if (e && e.target.closest('.filename-popover')) return;

  if (!isPopoverOpen) {
    if (window.electronAPI) {
      try {
        const info = await window.electronAPI.getFileInfo();
        if (nameInput) nameInput.value = (info.name || 'Untitled').replace('.md', '');
        if (locationText) locationText.textContent = info.directory || 'Desktop — iCloud';
      } catch (err) {
        console.error('Failed to get file info:', err);
      }
    }

    popover.classList.add('show');
    container.classList.add('active');
    isPopoverOpen = true;

    setTimeout(() => {
      nameInput?.focus();
      nameInput?.select();
    }, 50);
  } else {
    closePopover();
  }
}

// DOM event listeners
document.addEventListener('DOMContentLoaded', () => {
  // Sidebar tab switching
  document.querySelectorAll('.sidebar-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      switchSidebarTab(tab.dataset.tab);
    });
  });

  // Sidebar resize functionality
  const sidebar = document.getElementById('sidebar');
  const resizer = document.getElementById('sidebar-resizer');

  if (sidebar && resizer) {
    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    // Load saved width from localStorage
    const savedWidth = localStorage.getItem('stoodio-sidebar-width');
    if (savedWidth) {
      sidebar.style.width = savedWidth + 'px';
    }

    resizer.addEventListener('mousedown', (e) => {
      isResizing = true;
      startX = e.clientX;
      startWidth = sidebar.offsetWidth;

      sidebar.classList.add('resizing');
      resizer.classList.add('active');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;

      const delta = e.clientX - startX;
      const newWidth = Math.min(400, Math.max(120, startWidth + delta));
      sidebar.style.width = newWidth + 'px';
    });

    document.addEventListener('mouseup', () => {
      if (!isResizing) return;

      isResizing = false;
      sidebar.classList.remove('resizing');
      resizer.classList.remove('active');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      // Save width to localStorage
      localStorage.setItem('stoodio-sidebar-width', sidebar.offsetWidth);
    });
  }

  // Source mode toggle button
  const toggleSourceBtn = document.getElementById('toggle-source-btn');
  toggleSourceBtn?.addEventListener('click', () => {
    toggleSourceMode(!isSourceMode);
  });

  // Filename popover logic
  const filenameContainer = document.getElementById('filename-container');
  filenameContainer?.addEventListener('click', togglePopover);

  // Close popover when clicking outside
  document.addEventListener('mousedown', (e) => {
    const container = document.getElementById('filename-container');
    if (isPopoverOpen && container && !container.contains(e.target)) {
      closePopover();
    }
  });

  // Handle renaming actions
  const nameInput = document.getElementById('document-name');

  async function handleRename() {
    const newName = nameInput.value.trim();
    if (newName && window.electronAPI) {
      const result = await window.electronAPI.renameFile(newName);
      if (result.success) {
        updateFilename(result.newPath || newName);
        if (result.newName) nameInput.value = result.newName.replace('.md', '');
        // We generally close on enter, but maybe not on blur?
        // Let's close on success if it was trigger by enter, handled below.
      } else if (result.error) {
        console.error('Rename failed:', result.error);
        // revert?
      }
    }
  }

  nameInput?.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      await handleRename();
      closePopover();
    } else if (e.key === 'Escape') {
      closePopover();
    }
  });

  // Save on blur as well
  nameInput?.addEventListener('blur', async () => {
    // Only rename if popover is still arguably "open" logic, but blur happens when clicking away anyway.
    if (isPopoverOpen) {
      await handleRename();
    }
  });

  // Handle location picker (Move)
  const locationPicker = document.getElementById('document-location');
  locationPicker?.addEventListener('click', async () => {
    if (window.electronAPI) {
      const result = await window.electronAPI.moveFile();
      if (result.success) {
        updateFilename(result.path);
        // Update location text in the popover immediately
        const locationText = document.getElementById('location-text');
        if (locationText) locationText.textContent = result.directory;
      }
    }
  });
});

// Initialize
setupElectronListeners();
initEditor();
