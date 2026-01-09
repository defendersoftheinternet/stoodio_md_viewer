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
initEditor();
