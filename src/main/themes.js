// Centralized theme configuration
// This is the single source of truth for all available themes

const themes = [
  { id: 'github', label: 'GitHub', group: 'light' },
  { id: 'github-dark', label: 'GitHub Dark', group: 'dark' },
  { id: 'sepia', label: 'Sepia', group: 'light' },
  { id: 'newsprint', label: 'Newsprint', group: 'light' },
  { id: 'night', label: 'Night', group: 'dark' },
  { id: 'dracula', label: 'Dracula', group: 'dark' },
  { id: 'gothic', label: 'Gothic', group: 'light' },
  { id: 'solarized-light', label: 'Solarized Light', group: 'light' }
];

const defaultTheme = 'github';

// Helper to get theme by ID
function getTheme(id) {
  return themes.find(t => t.id === id) || themes.find(t => t.id === defaultTheme);
}

// Helper to build theme menu items
// setThemeCallback: function to call when theme is selected
function buildThemeMenuItems(currentThemeId, setThemeCallback) {
  const items = [];
  const groups = { light: [], dark: [], other: [] };
  
  themes.forEach(theme => {
    const group = groups[theme.group] || groups.other;
    group.push(theme);
  });

  // Add light themes
  groups.light.forEach(theme => {
    items.push({
      label: theme.label,
      type: 'radio',
      checked: theme.id === currentThemeId,
      click: () => setThemeCallback(theme.id)
    });
  });

  // Add separator if we have both light and dark
  if (groups.light.length > 0 && groups.dark.length > 0) {
    items.push({ type: 'separator' });
  }

  // Add dark themes
  groups.dark.forEach(theme => {
    items.push({
      label: theme.label,
      type: 'radio',
      checked: theme.id === currentThemeId,
      click: () => setThemeCallback(theme.id)
    });
  });

  // Add separator before other themes if any
  if (groups.other.length > 0 && (groups.light.length > 0 || groups.dark.length > 0)) {
    items.push({ type: 'separator' });
  }

  // Add other themes
  groups.other.forEach(theme => {
    items.push({
      label: theme.label,
      type: 'radio',
      checked: theme.id === currentThemeId,
      click: () => setThemeCallback(theme.id)
    });
  });

  return items;
}

module.exports = {
  themes,
  defaultTheme,
  getTheme,
  buildThemeMenuItems
};

