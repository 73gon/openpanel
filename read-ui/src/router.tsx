import { createRouter } from '@tanstack/react-router'

// Import the generated route tree
import { routeTree } from './routeTree.gen'

// Create a new router instance
export const getRouter = () => {
  const router = createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreloadStaleTime: 30_000,
    defaultPreload: 'viewport',
    defaultPendingMs: 150,
    defaultPendingMinMs: 200,
  })

  return router
}
