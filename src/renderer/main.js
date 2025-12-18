import { Crepe } from '@milkdown/crepe';
import {
  toggleStrongCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleLinkCommand,
  wrapInHeadingCommand,
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
  wrapInBlockquoteCommand,
  createCodeBlockCommand
} from '@milkdown/preset-commonmark';
import {
  toggleStrikethroughCommand
} from '@milkdown/preset-gfm';
import { callCommand } from '@milkdown/utils';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';
import './styles/app.css';

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
    if (isSourceMode) return;
    if (!crepe) return;

    switch (type) {
      case 'bold':
        crepe.action(callCommand(toggleStrongCommand.key));
        break;
      case 'italic':
        crepe.action(callCommand(toggleEmphasisCommand.key));
        break;
      case 'strike':
        crepe.action(callCommand(toggleStrikethroughCommand.key));
        break;
      case 'code':
        crepe.action(callCommand(toggleInlineCodeCommand.key));
        break;
      case 'link':
        crepe.action(callCommand(toggleLinkCommand.key));
        break;
    }
  });

  // Paragraph commands
  window.electronAPI.onParagraph((type) => {
    if (isSourceMode) return;
    if (!crepe) return;

    switch (type) {
      case 'h1':
        crepe.action(callCommand(wrapInHeadingCommand.key, 1));
        break;
      case 'h2':
        crepe.action(callCommand(wrapInHeadingCommand.key, 2));
        break;
      case 'h3':
        crepe.action(callCommand(wrapInHeadingCommand.key, 3));
        break;
      case 'paragraph':
        // No direct turnIntoParagraph command easily available in this context
        // Leaving empty for now
        break;
      case 'bullet':
        crepe.action(callCommand(wrapInBulletListCommand.key));
        break;
      case 'ordered':
        crepe.action(callCommand(wrapInOrderedListCommand.key));
        break;
      case 'quote':
        crepe.action(callCommand(wrapInBlockquoteCommand.key));
        break;
      case 'codeblock':
        crepe.action(callCommand(createCodeBlockCommand.key));
        break;
    }
  });
}

// DOM event listeners
document.addEventListener('DOMContentLoaded', () => {
  // Sidebar toggle with click
  const sidebarHeader = document.querySelector('.sidebar-header');
  sidebarHeader?.addEventListener('click', () => {
    const sidebar = document.getElementById('sidebar');
    sidebar?.classList.toggle('collapsed');
  });

  // Source mode toggle button
  const toggleSourceBtn = document.getElementById('toggle-source-btn');
  toggleSourceBtn?.addEventListener('click', () => {
    toggleSourceMode(!isSourceMode);
  });
});

// Initialize
setupElectronListeners();
initEditor();
