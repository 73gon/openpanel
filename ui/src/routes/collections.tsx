import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
  Field,
  FieldError,
  FieldLabel,
  Form,
  Heading,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  toast,
} from '@zonsh/ui'
import {
  EllipsisIcon,
  LayersIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react'
import { RouteErrorComponent } from '@/components/route-error'
import {
  addToCollection,
  fetchCollections,
  createCollection,
  deleteCollection,
  fetchCollection,
  getSeriesThumbnailUrl,
  removeFromCollection,
  type Collection,
  type CollectionItem,
} from '@/lib/api'
import { queryClient } from '@/lib/query'
import { countLabel, cn, pad2 } from '@/lib/utils'
import { Cover } from '@/components/cover'
import { Page } from '@/components/page'
import { PageHeader } from '@/components/page-header'
import { POSTER_GRID, PosterSkeleton } from '@/components/series-poster'

interface CollectionsSearch {
  id?: string
  new?: boolean
}

export const Route = createFileRoute('/collections')({
  validateSearch: (search: Record<string, unknown>): CollectionsSearch => ({
    ...(typeof search.id === 'string' && search.id ? { id: search.id } : {}),
    ...(search.new === true || search.new === 'true' ? { new: true } : {}),
  }),
  loader: () =>
    queryClient.ensureQueryData({
      queryKey: ['collections'],
      queryFn: fetchCollections,
    }),
  errorComponent: RouteErrorComponent,
  component: CollectionsPage,
})

function CollectionsPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: '/collections' })
  const { data: collections = [] } = useQuery({
    queryKey: ['collections'],
    queryFn: fetchCollections,
  })

  const [deleting, setDeleting] = useState<Collection | null>(null)

  const selected =
    collections.find((c) => c.id === search.id) ?? collections[0] ?? null

  const select = (id: string) =>
    navigate({ search: { id }, replace: true, resetScroll: false })

  const setCreateOpen = (open: boolean) =>
    navigate({
      search: (prev: CollectionsSearch) => ({
        ...prev,
        new: open ? true : undefined,
      }),
      replace: true,
      resetScroll: false,
    })

  return (
    <Page>
      <PageHeader
        eyebrow="Library"
        title="Collections"
        facts={
          collections.length
            ? countLabel(collections.length, 'collection')
            : undefined
        }
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <PlusIcon />
            New collection
          </Button>
        }
      />

      {collections.length === 0 ? (
        <Empty className="mt-6">
          <EmptyMedia>
            <LayersIcon />
          </EmptyMedia>
          <EmptyTitle render={<h2 />}>No collections yet</EmptyTitle>
          <EmptyDescription>
            Group series however you like: a shelf to finish, favourites, one
            for each reader. Add series to it from their pages.
          </EmptyDescription>
          <EmptyActions>
            <Button variant="secondary" onClick={() => setCreateOpen(true)}>
              Create a collection
            </Button>
          </EmptyActions>
        </Empty>
      ) : (
        <div className="mt-10 grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-12">
          {/* Wide screens: the collections as a list beside the open one. */}
          <nav aria-label="Collections" className="hidden lg:block">
            <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
              {collections.map((c) => (
                <li key={c.id}>
                  <Link
                    to="/collections"
                    search={{ id: c.id }}
                    replace
                    resetScroll={false}
                    aria-current={c.id === selected?.id ? 'page' : undefined}
                    className="flex min-h-(--control-h) items-center gap-2.5 rounded-button px-3 text-sm material-row focus-ring"
                  >
                    <LayersIcon className="size-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    <span className="font-mono text-xs text-muted-foreground tabular-nums">
                      {c.item_count}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Narrow screens: a choice of collection above the open one. */}
          {selected && (
            <Select
              items={collections.map((c) => ({ value: c.id, label: c.name }))}
              value={selected.id}
              onValueChange={(value) => value && select(value)}
            >
              <SelectTrigger aria-label="Collection" className="lg:hidden">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {collections.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {selected && (
            <CollectionDetail
              key={selected.id}
              collection={selected}
              onDelete={() => setDeleting(selected)}
            />
          )}
        </div>
      )}

      <CreateCollectionDialog
        existing={collections.map((c) => c.name)}
        open={!!search.new}
        onOpenChange={setCreateOpen}
        onCreated={(c) =>
          navigate({ search: { id: c.id }, replace: true, resetScroll: false })
        }
      />

      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The collection goes away. The series in it stay in your library.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="secondary" />}>
              Keep it
            </AlertDialogClose>
            <AlertDialogClose
              render={<Button variant="destructive" />}
              onClick={async () => {
                if (!deleting) return
                try {
                  await deleteCollection(deleting.id)
                  await queryClient.invalidateQueries({
                    queryKey: ['collections'],
                  })
                  navigate({ search: {}, replace: true, resetScroll: false })
                  toast.success(`“${deleting.name}” is deleted.`)
                } catch (err) {
                  toast.error("The collection wasn't deleted.", {
                    description: err instanceof Error ? err.message : undefined,
                  })
                }
              }}
            >
              Delete collection
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Page>
  )
}

function CollectionDetail({
  collection,
  onDelete,
}: {
  collection: Collection
  onDelete: () => void
}) {
  const { data, isPending } = useQuery({
    queryKey: ['collection', collection.id],
    queryFn: () => fetchCollection(collection.id),
  })
  const items = data?.items ?? []

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['collection', collection.id],
      }),
      queryClient.invalidateQueries({ queryKey: ['collections'] }),
    ])

  const remove = async (item: CollectionItem) => {
    try {
      await removeFromCollection(collection.id, item.series_id)
      await refresh()
      toast(`${item.series_name} is out of “${collection.name}”.`, {
        action: {
          label: 'Undo',
          onClick: async () => {
            await addToCollection(collection.id, item.series_id)
            await refresh()
          },
        },
      })
    } catch (err) {
      toast.error(`${item.series_name} wasn't removed.`, {
        description: err instanceof Error ? err.message : undefined,
      })
    }
  }

  return (
    <section
      aria-labelledby="collection-title"
      className="flex min-w-0 flex-col gap-6"
    >
      <div className="flex items-end justify-between gap-4">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <Heading level={3} as="h2" id="collection-title" className="truncate">
            {collection.name}
          </Heading>
          <span className="font-mono text-[12px] text-muted-foreground tabular-nums">
            {pad2(collection.item_count)}
          </span>
        </div>
        <Menu>
          <MenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Actions for ${collection.name}`}
              />
            }
          >
            <EllipsisIcon />
          </MenuTrigger>
          <MenuContent align="end">
            <MenuItem variant="destructive" onClick={onDelete}>
              <Trash2Icon />
              Delete collection
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>

      {isPending ? (
        <div className={POSTER_GRID} aria-busy="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <PosterSkeleton key={i} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Empty>
          <EmptyMedia>
            <LayersIcon />
          </EmptyMedia>
          <EmptyTitle render={<h3 />}>
            Nothing in “{collection.name}” yet
          </EmptyTitle>
          <EmptyDescription>
            Open a series and choose “Add to collection” to put it here.
          </EmptyDescription>
        </Empty>
      ) : (
        <ul className={POSTER_GRID}>
          {items.map((item) => (
            <li key={item.series_id} className="group/item relative">
              <Link
                to="/series/$seriesId"
                params={{ seriesId: item.series_id }}
                className="group/poster block focus-ring"
              >
                <Cover
                  src={item.cover_url ?? getSeriesThumbnailUrl(item.series_id)}
                  fallback={item.series_name}
                  imgClassName="group-hover/poster:scale-[1.03]"
                />
                <p className="mt-3 truncate text-[15px] leading-snug text-foreground">
                  {item.series_name}
                </p>
                <p className="mt-0.5 font-mono text-[12px] text-muted-foreground tabular-nums">
                  {countLabel(item.book_count, 'book')}
                </p>
              </Link>
              <Button
                variant="secondary"
                size="icon-sm"
                aria-label={`Remove ${item.series_name} from ${collection.name}`}
                onClick={() => remove(item)}
                className={cn(
                  'absolute top-2 right-2 transition-opacity duration-(--duration)',
                  '[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within/item:opacity-100 [@media(hover:hover)]:group-hover/item:opacity-100',
                )}
              >
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function CreateCollectionDialog({
  existing,
  open,
  onOpenChange,
  onCreated,
}: {
  /** Names already taken: each of a reader's collections has its own. */
  existing: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (collection: Collection) => void
}) {
  const [pending, setPending] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const submit = async (values: Record<string, unknown>) => {
    if (pending) return
    const name = String(values.name ?? '').trim()
    if (existing.some((n) => n.toLowerCase() === name.toLowerCase())) {
      setErrors({ name: `You already have a collection called “${name}”.` })
      return
    }
    setPending(true)
    setErrors({})
    try {
      const created = await createCollection(name)
      await queryClient.invalidateQueries({ queryKey: ['collections'] })
      onCreated(created)
      toast.success(`“${created.name}” is ready.`, {
        description: 'Add series to it from their pages.',
      })
    } catch (err) {
      setErrors({
        name: `The collection wasn't created. ${err instanceof Error ? err.message : ''}`.trim(),
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>New collection</DialogTitle>
          <DialogDescription>
            A shelf of your own. Only you see your collections.
          </DialogDescription>
        </DialogHeader>
        <Form errors={errors} onFormSubmit={submit} className="contents">
          <DialogBody>
            <Field name="name">
              <FieldLabel>Name</FieldLabel>
              <Input required maxLength={80} autoComplete="off" autoFocus />
              <FieldError match="valueMissing">
                Give the collection a name.
              </FieldError>
              {errors.name && <FieldError match>{errors.name}</FieldError>}
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="submit" aria-busy={pending} className="relative">
              <span className={pending ? 'invisible' : undefined}>
                Create collection
              </span>
              {pending && (
                <Spinner label="Creating the collection" className="absolute" />
              )}
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
