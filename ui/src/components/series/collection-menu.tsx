import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Menu,
  MenuContent,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  toast,
} from '@zonsh/ui'
import { FolderPlusIcon, LayersIcon, PlusIcon } from 'lucide-react'
import { addToCollection, fetchCollections } from '@/lib/api'

/** "Add to collection": the reader's collections in a menu, and a way to make a new one. */
export function CollectionMenu({
  seriesId,
  seriesName,
}: {
  seriesId: string
  seriesName: string
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const { data: collections, isPending } = useQuery({
    queryKey: ['collections'],
    queryFn: fetchCollections,
    enabled: open,
  })

  const add = async (collectionId: string, name: string) => {
    try {
      await addToCollection(collectionId, seriesId)
      queryClient.invalidateQueries({ queryKey: ['collections'] })
      toast.success(`Added to ${name}.`, { description: seriesName })
    } catch (err) {
      toast.error(`${seriesName} wasn't added to ${name}.`, {
        description: err instanceof Error ? err.message : undefined,
      })
    }
  }

  return (
    <Menu open={open} onOpenChange={setOpen}>
      <MenuTrigger render={<Button variant="secondary" size="lg" />}>
        <PlusIcon />
        Add to collection
      </MenuTrigger>
      <MenuContent align="start" className="min-w-60">
        <MenuGroup>
          <MenuGroupLabel>Collections</MenuGroupLabel>
          {isPending ? (
            <MenuItem disabled>Loading…</MenuItem>
          ) : collections?.length ? (
            collections.map((c) => (
              <MenuItem key={c.id} onClick={() => add(c.id, c.name)}>
                <LayersIcon />
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  {c.item_count}
                </span>
              </MenuItem>
            ))
          ) : (
            <MenuItem disabled>No collections yet</MenuItem>
          )}
        </MenuGroup>
        <MenuSeparator />
        <MenuItem
          onClick={() =>
            navigate({ to: '/collections', search: { new: true } })
          }
        >
          <FolderPlusIcon />
          New collection…
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}
