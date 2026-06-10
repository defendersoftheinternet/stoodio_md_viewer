// Centralized theme configuration
// This is the single source of truth for all available themes

const themes = [
  { id: 'github', label: 'GitHub', group: 'light', background: '#ffffff' },
  { id: 'github-dark', label: 'GitHub Dark', group: 'dark', background: '#0d1117' },
  { id: 'sepia', label: 'Sepia', group: 'light', background: '#f4ecd8' },
  { id: 'newsprint', label: 'Newsprint', group: 'light', background: '#f5f5f0' },
  { id: 'night', label: 'Night', group: 'dark', background: '#1a1a1a' },
  { id: 'dracula', label: 'Dracula', group: 'dark', background: '#282a36' },
  { id: 'gothic', label: 'Gothic', group: 'light', background: '#ffffff' },
  { id: 'solarized-light', label: 'Solarized Light', group: 'light', background: '#fdf6e3' }
];

const defaultTheme = 'github';

// 'system' follows the macOS appearance, mapping to this light/dark pair
const SYSTEM_THEME = 'system';
const systemLightTheme = 'github';
const systemDarkTheme = 'github-dark';

// Helper to get theme by ID
function getTheme(id) {
  return themes.find(t => t.id === id) || themes.find(t => t.id === defaultTheme);
}

// Resolve a theme choice (which may be 'system') to a concrete theme id
function resolveThemeId(choice, prefersDark) {
  if (choice === SYSTEM_THEME) {
    return prefersDark ? systemDarkTheme : systemLightTheme;
  }
  return getTheme(choice).id;
}

// Background color for a resolved theme id (used for BrowserWindow backgroundColor)
function getThemeBackground(id) {
  return getTheme(id).background;
}

// Helper to build theme menu items
// setThemeCallback: function to call when theme is selected
function buildThemeMenuItems(currentThemeId, setThemeCallback) {
  const items = [
    {
      label: 'Auto (Match System)',
      type: 'radio',
      checked: currentThemeId === SYSTEM_THEME,
      click: () => setThemeCallback(SYSTEM_THEME)
    },
    { type: 'separator' }
  ];
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
  SYSTEM_THEME,
  getTheme,
  resolveThemeId,
  getThemeBackground,
  buildThemeMenuItems
};
