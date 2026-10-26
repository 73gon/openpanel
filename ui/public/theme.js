// Applies the saved theme before the first paint, so a page never flashes the wrong one. It is
// a file rather than an inline script because the server's CSP only runs scripts from 'self'.
// Keep the key and the default in step with <ThemeProvider> in src/main.tsx.
;(function () {
  var key = 'openpanel-theme'
  var theme = null
  try {
    theme = localStorage.getItem(key)
    if (!theme) {
      // The choice made before the theme moved out of the app store.
      var store = JSON.parse(localStorage.getItem('openpanel-store') || '{}')
      theme = store && store.state && store.state.theme
      if (theme) localStorage.setItem(key, theme)
    }
  } catch (e) {}
  if (theme !== 'light' && theme !== 'dark' && theme !== 'system')
    theme = 'dark'
  var dark = theme === 'dark'
  if (theme === 'system') {
    try {
      dark = matchMedia('(prefers-color-scheme: dark)').matches
    } catch (e) {}
  }
  document.documentElement.classList.toggle('dark', dark)
})()
