import { createFileRoute, useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Skeleton } from '@zonsh/ui'
import { RouteErrorComponent } from '@/components/route-error'
import { Page } from '@/components/page'
import { PageHeader } from '@/components/page-header'
import {
  POSTER_GRID,
  PosterSkeleton,
  SeriesPoster,
} from '@/components/series-poster'
import { fetchGroup } from '@/lib/api'
import { displaySeriesName } from '@/lib/anilist'
import { queryClient, queryKeys } from '@/lib/query'
import { countLabel } from '@/lib/utils'

/**
 * A story group: a folder holding the folders of a story's parts, such as JoJo's Bizarre
 * Adventure's eight. Its parts in order, by the year each began.
 */
export const Route = createFileRoute('/groups/$groupId')({
  loader: ({ params }) =>
    queryClient.ensureQueryData({
      queryKey: queryKeys.group(params.groupId),
      queryFn: () => fetchGroup(params.groupId),
    }),
  pendingComponent: GroupSkeleton,
  errorComponent: RouteErrorComponent,
  component: GroupPage,
})

function GroupPage() {
  const { groupId } = useParams({ from: '/groups/$groupId' })
  const { data: group } = useQuery({
    queryKey: queryKeys.group(groupId),
    queryFn: () => fetchGroup(groupId),
  })
  if (!group) return <GroupSkeleton />
  const books = group.parts.reduce((sum, part) => sum + part.book_count, 0)
  const unit = group.parts.every((part) => part.book_type === 'volume')
    ? 'volume'
    : 'book'

  return (
    <Page>
      <PageHeader
        eyebrow="Story"
        title={displaySeriesName(group.name)}
        facts={`${countLabel(group.parts.length, 'part')} · ${countLabel(books, unit)}`}
      />
      <ol className={`${POSTER_GRID} mt-8 list-none p-0`}>
        {group.parts.map((part, i) => (
          <li key={part.id} className="flex flex-col gap-2">
            <span className="font-mono text-[12px] text-muted-foreground tabular-nums">
              Part {i + 1}
            </span>
            <SeriesPoster series={part} />
          </li>
        ))}
      </ol>
    </Page>
  )
}

function GroupSkeleton() {
  return (
    <Page aria-busy="true">
      <span className="sr-only">Loading the story…</span>
      <Skeleton shape="text" className="mb-6 h-6 w-56" />
      <div className={POSTER_GRID}>
        {Array.from({ length: 4 }).map((_, i) => (
          <PosterSkeleton key={i} />
        ))}
      </div>
    </Page>
  )
}
