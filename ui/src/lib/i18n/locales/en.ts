/**
 * English translations (default / fallback locale).
 * This file defines the canonical set of translation keys.
 */
const en = {
  // Navigation
  home: 'Home',
  search: 'Search',
  collections: 'Collections',
  downloads: 'Downloads',
  profile: 'Profile',
  admin: 'Admin',
  settings: 'Settings',
  shortcuts: 'Shortcuts',

  // Theme
  lightMode: 'Light Mode',
  darkMode: 'Dark Mode',

  // Auth
  signIn: 'Sign In',
  signOut: 'Sign out',
  username: 'Username',
  password: 'Password',
  createAccount: 'Create Account',
  changePassword: 'Change Password',
  currentPassword: 'Current password',
  newPassword: 'New password',
  confirmPassword: 'Confirm new password',

  // Home
  continueReading: 'Continue Reading',
  recentlyAdded: 'Recently Added',
  recentlyUpdated: 'Recently Updated',
  allSeries: 'All Series',
  noSeries: 'No series found',
  filterAndSort: 'Filter & Sort',

  // Series
  volumes: 'Volumes',
  chapters: 'Chapters',
  startReading: 'Start Reading',
  continueChapter: 'Continue',
  readAgain: 'Read Again',
  markRead: 'Mark Read',
  markUnread: 'Mark Unread',
  download: 'Download',
  downloadAll: 'Download All',
  rescan: 'Rescan',

  // Reader
  previousPage: 'Previous page',
  nextPage: 'Next page',
  backToSeries: 'Back to series',
  bookmarks: 'Bookmarks',
  tableOfContents: 'Table of contents',
  readerSettings: 'Reader settings',
  readingMode: 'Reading Mode',
  pageFit: 'Page Fit',
  direction: 'Direction',
  scroll: 'Scroll',
  single: 'Single',
  double: 'Double',
  fitWidth: 'Width',
  fitHeight: 'Height',
  original: 'Original',
  leftToRight: 'Left to Right',
  rightToLeft: 'Right to Left',

  // Stats
  readingStatistics: 'Reading Statistics',
  booksCompleted: 'Books Completed',
  inProgress: 'In Progress',
  pagesRead: 'Pages Read',
  seriesExplored: 'Series Explored',
  readingStreaks: 'Reading Streaks',
  currentStreak: 'Current streak (days)',
  longestStreak: 'Longest streak (days)',
  completionRate: 'Completion rate',
  last30Days: 'Last 30 Days',
  topGenres: 'Top Genres',
  noActivity: 'No activity in the last 30 days',

  // Collections
  createCollection: 'Create Collection',
  deleteCollection: 'Delete collection',
  noCollections: 'No collections yet',
  collectionName: 'Collection name',

  // Downloads
  noDownloads: 'No downloads yet',
  cancelDownload: 'Cancel download',
  deleteDownload: 'Delete download',
  sortByName: 'Name',
  sortByDate: 'Date',
  sortBySize: 'Size',
  filterAll: 'All',
  filterComplete: 'Complete',
  filterIncomplete: 'Incomplete',

  // Admin
  libraries: 'Libraries',
  profiles: 'Profiles',
  logs: 'Logs',
  backups: 'Backups',
  updates: 'Updates',
  addLibrary: 'Add Library',
  scanNow: 'Scan Now',
  scanning: 'Scanning...',

  // Settings
  chapterView: 'Chapter View',
  volumeView: 'Volume View',
  homeSections: 'Home Sections',
  readerPreferences: 'Reader Preferences',
  language: 'Language',

  // General
  loading: 'Loading...',
  error: 'Error',
  retry: 'Retry',
  cancel: 'Cancel',
  save: 'Save',
  delete: 'Delete',
  confirm: 'Confirm',
  goHome: 'Go home',
  back: 'Back',
  noData: 'No data',
} as const

export type TranslationKey = keyof typeof en

export default en
