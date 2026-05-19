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
  insertImageCommand,
  orderedListSchema,
  listItemSchema
} from '@milkdown/preset-commonmark';
import {
  toggleStrikethroughCommand,
  insertTableCommand,
  addColBeforeCommand,
  addColAfterCommand,
  addRowBeforeCommand,
  addRowAfterCommand,
  deleteSelectedCellsCommand
} from '@milkdown/preset-gfm';
import { callCommand, $prose, $markSchema, $command } from '@milkdown/utils';
import { toggleMark } from '@milkdown/prose/commands';
import { editorViewCtx } from '@milkdown/core';
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

// Custom underline mark (not standard markdown - uses <u> HTML tags)
const underlineSchema = $markSchema('underline', () => ({
  parseDOM: [
    { tag: 'u' },
    { style: 'text-decoration', getAttrs: (value) => value === 'underline' && null }
  ],
  toDOM: () => ['u', 0],
  parseMarkdown: {
    match: () => false, // No standard markdown for underline
    runner: () => {},
  },
  toMarkdown: {
    match: (mark) => mark.type.name === 'underline',
    runner: () => {
      // Underline mark is stripped in markdown output (text content preserved)
    },
  },
}));

const toggleUnderlineCommand = $command('ToggleUnderline', (ctx) => () =>
  toggleMark(underlineSchema.type(ctx))
);

// Image paste and drag-drop plugin
const clipboardImagePlugin = $prose(() => {
  return new Plugin({
    key: new PluginKey('STOODIO_CLIPBOARD_IMAGE'),
    props: {
      handlePaste(view, event) {
        const items = event.clipboardData?.items;
        if (!items) return false;

        for (const item of items) {
          if (item.type.startsWith('image/')) {
            event.preventDefault();
            const file = item.getAsFile();
            if (!file) continue;

            (async () => {
              try {
                const buffer = await file.arrayBuffer();
                if (!window.electronAPI?.saveImage) return;
                const result = await window.electronAPI.saveImage({
                  buffer: Array.from(new Uint8Array(buffer)),
                  fileName: `paste-${Date.now()}.png`
                });
                const imageType = view.state.schema.nodes.image;
                if (imageType) {
                  const node = imageType.create({ src: result.src, alt: '' });
                  view.dispatch(view.state.tr.replaceSelectionWith(node));
                }
              } catch (err) {
                console.error('Failed to paste image:', err);
              }
            })();
            return true;
          }
        }
        return false;
      },
      handleDrop(view, event) {
        const files = event.dataTransfer?.files;
        if (!files || files.length === 0) return false;

        const imageFile = Array.from(files).find(f => f.type.startsWith('image/'));
        if (!imageFile) return false;

        event.preventDefault();
        (async () => {
          try {
            const buffer = await imageFile.arrayBuffer();
            if (!window.electronAPI?.saveImage) return;
            const result = await window.electronAPI.saveImage({
              buffer: Array.from(new Uint8Array(buffer)),
              fileName: imageFile.name || `drop-${Date.now()}.png`
            });
            const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
            if (pos) {
              const imageType = view.state.schema.nodes.image;
              if (imageType) {
                const node = imageType.create({ src: result.src, alt: '' });
                view.dispatch(view.state.tr.insert(pos.pos, node));
              }
            }
          } catch (err) {
            console.error('Failed to drop image:', err);
          }
        })();
        return true;
      }
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

// Tab state
let tabs = [];  // Array of { id, path, name, content, isModified, scrollPos }
let activeTabId = null;
let tabIdCounter = 0;

function generateTabId() {
  return `tab-${++tabIdCounter}`;
}

// Get the active tab object
function getActiveTab() {
  return tabs.find(t => t.id === activeTabId);
}

// Create a new tab
function createTab(path = null, content = defaultContent, switchTo = true) {
  // Check if file is already open
  if (path) {
    const existingTab = tabs.find(t => t.path === path);
    if (existingTab) {
      if (switchTo) switchTab(existingTab.id);
      return existingTab;
    }
  }

  const name = path ? path.split('/').pop() : 'Untitled';
  const tab = {
    id: generateTabId(),
    path,
    name,
    content,
    isModified: false,
    scrollPos: 0
  };

  tabs.push(tab);

  if (switchTo) {
    switchTab(tab.id);
  } else {
    renderTabs();
  }

  return tab;
}

// Switch to a tab
async function switchTab(tabId) {
  if (tabId === activeTabId) return;

  // Save current tab state
  const currentTab = getActiveTab();
  if (currentTab) {
    currentTab.content = getMarkdown();
    const editorEl = document.querySelector('.milkdown .ProseMirror');
    currentTab.scrollPos = editorEl?.scrollTop || 0;
  }

  activeTabId = tabId;
  const newTab = getActiveTab();

  if (newTab) {
    // Update editor content
    await initEditor(newTab.content);

    // Restore scroll position after a short delay
    setTimeout(() => {
      const editorEl = document.querySelector('.milkdown .ProseMirror');
      if (editorEl) editorEl.scrollTop = newTab.scrollPos;
    }, 50);

    // Update UI
    updateFilename(newTab.path);
    renderTabs();

    // Notify main process of active tab change
    if (window.electronAPI?.setActiveTabInfo) {
      window.electronAPI.setActiveTabInfo({
        path: newTab.path,
        name: newTab.name,
        isModified: newTab.isModified
      });
    }
  }
}

// Close a tab
async function closeTab(tabId) {
  const tabIndex = tabs.findIndex(t => t.id === tabId);
  if (tabIndex === -1) return;

  const tab = tabs[tabIndex];
  if (tab.id === activeTabId) {
    tab.content = getMarkdown();
  }

  // Prompt to save if modified
  if (tab.isModified) {
    const shouldClose = await confirmCloseTab(tab);
    if (!shouldClose) return;
  }

  // Remove the tab
  tabs.splice(tabIndex, 1);

  // Handle closing active tab
  if (tabId === activeTabId) {
    if (tabs.length === 0) {
      // Create new untitled tab if closing last tab
      createTab();
    } else {
      // Switch to adjacent tab
      const newIndex = Math.min(tabIndex, tabs.length - 1);
      switchTab(tabs[newIndex].id);
    }
  } else {
    renderTabs();
  }
}

async function confirmCloseAllTabs() {
  const activeTab = getActiveTab();
  if (activeTab) {
    activeTab.content = getMarkdown();
  }

  for (const tab of tabs) {
    if (!tab.isModified) continue;
    const shouldClose = await confirmCloseTab(tab);
    if (!shouldClose) return false;
  }

  return true;
}

// Confirm close for modified tab
async function confirmCloseTab(tab) {
  if (!window.electronAPI?.confirmClose) {
    // Fallback to browser confirm
    return confirm(`Save changes to "${tab.name}" before closing?`);
  }

  const result = await window.electronAPI.confirmClose(tab.name);
  if (result === 'save') {
    return saveTab(tab);
  } else if (result === 'discard') {
    return true;
  }
  return false; // Cancel
}

// Save a specific tab without relying on the main process' active file state.
async function saveTab(tab) {
  if (!tab) return;

  const isActive = tab.id === activeTabId;
  if (isActive) {
    tab.content = getMarkdown();
  }

  if (window.electronAPI?.saveTabContent) {
    const result = await window.electronAPI.saveTabContent({
      path: tab.path,
      content: tab.content,
      defaultName: tab.name,
      isActive
    });

    if (!result?.success) return false;

    tab.isModified = false;
    if (result.path) {
      tab.path = result.path;
      tab.name = result.path.split('/').pop();
    }

    renderTabs();
    if (isActive) {
      updateFilename(tab.path);
      window.electronAPI.setActiveTabInfo?.({
        path: tab.path,
        name: tab.name,
        isModified: false
      });
    }
    return true;
  }

  return false;
}

// Save the active tab
async function saveActiveTab() {
  return saveTab(getActiveTab());
}

// Mark active tab as modified
function markTabModified() {
  const tab = getActiveTab();
  if (tab && !tab.isModified) {
    tab.isModified = true;
    renderTabs();

    if (window.electronAPI?.setActiveTabInfo) {
      window.electronAPI.setActiveTabInfo({
        path: tab.path,
        name: tab.name,
        isModified: true
      });
    }
  }
}

// Mark active tab as saved (not modified)
function markTabSaved(newPath = null) {
  const tab = getActiveTab();
  if (tab) {
    tab.isModified = false;
    if (newPath) {
      tab.path = newPath;
      tab.name = newPath.split('/').pop();
    }
    renderTabs();
    updateFilename(tab.path);

    if (window.electronAPI?.setActiveTabInfo) {
      window.electronAPI.setActiveTabInfo({
        path: tab.path,
        name: tab.name,
        isModified: false
      });
    }
  }
}

// Render the tab bar
function renderTabs() {
  const container = document.getElementById('tabs-container');
  if (!container) return;

  container.innerHTML = tabs.map(tab => `
    <div class="tab ${tab.id === activeTabId ? 'active' : ''} ${tab.isModified ? 'modified' : ''}"
         data-tab-id="${tab.id}">
      <span class="tab-name">${escapeHtml(tab.name)}</span>
      <button class="tab-close" data-tab-id="${tab.id}" title="Close">×</button>
    </div>
  `).join('');

  attachTabListeners();
}

// Attach click listeners to tabs
function attachTabListeners() {
  const container = document.getElementById('tabs-container');
  if (!container) return;

  // Tab click (switch)
  container.querySelectorAll('.tab').forEach(tabEl => {
    tabEl.addEventListener('click', (e) => {
      if (e.target.closest('.tab-close')) return;
      const tabId = tabEl.dataset.tabId;
      switchTab(tabId);
    });
  });

  // Close button click
  container.querySelectorAll('.tab-close').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const tabId = btn.dataset.tabId;
      closeTab(tabId);
    });
  });
}

// Navigate to next tab
function nextTab() {
  if (tabs.length <= 1) return;
  const currentIndex = tabs.findIndex(t => t.id === activeTabId);
  const nextIndex = (currentIndex + 1) % tabs.length;
  switchTab(tabs[nextIndex].id);
}

// Navigate to previous tab
function prevTab() {
  if (tabs.length <= 1) return;
  const currentIndex = tabs.findIndex(t => t.id === activeTabId);
  const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
  switchTab(tabs[prevIndex].id);
}

// Find & Replace state
let isFindPanelOpen = false;
let findMatches = [];
let currentMatchIndex = -1;

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
  underline: () => callCommand(toggleUnderlineCommand.key),
  strike: () => callCommand(toggleStrikethroughCommand.key),
  code: () => callCommand(toggleInlineCodeCommand.key),
  link: () => callCommand(toggleLinkCommand.key)
};

const paragraphCommands = {
  h1: () => callCommand(wrapInHeadingCommand.key, 1),
  h2: () => callCommand(wrapInHeadingCommand.key, 2),
  h3: () => callCommand(wrapInHeadingCommand.key, 3),
  h4: () => callCommand(wrapInHeadingCommand.key, 4),
  h5: () => callCommand(wrapInHeadingCommand.key, 5),
  h6: () => callCommand(wrapInHeadingCommand.key, 6),
  paragraph: () => null, // No direct command available
  bullet: () => callCommand(wrapInBulletListCommand.key),
  ordered: () => callCommand(wrapInOrderedListCommand.key),
  quote: () => callCommand(wrapInBlockquoteCommand.key),
  codeblock: () => callCommand(createCodeBlockCommand.key)
};

const tableCommands = {
  insert: () => callCommand(insertTableCommand.key, { row: 3, col: 3 }),
  addRowBefore: () => callCommand(addRowBeforeCommand.key),
  addRowAfter: () => callCommand(addRowAfterCommand.key),
  addColBefore: () => callCommand(addColBeforeCommand.key),
  addColAfter: () => callCommand(addColAfterCommand.key),
  deleteSelected: () => callCommand(deleteSelectedCellsCommand.key)
};

// Initialize the editor
async function initEditor(content = defaultContent) {
  console.log('Initializing editor...');
  currentContent = content;
  isSourceMode = false;

  try {
    // Destroy existing editor if any
    if (crepe) {
      await crepe.destroy();
      crepe = null;
    }

    // Hide source area and show editor
    const editorEl = document.getElementById('editor');
    const sourceEl = document.getElementById('source-area');
    const toggleBtn = document.getElementById('toggle-source-btn');
    if (editorEl) editorEl.style.display = 'block';
    if (sourceEl) sourceEl.style.display = 'none';
    toggleBtn?.classList.remove('active');

    crepe = new Crepe({
      root: '#editor',
      defaultValue: content,
    });

    // Add custom plugins
    crepe.editor.use(fixOrderedListPlugin);
    crepe.editor.use(underlineSchema).use(toggleUnderlineCommand);
    crepe.editor.use(clipboardImagePlugin);

    // Listen for updates
    crepe.on((listener) => {
      listener.updated((ctx, doc, prevDoc) => {
        markTabModified();
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

  // Get headings directly from the ProseMirror DOM
  const editorEl = document.querySelector('.milkdown .ProseMirror');
  if (!editorEl) return;

  const headingEls = editorEl.querySelectorAll('h1, h2, h3, h4, h5, h6');

  if (headingEls.length === 0) {
    outlineEl.innerHTML = '<p class="outline-empty">No headings found</p>';
    return;
  }

  // Build outline HTML with unique IDs for each heading
  const html = Array.from(headingEls).map((el, index) => {
    const level = parseInt(el.tagName[1]);
    const text = el.textContent || '';
    return `
      <a href="#" class="outline-item outline-h${level}" data-heading-index="${index}">
        ${escapeHtml(text)}
      </a>
    `;
  }).join('');

  outlineEl.innerHTML = html;

  // Attach click listeners to outline items
  outlineEl.querySelectorAll('.outline-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const index = parseInt(item.dataset.headingIndex);
      scrollToHeading(index);
    });
  });
}

// Scroll to a heading by its index in the document
function scrollToHeading(index) {
  const editorEl = document.querySelector('.milkdown .ProseMirror');
  if (!editorEl) return;

  const headingEls = editorEl.querySelectorAll('h1, h2, h3, h4, h5, h6');
  const targetHeading = headingEls[index];

  if (targetHeading) {
    targetHeading.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });

    // Brief highlight effect
    targetHeading.classList.add('outline-highlight');
    setTimeout(() => {
      targetHeading.classList.remove('outline-highlight');
    }, 1500);
  }
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

// Update active file highlight without refreshing the tree
function updateActiveFileInTree(filePath) {
  const fileTreeEl = document.getElementById('file-tree');
  if (!fileTreeEl) return;

  // Remove active class from all items
  fileTreeEl.querySelectorAll('.file-tree-item.active').forEach(item => {
    item.classList.remove('active');
  });

  // Find and highlight the new active file
  const activeItem = fileTreeEl.querySelector(`.file-tree-item[data-path="${CSS.escape(filePath)}"]`);
  if (activeItem) {
    activeItem.classList.add('active');

    // Auto-expand parent folders to show the active file
    let parent = activeItem.closest('.file-tree-folder-contents');
    while (parent) {
      const folder = parent.closest('.file-tree-folder');
      if (folder && !folder.classList.contains('expanded')) {
        folder.classList.add('expanded');
      }
      parent = folder?.parentElement?.closest('.file-tree-folder-contents');
    }
  }
}

// Render file tree items (folders load contents on demand)
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
          <div class="file-tree-folder-contents"></div>
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
        // Active state is updated via file-opened event
      }
    });
  });

  // Folder clicks (toggle expand and load contents on demand)
  fileTreeEl.querySelectorAll('.file-tree-folder > .file-tree-item').forEach(item => {
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      const folder = item.closest('.file-tree-folder');
      if (!folder) return;

      const isExpanded = folder.classList.contains('expanded');

      if (!isExpanded) {
        // Expanding - load contents if not already loaded
        const contentsEl = folder.querySelector('.file-tree-folder-contents');
        if (contentsEl && !contentsEl.dataset.loaded && window.electronAPI) {
          const folderPath = folder.dataset.path;
          try {
            const result = await window.electronAPI.getFolderContents(folderPath);
            if (result.success && result.items.length > 0) {
              contentsEl.innerHTML = renderFileTreeItems(result.items);
              contentsEl.dataset.loaded = 'true';
              // Attach listeners to newly added items
              attachFolderContentListeners(contentsEl);
            } else {
              contentsEl.innerHTML = '<div class="file-tree-empty-folder">Empty</div>';
              contentsEl.dataset.loaded = 'true';
            }
          } catch (err) {
            console.error('Failed to load folder contents:', err);
          }
        }
      }

      folder.classList.toggle('expanded');
    });
  });
}

// Attach listeners to dynamically loaded folder contents
function attachFolderContentListeners(contentsEl) {
  // File clicks
  contentsEl.querySelectorAll(':scope > .file-tree-item[data-path]').forEach(item => {
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      const filePath = item.dataset.path;
      if (filePath && window.electronAPI) {
        await window.electronAPI.openFileFromTree(filePath);
        // Active state is updated via file-opened event
      }
    });
  });

  // Folder clicks
  contentsEl.querySelectorAll(':scope > .file-tree-folder > .file-tree-item').forEach(item => {
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      const folder = item.closest('.file-tree-folder');
      if (!folder) return;

      const isExpanded = folder.classList.contains('expanded');

      if (!isExpanded) {
        const innerContentsEl = folder.querySelector('.file-tree-folder-contents');
        if (innerContentsEl && !innerContentsEl.dataset.loaded && window.electronAPI) {
          const folderPath = folder.dataset.path;
          try {
            const result = await window.electronAPI.getFolderContents(folderPath);
            if (result.success && result.items.length > 0) {
              innerContentsEl.innerHTML = renderFileTreeItems(result.items);
              innerContentsEl.dataset.loaded = 'true';
              attachFolderContentListeners(innerContentsEl);
            } else {
              innerContentsEl.innerHTML = '<div class="file-tree-empty-folder">Empty</div>';
              innerContentsEl.dataset.loaded = 'true';
            }
          } catch (err) {
            console.error('Failed to load folder contents:', err);
          }
        }
      }

      folder.classList.toggle('expanded');
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
      markTabModified();
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

// Generate HTML for export
function generateExportHTML() {
  const editorEl = document.querySelector('.milkdown .ProseMirror');
  if (!editorEl) return '';

  const contentHTML = editorEl.innerHTML;

  // Get computed styles from current theme
  const computedStyles = getComputedStyle(document.documentElement);

  // Build inline CSS
  const themeCSS = `
    body {
      font-family: ${computedStyles.getPropertyValue('--font-body') || '-apple-system, BlinkMacSystemFont, sans-serif'};
      font-size: ${computedStyles.getPropertyValue('--font-size-base') || '16px'};
      line-height: ${computedStyles.getPropertyValue('--line-height-base') || '1.6'};
      color: ${computedStyles.getPropertyValue('--text-primary') || '#333'};
      background: ${computedStyles.getPropertyValue('--bg-primary') || '#fff'};
      max-width: 860px;
      margin: 0 auto;
      padding: 40px;
    }
    h1, h2, h3, h4, h5, h6 {
      font-weight: bold;
      margin: 1.5em 0 0.5em 0;
      color: ${computedStyles.getPropertyValue('--text-primary') || '#333'};
    }
    h1 { font-size: 2.25em; border-bottom: 1px solid ${computedStyles.getPropertyValue('--border-color') || '#eee'}; padding-bottom: 0.3em; }
    h2 { font-size: 1.75em; border-bottom: 1px solid ${computedStyles.getPropertyValue('--border-color') || '#eee'}; padding-bottom: 0.3em; }
    h3 { font-size: 1.5em; }
    h4 { font-size: 1.25em; }
    a { color: ${computedStyles.getPropertyValue('--accent-color') || '#4183C4'}; text-decoration: none; }
    a:hover { text-decoration: underline; }
    code {
      background: ${computedStyles.getPropertyValue('--code-bg') || '#f3f4f4'};
      padding: 2px 4px;
      border-radius: 3px;
      font-family: ${computedStyles.getPropertyValue('--font-mono') || 'monospace'};
    }
    pre {
      background: ${computedStyles.getPropertyValue('--bg-secondary') || '#f6f8fa'};
      padding: 16px;
      border-radius: 6px;
      overflow-x: auto;
    }
    pre code { background: none; padding: 0; }
    blockquote {
      border-left: 4px solid ${computedStyles.getPropertyValue('--border-color-strong') || '#ddd'};
      padding-left: 16px;
      margin: 1em 0;
      color: ${computedStyles.getPropertyValue('--text-secondary') || '#666'};
    }
    table { border-collapse: collapse; width: 100%; margin: 1em 0; }
    th, td {
      border: 1px solid ${computedStyles.getPropertyValue('--border-color-strong') || '#ddd'};
      padding: 8px 12px;
    }
    th { background: ${computedStyles.getPropertyValue('--bg-secondary') || '#f6f8fa'}; }
    hr { border: none; height: 2px; background: ${computedStyles.getPropertyValue('--border-color') || '#eee'}; margin: 2em 0; }
    ul, ol { padding-left: 2em; }
    li { margin: 0.25em 0; }
    img { max-width: 100%; height: auto; }
  `;

  const fileName = document.getElementById('filename')?.textContent || 'Untitled';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(fileName)}</title>
  <style>
${themeCSS}
  </style>
</head>
<body>
${contentHTML}
</body>
</html>`;
}

// Find & Replace functions
function showFindPanel(showReplace = false) {
  const panel = document.getElementById('find-replace-panel');
  const replaceRow = document.getElementById('replace-row');
  const findInput = document.getElementById('find-input');

  if (!panel) return;

  panel.classList.add('show');
  isFindPanelOpen = true;

  // Show/hide replace row
  if (replaceRow) {
    replaceRow.style.display = showReplace ? 'flex' : 'none';
  }

  // Focus find input
  setTimeout(() => {
    findInput?.focus();
    findInput?.select();
  }, 50);

  // If there's selected text, use it as search term
  if (crepe) {
    const selection = window.getSelection();
    if (selection && selection.toString().trim()) {
      findInput.value = selection.toString().trim();
      performFind();
    }
  }
}

function hideFindPanel() {
  const panel = document.getElementById('find-replace-panel');
  if (panel) {
    panel.classList.remove('show');
  }
  isFindPanelOpen = false;
  clearFindHighlights();
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function performFind() {
  const findInput = document.getElementById('find-input');
  const matchCase = document.getElementById('find-match-case')?.checked || false;
  const searchTerm = findInput?.value || '';

  clearFindHighlights();
  findMatches = [];
  currentMatchIndex = -1;

  if (!searchTerm || !crepe) {
    updateFindCount();
    return;
  }

  const editorEl = document.querySelector('.milkdown .ProseMirror');
  if (!editorEl) return;

  // Use TreeWalker to find text matches
  const walker = document.createTreeWalker(editorEl, NodeFilter.SHOW_TEXT, null, false);
  const textNodes = [];

  while (walker.nextNode()) {
    textNodes.push(walker.currentNode);
  }

  const searchFlags = matchCase ? 'g' : 'gi';
  const regex = new RegExp(escapeRegExp(searchTerm), searchFlags);

  textNodes.forEach(node => {
    const text = node.textContent;
    let match;
    regex.lastIndex = 0; // Reset regex state

    while ((match = regex.exec(text)) !== null) {
      findMatches.push({
        node: node,
        start: match.index,
        end: match.index + match[0].length,
        text: match[0]
      });
    }
  });

  if (findMatches.length > 0) {
    currentMatchIndex = 0;
    highlightMatches();
    scrollToCurrentMatch();
  }

  updateFindCount();
}

function highlightMatches() {
  // Process matches in reverse order to avoid position shifts
  const sortedMatches = [...findMatches].sort((a, b) => {
    if (a.node !== b.node) return 0;
    return b.start - a.start;
  });

  sortedMatches.forEach((match, index) => {
    const originalIndex = findMatches.indexOf(match);
    try {
      const range = document.createRange();
      range.setStart(match.node, match.start);
      range.setEnd(match.node, match.end);

      const highlight = document.createElement('mark');
      highlight.className = originalIndex === currentMatchIndex ? 'find-highlight-current' : 'find-highlight';
      highlight.dataset.findIndex = originalIndex;

      range.surroundContents(highlight);
      match.highlightElement = highlight;
    } catch (e) {
      console.warn('Could not highlight match:', e);
    }
  });
}

function clearFindHighlights() {
  document.querySelectorAll('.find-highlight, .find-highlight-current').forEach(el => {
    const parent = el.parentNode;
    while (el.firstChild) {
      parent.insertBefore(el.firstChild, el);
    }
    parent.removeChild(el);
  });
  // Normalize text nodes
  document.querySelector('.milkdown .ProseMirror')?.normalize();
}

function updateFindCount() {
  const countEl = document.getElementById('find-count');
  if (!countEl) return;

  if (findMatches.length === 0) {
    countEl.textContent = '0/0';
  } else {
    countEl.textContent = `${currentMatchIndex + 1}/${findMatches.length}`;
  }
}

function findNext() {
  if (findMatches.length === 0) return;

  // Remove current highlight
  if (findMatches[currentMatchIndex]?.highlightElement) {
    findMatches[currentMatchIndex].highlightElement.className = 'find-highlight';
  }

  currentMatchIndex = (currentMatchIndex + 1) % findMatches.length;

  // Add current highlight
  if (findMatches[currentMatchIndex]?.highlightElement) {
    findMatches[currentMatchIndex].highlightElement.className = 'find-highlight-current';
  }

  scrollToCurrentMatch();
  updateFindCount();
}

function findPrevious() {
  if (findMatches.length === 0) return;

  // Remove current highlight
  if (findMatches[currentMatchIndex]?.highlightElement) {
    findMatches[currentMatchIndex].highlightElement.className = 'find-highlight';
  }

  currentMatchIndex = (currentMatchIndex - 1 + findMatches.length) % findMatches.length;

  // Add current highlight
  if (findMatches[currentMatchIndex]?.highlightElement) {
    findMatches[currentMatchIndex].highlightElement.className = 'find-highlight-current';
  }

  scrollToCurrentMatch();
  updateFindCount();
}

function scrollToCurrentMatch() {
  if (currentMatchIndex < 0 || !findMatches[currentMatchIndex]?.highlightElement) return;

  findMatches[currentMatchIndex].highlightElement.scrollIntoView({
    behavior: 'smooth',
    block: 'center'
  });
}

function replaceCurrent() {
  if (currentMatchIndex < 0 || findMatches.length === 0) return;

  const replaceInput = document.getElementById('replace-input');
  const replaceWith = replaceInput?.value || '';
  const match = findMatches[currentMatchIndex];

  if (!match?.highlightElement) return;

  // Replace the text content
  match.highlightElement.textContent = replaceWith;

  // Remove highlight wrapper
  const parent = match.highlightElement.parentNode;
  while (match.highlightElement.firstChild) {
    parent.insertBefore(match.highlightElement.firstChild, match.highlightElement);
  }
  parent.removeChild(match.highlightElement);
  parent.normalize();

  // Notify document modified
  if (window.electronAPI) {
    window.electronAPI.documentModified();
  }

  // Re-run find to update matches
  performFind();
}

function replaceAll() {
  const findInput = document.getElementById('find-input');
  const replaceInput = document.getElementById('replace-input');
  const matchCase = document.getElementById('find-match-case')?.checked || false;
  const searchTerm = findInput?.value || '';
  const replaceWith = replaceInput?.value || '';

  if (!searchTerm || !crepe) return;

  // Get current markdown, perform replace, set content
  const markdown = crepe.getMarkdown();
  const searchFlags = matchCase ? 'g' : 'gi';
  const regex = new RegExp(escapeRegExp(searchTerm), searchFlags);
  const newMarkdown = markdown.replace(regex, replaceWith);

  if (newMarkdown !== markdown) {
    // Reinitialize editor with new content
    initEditor(newMarkdown);

    // Notify document modified
    if (window.electronAPI) {
      window.electronAPI.documentModified();
    }
  }

  // Clear find state
  clearFindHighlights();
  findMatches = [];
  currentMatchIndex = -1;
  updateFindCount();
}

// Debounce helper
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Clipboard operations
async function copyAsMarkdown() {
  if (!crepe) return;
  const markdown = crepe.getMarkdown();
  try {
    await navigator.clipboard.writeText(markdown);
  } catch (err) {
    console.error('Failed to copy markdown:', err);
  }
}

async function copyAsHTML() {
  const editorEl = document.querySelector('.milkdown .ProseMirror');
  if (!editorEl) return;
  try {
    const selection = window.getSelection();
    let html;
    if (selection && !selection.isCollapsed) {
      const range = selection.getRangeAt(0);
      const container = document.createElement('div');
      container.appendChild(range.cloneContents());
      html = container.innerHTML;
    } else {
      html = editorEl.innerHTML;
    }
    await navigator.clipboard.writeText(html);
  } catch (err) {
    console.error('Failed to copy HTML:', err);
  }
}

async function pasteAsPlainText() {
  if (!crepe) return;
  try {
    const text = await navigator.clipboard.readText();
    if (!text) return;
    crepe.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const { state } = view;
      const tr = state.tr.insertText(text);
      view.dispatch(tr);
      return true;
    });
  } catch (err) {
    console.error('Failed to paste as plain text:', err);
  }
}

// Task list toggle
function handleTaskListToggle() {
  if (!crepe) return;
  crepe.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const { state } = view;
    const { $from } = state.selection;

    // Walk up from cursor to find a list_item node
    for (let d = $from.depth; d > 0; d--) {
      const node = $from.node(d);
      if (node.type.name === 'list_item') {
        const pos = $from.before(d);
        const checked = node.attrs.checked;
        // Toggle: null/undefined → false (task unchecked), false/true → null (back to regular)
        const newChecked = (checked === null || checked === undefined) ? false : null;
        const tr = state.tr.setNodeMarkup(pos, null, {
          ...node.attrs,
          checked: newChecked
        });
        view.dispatch(tr);
        return true;
      }
    }

    // Not in a list - wrap in bullet list first
    const bulletAction = callCommand(wrapInBulletListCommand.key);
    bulletAction(ctx);
    return true;
  });
}

// Clear all formatting from selection
function clearFormatting() {
  if (!crepe) return;
  crepe.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const { state } = view;
    const { from, to } = state.selection;
    if (from === to) return false;
    const tr = state.tr.removeMark(from, to);
    view.dispatch(tr);
    return true;
  });
}

// Set up IPC listeners for Electron
function setupElectronListeners() {
  if (!window.electronAPI) {
    console.log('Running in browser mode (no Electron API)');
    return;
  }

  // New document (new tab)
  window.electronAPI.onNewDocument(() => {
    createTab();
  });

  // File opened (new tab or switch to existing)
  window.electronAPI.onFileOpened((data) => {
    createTab(data.path, data.content);

    // Handle file tree updates
    if (data.isNewRoot) {
      // New root folder - refresh entire file tree
      if (currentSidebarTab === 'files') {
        refreshFileTree();
      }
    } else {
      // Same root - just update active file highlight
      updateActiveFileInTree(data.path);
    }
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

    // Clear formatting - special case
    if (type === 'clear') {
      clearFormatting();
      return;
    }

    const command = formatCommands[type];
    if (command) {
      const action = command();
      if (action) crepe.action(action);
    }
  });

  // Paragraph commands
  window.electronAPI.onParagraph((type) => {
    if (isSourceMode || !crepe) return;

    // Task list toggle - special case
    if (type === 'task') {
      handleTaskListToggle();
      return;
    }

    const command = paragraphCommands[type];
    if (command) {
      const action = command();
      if (action) crepe.action(action);
    }
  });

  // Table commands
  window.electronAPI.onTableCommand?.((type) => {
    if (isSourceMode || !crepe) return;
    const command = tableCommands[type];
    if (command) {
      const action = command();
      if (action) crepe.action(action);
    }
  });

  // Clipboard operations
  window.electronAPI.onCopyAsMarkdown?.(() => {
    copyAsMarkdown();
  });

  window.electronAPI.onCopyAsHTML?.(() => {
    copyAsHTML();
  });

  window.electronAPI.onPastePlainText?.(() => {
    pasteAsPlainText();
  });

  // Image insertion from menu
  window.electronAPI.onInsertImage?.((data) => {
    if (isSourceMode || !crepe) return;
    const action = callCommand(insertImageCommand.key, { src: data.src, alt: data.alt || '', title: data.title || '' });
    if (action) crepe.action(action);
  });

  // Export - prepare for export (exit source mode if needed)
  window.electronAPI.onPrepareForExport?.(() => {
    if (isSourceMode) {
      toggleSourceMode(false);
    }
  });

  // Export - generate HTML
  window.electronAPI.onRequestHtmlExport?.(() => {
    const html = generateExportHTML();
    window.electronAPI.sendHtmlExport(html);
  });

  // Find & Replace
  window.electronAPI.onFind?.(() => {
    showFindPanel(false);
  });

  window.electronAPI.onFindReplace?.(() => {
    showFindPanel(true);
  });

  window.electronAPI.onFindNext?.(() => {
    if (isFindPanelOpen) {
      findNext();
    } else {
      showFindPanel(false);
    }
  });

  window.electronAPI.onFindPrevious?.(() => {
    if (isFindPanelOpen) {
      findPrevious();
    } else {
      showFindPanel(false);
    }
  });

  // Tab navigation
  window.electronAPI.onCloseTab?.(() => {
    const tab = getActiveTab();
    if (tab) closeTab(tab.id);
  });

  window.electronAPI.onNextTab?.(() => {
    nextTab();
  });

  window.electronAPI.onPrevTab?.(() => {
    prevTab();
  });

  window.electronAPI.onNewTab?.(() => {
    createTab();
  });

  window.electronAPI.onRequestCloseApp?.(async () => {
    const canClose = await confirmCloseAllTabs();
    window.electronAPI.sendCloseAppResponse?.(canClose);
  });

  // When save completes successfully
  window.electronAPI.onSaveComplete?.((data) => {
    markTabSaved(data?.path);
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
  filenameContainer?.addEventListener('click', (e) => {
    // Cmd+click shows path menu (macOS native behavior)
    if (e.metaKey && window.electronAPI?.showPathMenu) {
      e.preventDefault();
      e.stopPropagation();
      const rect = filenameContainer.getBoundingClientRect();
      window.electronAPI.showPathMenu({
        x: Math.round(rect.left),
        y: Math.round(rect.bottom + 4)
      });
      return;
    }
    togglePopover(e);
  });

  // Right-click on filename shows path hierarchy (macOS native behavior)
  filenameContainer?.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (window.electronAPI?.showPathMenu) {
      window.electronAPI.showPathMenu({
        x: Math.round(e.clientX),
        y: Math.round(e.clientY)
      });
    }
  });

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

  // Find & Replace panel listeners
  const findInput = document.getElementById('find-input');
  const replaceInput = document.getElementById('replace-input');
  const matchCaseCheckbox = document.getElementById('find-match-case');
  const findPrevBtn = document.getElementById('find-prev-btn');
  const findNextBtn = document.getElementById('find-next-btn');
  const findCloseBtn = document.getElementById('find-close-btn');
  const replaceBtn = document.getElementById('replace-btn');
  const replaceAllBtn = document.getElementById('replace-all-btn');

  // Find input changes
  const debouncedFind = debounce(performFind, 150);
  findInput?.addEventListener('input', debouncedFind);

  // Match case toggle
  matchCaseCheckbox?.addEventListener('change', performFind);

  // Navigation buttons
  findPrevBtn?.addEventListener('click', findPrevious);
  findNextBtn?.addEventListener('click', findNext);
  findCloseBtn?.addEventListener('click', hideFindPanel);

  // Replace buttons
  replaceBtn?.addEventListener('click', replaceCurrent);
  replaceAllBtn?.addEventListener('click', replaceAll);

  // Keyboard shortcuts in find input
  findInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        findPrevious();
      } else {
        findNext();
      }
      e.preventDefault();
    } else if (e.key === 'Escape') {
      hideFindPanel();
    }
  });

  // Keyboard shortcuts in replace input
  replaceInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      replaceCurrent();
      e.preventDefault();
    } else if (e.key === 'Escape') {
      hideFindPanel();
    }
  });

  // Global escape to close find panel
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isFindPanelOpen) {
      hideFindPanel();
    }
  });
});

// Initialize
setupElectronListeners();

// Create initial tab
createTab();

// New tab button listener
document.getElementById('new-tab-btn')?.addEventListener('click', () => {
  createTab();
});
