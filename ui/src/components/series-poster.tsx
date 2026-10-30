import { memo } from 'react'
import { Link } from '@tanstack/react-router'
import { Progress, Skeleton } from '@zonsh/ui'
import { CheckIcon } from 'lucide-react'
import { getSeriesThumbnailUrl, type Series } from '@/lib/api'
import { displaySeriesName } from '@/lib/anilist'
import { useSeriesProgress } from '@/lib/progress'
import { countLabel, cn } from '@/lib/utils'
import { Cover } from '@/components/cover'

/** The narrowest a poster gets in a grid, and the gap between posters (px). */
export const POSTER_MIN = 152
export const POSTER_GAP = 16

/**
 * The columns every poster grid uses: as many 9.5rem posters as the column holds (it sits
 * beside a sidebar that collapses, so the container, not the viewport, decides), never fewer
 * than two.
 */
export const POSTER_GRID =
  'grid grid-cols-[repeat(auto-fill,minmax(min(9.5rem,calc(50%_-_0.5rem)),1fr))] gap-x-4 gap-y-8'

/** How many columns POSTER_GRID makes in a column this wide. */
export function posterColumns(width: number): number {
  return Math.max(
    2,
    Math.floor((width + POSTER_GAP) / (POSTER_MIN + POSTER_GAP)),
  )
}

/** A poster's width on a shelf: a peek of the next on a phone, about six to a row on a laptop. */
export const SHELF_TILE = 'w-34 shrink-0 snap-start sm:w-38 lg:w-40'

/** The poster's line under the title: how much of it there is, and when it began. */
export function seriesMeta(series: Series): string {
  const unit = series.book_type === 'volume' ? 'volume' : 'chapter'
  return [countLabel(series.book_count, unit), series.year]
    .filter(Boolean)
    .join(' · ')
}

export const SeriesPoster = memo(function SeriesPoster({
  series,
  className,
}: {
  series: Series
  className?: string
}) {
  const name = displaySeriesName(series.name, series.anilist_id)
  const { data: progress } = useSeriesProgress()
  const mine = progress?.[series.id]
  const total = series.book_count
  const read = Math.min(mine?.read ?? 0, total)
  const finished = total > 0 && read >= total
  const started = !finished && (read > 0 || (mine?.reading ?? 0) > 0)
  const unit = series.book_type === 'volume' ? 'volume' : 'chapter'
  // A book under way counts for a sliver, so a first open shows on the bar.
  const pct = total > 0 ? Math.max(4, Math.round((read / total) * 100)) : 0

  return (
    <Link
      to="/series/$seriesId"
      params={{ seriesId: series.id }}
      className={cn('group/poster block focus-ring', className)}
    >
      <Cover
        src={series.anilist_cover_url ?? getSeriesThumbnailUrl(series.id)}
        fallback={name}
        imgClassName="group-hover/poster:scale-[1.03]"
      >
        {started && (
          <div className="absolute inset-x-2 bottom-2">
            <Progress value={pct} aria-hidden />
          </div>
        )}
        {finished && (
          <span className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-full bg-background/80 text-foreground backdrop-blur-sm">
            <CheckIcon className="size-3.5" aria-hidden />
          </span>
        )}
      </Cover>
      <p className="mt-3 truncate text-[15px] leading-snug text-foreground">
        {name}
      </p>
      <p className="mt-0.5 truncate font-mono text-[12px] text-muted-foreground tabular-nums">
        {finished
          ? `${countLabel(total, unit)} · all read`
          : started
            ? `${read} of ${countLabel(total, unit)} read`
            : seriesMeta(series)}
      </p>
    </Link>
  )
})

export function PosterSkeleton({ className }: { className?: string }) {
  return (
    <div className={className} aria-hidden>
      <Skeleton shape="item" className="aspect-[5/7] w-full rounded-none" />
      <Skeleton shape="text" className="mt-3 w-4/5" />
      <Skeleton shape="text" className="mt-1.5 w-1/2" />
    </div>
  )
}
