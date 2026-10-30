/**
 * Application constants
 */

export const PLUGIN_ID = 'stash-downloader';
export const PLUGIN_NAME = 'Stash Downloader';
// Version is injected at build time via __APP_VERSION__ (from package.json)

// Route base derived from PLUGIN_ID so dev builds (renamed by CI) get /downloader-dev.
// Must NOT live under /plugin/: Stash's server owns /plugin/{id}/* for plugin assets,
// so a page reload on /plugin/stash-downloader returns the server's plain 404.
const ROUTE_BASE = `/${PLUGIN_ID.replace(/^stash-/, '')}`;

export const ROUTES = {
  MAIN: ROUTE_BASE,
  // Old route, kept as an in-app redirect for the AMO extension and old bookmarks
  LEGACY_MAIN: `/plugin/${PLUGIN_ID}`,
} as const;

export const DEFAULT_SETTINGS = {
  serverDownloadPath: '',
  autoCreatePerformers: true,
  autoCreateTags: true,
  autoCreateStudios: false,
  downloadQuality: 'best' as const,
  filenameTemplate: '{title}',
  enableNotifications: true,
  logLevel: 'info' as const,
  showThumbnailPreviews: true,
  autoImport: false,
};

export const STORAGE_KEYS = {
  SETTINGS: 'stash-downloader:settings',
  QUEUE: 'stash-downloader:queue',
  DOWNLOAD_HISTORY: 'stash-downloader:history',
  LOGS: 'stash-downloader:logs',
} as const;

export const API_ENDPOINTS = {
  GRAPHQL: '/graphql',
  PLAYGROUND: '/playground',
} as const;

export const FILE_SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

export const VIDEO_EXTENSIONS = [
  '.mp4',
  '.mkv',
  '.avi',
  '.mov',
  '.wmv',
  '.flv',
  '.webm',
  '.m4v',
] as const;

export const IMAGE_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.bmp',
] as const;
