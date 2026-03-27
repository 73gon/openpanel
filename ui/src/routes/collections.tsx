import { createFileRoute, Link } from '@tanstack/react-router'
import { RouteErrorComponent } from '@/components/route-error'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowLeft,
  Add01Icon,
  Delete02Icon,
  Book02Icon,
  Cancel01Icon,
  Loading03Icon,
  FolderLibraryIcon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  fetchCollections,
  createCollection,
  deleteCollection,
  fetchCollection,
  removeFromCollection,
  type Collection,
  type CollectionWithItems,
} from '@/lib/api'

export const Route = createFileRoute('/collections')({
  loader: async () => {
    const collections = await fetchCollections()
    return { collections }
  },
  errorComponent: RouteErrorComponent,
  component: CollectionsPage,
})

function CollectionsPage() {
  const loaderData = Route.useLoaderData()
  const [collections, setCollections] = useState<Collection[]>(
    loaderData.collections,
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedCollection, setSelectedCollection] =
    useState<CollectionWithItems | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  // Create dialog
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  // Delete confirmation
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!selectedId) {
      setSelectedCollection(null)
      return
    }
    setLoadingDetail(true)
    fetchCollection(selectedId)
      .then(setSelectedCollection)
      .catch(() => setSelectedCollection(null))
      .finally(() => setLoadingDetail(false))
  }, [selectedId])

  const handleCreate = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const c = await createCollection(newName.trim())
      setCollections((prev) => [...prev, c])
      setNewName('')
      setShowCreate(false)
    } catch (err) {
      console.error('Failed to create collection:', err)
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: string) => {
    setDeleting(true)
    try {
      await deleteCollection(id)
      setCollections((prev) => prev.filter((c) => c.id !== id))
      if (selectedId === id) {
        setSelectedId(null)
      }
      setDeleteId(null)
    } catch (err) {
      console.error('Failed to delete collection:', err)
    } finally {
      setDeleting(false)
    }
  }

  const handleRemoveItem = async (seriesId: string) => {
    if (!selectedId) return
    try {
      await removeFromCollection(selectedId, seriesId)
      // Refresh the detail
      const updated = await fetchCollection(selectedId)
      setSelectedCollection(updated)
      // Update count in list
      setCollections((prev) =>
        prev.map((c) =>
          c.id === selectedId ? { ...c, item_count: updated.items.length } : c,
        ),
      )
    } catch (err) {
      console.error('Failed to remove from collection:', err)
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8 lg:max-w-6xl">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/">
              <Button variant="ghost" size="sm" className="gap-2">
                <HugeiconsIcon icon={ArrowLeft} size={16} />
                Back
              </Button>
            </Link>
            <h1 className="text-2xl font-bold">Collections</h1>
          </div>
          <Button
            size="sm"
            className="gap-2"
            onClick={() => setShowCreate(true)}
          >
            <HugeiconsIcon icon={Add01Icon} size={14} />
            New Collection
          </Button>
        </div>

        {/* Create dialog */}
        <AnimatePresence>
          {showCreate && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-4 overflow-hidden"
            >
              <Card>
                <CardContent className="flex items-center gap-3 pt-4">
                  <Input
                    placeholder="Collection name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                    className="flex-1"
                    autoFocus
                  />
                  <Button
                    size="sm"
                    onClick={handleCreate}
                    disabled={creating || !newName.trim()}
                  >
                    {creating ? (
                      <HugeiconsIcon
                        icon={Loading03Icon}
                        size={14}
                        className="animate-spin"
                      />
                    ) : (
                      'Create'
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setShowCreate(false)
                      setNewName('')
                    }}
                  >
                    <HugeiconsIcon icon={Cancel01Icon} size={14} />
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Collection list */}
        {collections.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <HugeiconsIcon
              icon={FolderLibraryIcon}
              size={48}
              className="mb-4 text-muted-foreground/30"
            />
            <p className="text-sm text-muted-foreground">
              No collections yet. Create one to organize your series.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {collections.map((col) => (
              <Card
                key={col.id}
                className={`cursor-pointer transition-colors hover:bg-accent/50 ${
                  selectedId === col.id ? 'ring-2 ring-primary' : ''
                }`}
                onClick={() =>
                  setSelectedId(selectedId === col.id ? null : col.id)
                }
              >
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">
                    {col.name}
                  </CardTitle>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">
                      {col.item_count} series
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      aria-label="Delete collection"
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeleteId(col.id)
                      }}
                    >
                      <HugeiconsIcon icon={Delete02Icon} size={14} />
                    </Button>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}

        {/* Delete confirmation */}
        <AnimatePresence>
          {deleteId && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
              onClick={() => setDeleteId(null)}
            >
              <motion.div
                initial={{ scale: 0.95 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.95 }}
                className="mx-4 w-full max-w-sm rounded-lg border border-border bg-background p-6 shadow-lg"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="mb-2 text-lg font-semibold">
                  Delete Collection?
                </h3>
                <p className="mb-4 text-sm text-muted-foreground">
                  This will remove the collection but not the series themselves.
                </p>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDeleteId(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDelete(deleteId)}
                    disabled={deleting}
                  >
                    {deleting ? 'Deleting...' : 'Delete'}
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Collection detail */}
        <AnimatePresence>
          {selectedId && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="mt-6"
            >
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    {selectedCollection?.name ?? 'Loading...'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loadingDetail ? (
                    <div className="flex items-center justify-center py-8">
                      <HugeiconsIcon
                        icon={Loading03Icon}
                        size={20}
                        className="animate-spin text-muted-foreground"
                      />
                    </div>
                  ) : selectedCollection &&
                    selectedCollection.items.length > 0 ? (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                      {selectedCollection.items.map((item) => (
                        <div key={item.series_id} className="group relative">
                          <Link
                            to="/series/$seriesId"
                            params={{ seriesId: item.series_id }}
                          >
                            <div className="aspect-3/4 overflow-hidden rounded-lg bg-muted">
                              {item.cover_url ? (
                                <img
                                  src={item.cover_url}
                                  alt={item.series_name}
                                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center">
                                  <HugeiconsIcon
                                    icon={Book02Icon}
                                    size={32}
                                    className="text-muted-foreground/30"
                                  />
                                </div>
                              )}
                            </div>
                            <p className="mt-1.5 line-clamp-2 text-xs font-medium">
                              {item.series_name}
                            </p>
                          </Link>
                          <button
                            onClick={() => handleRemoveItem(item.series_id)}
                            className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                            title="Remove from collection"
                          >
                            <HugeiconsIcon icon={Cancel01Icon} size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      No series in this collection yet. Add series from their
                      detail pages.
                    </p>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
