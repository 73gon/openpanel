import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import {
  Button,
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
  Meter,
  Skeleton,
} from '@zonsh/ui'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@zonsh/ui/chart'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { ChartPieIcon } from 'lucide-react'
import {
  fetchReadingStats,
  type DailyActivity,
  type ReadingStats,
} from '@/lib/api'
import { countLabel } from '@/lib/utils'
import { Page } from '@/components/page'
import { PageHeader, SectionTitle } from '@/components/page-header'
import { ErrorNotice } from '@/components/route-error'

export const Route = createFileRoute('/stats')({
  component: StatsPage,
})

const DAYS = 30

const chartConfig = {
  pages: { label: 'Pages' },
} satisfies ChartConfig

const dayLabel = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})

/** An axis that ends on a round number, with three or four steps of 1, 2, 2.5 or 5 × 10ⁿ. */
function niceScale(max: number) {
  if (max <= 0) return { top: 10, ticks: [0, 5, 10] }
  const raw = max / 4
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw)!
  const top = Math.ceil(max / step) * step
  return {
    top,
    ticks: Array.from(
      { length: Math.round(top / step) + 1 },
      (_, i) => i * step,
    ),
  }
}

/**
 * The last 30 days, one entry per day. The server only lists days with reading on them (in
 * UTC); the days between are zero, so the axis never skips one.
 */
function lastDays(activity: DailyActivity[]) {
  const byDate = new Map(activity.map((d) => [d.date, d]))
  const now = new Date()
  return Array.from({ length: DAYS }, (_, i) => {
    const day = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - (DAYS - 1 - i),
      ),
    )
    const date = day.toISOString().slice(0, 10)
    const found = byDate.get(date)
    return {
      date,
      label: dayLabel.format(day),
      pages: found?.pages_read ?? 0,
      finished: found?.books_completed ?? 0,
    }
  })
}

function StatsPage() {
  const {
    data: stats,
    error,
    isPending,
    refetch,
  } = useQuery({
    queryKey: ['readingStats'],
    queryFn: fetchReadingStats,
  })

  return (
    <Page className="flex flex-col gap-12">
      <PageHeader
        eyebrow="Reading"
        title="Statistics"
        facts="From your reading on this server"
      />
      {isPending ? (
        <StatsSkeleton />
      ) : error || !stats ? (
        <ErrorNotice
          title="Your statistics didn't load"
          error={error}
          onRetry={() => refetch()}
        />
      ) : stats.total_pages_read === 0 && stats.daily_activity.length === 0 ? (
        <Empty>
          <EmptyMedia>
            <ChartPieIcon />
          </EmptyMedia>
          <EmptyTitle render={<h2 />}>Nothing read yet</EmptyTitle>
          <EmptyDescription>
            Open a book and your pages, streaks and genres start adding up here.
          </EmptyDescription>
          <EmptyActions>
            <Button
              variant="secondary"
              nativeButton={false}
              render={<Link to="/" />}
            >
              Go to the library
            </Button>
          </EmptyActions>
        </Empty>
      ) : (
        <Stats stats={stats} />
      )}
    </Page>
  )
}

interface Figure {
  label: string
  value: string
  note?: string
}

function Stats({ stats }: { stats: ReadingStats }) {
  const days = useMemo(
    () => lastDays(stats.daily_activity),
    [stats.daily_activity],
  )
  const pagesThisMonth = days.reduce((sum, d) => sum + d.pages, 0)
  const scale = niceScale(Math.max(...days.map((d) => d.pages)))
  const activeDays = days.filter((d) => d.pages > 0).length

  const figures: Figure[] = [
    {
      label: 'Pages read',
      value: stats.total_pages_read.toLocaleString('en-US'),
    },
    {
      label: 'Current streak',
      value: countLabel(stats.current_streak, 'day'),
      note: 'In a row, up to today',
    },
    { label: 'Longest streak', value: countLabel(stats.longest_streak, 'day') },
    {
      label: 'Finished',
      value: `${Math.round(stats.completion_rate * 100)}%`,
      note: 'Of the books you started',
    },
    ...(stats.volumes_completed > 0
      ? [
          {
            label: 'Volumes finished',
            value: stats.volumes_completed.toLocaleString('en-US'),
          },
        ]
      : []),
    ...(stats.chapters_completed > 0
      ? [
          {
            label: 'Chapters finished',
            value: stats.chapters_completed.toLocaleString('en-US'),
          },
        ]
      : []),
    ...(stats.volumes_in_progress + stats.chapters_in_progress > 0
      ? [
          {
            label: 'In progress',
            value: (
              stats.volumes_in_progress + stats.chapters_in_progress
            ).toLocaleString('en-US'),
            note: [
              stats.volumes_in_progress
                ? countLabel(stats.volumes_in_progress, 'volume')
                : null,
              stats.chapters_in_progress
                ? countLabel(stats.chapters_in_progress, 'chapter')
                : null,
            ]
              .filter(Boolean)
              .join(', '),
          },
        ]
      : []),
    {
      label: 'Series started',
      value: stats.total_series_touched.toLocaleString('en-US'),
    },
  ]

  const best = stats.top_genres[0]?.count ?? 1

  return (
    <>
      <dl className="m-0 grid grid-cols-2 gap-x-6 sm:grid-cols-4">
        {figures.map((figure) => (
          <div
            key={figure.label}
            className="flex min-w-0 flex-col gap-3 border-t border-border/60 pt-4 pb-6"
          >
            <dt className="eyebrow">{figure.label}</dt>
            <dd className="m-0 flex flex-col gap-1.5">
              <span className="font-mono text-2xl leading-none text-foreground tabular-nums">
                {figure.value}
              </span>
              {figure.note && (
                <span className="text-xs text-muted-foreground">
                  {figure.note}
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="activity-title" className="flex flex-col gap-4">
        <SectionTitle
          id="activity-title"
          title="Pages per day"
          context={`Last ${DAYS} days · ${pagesThisMonth.toLocaleString('en-US')} pages on ${countLabel(activeDays, 'day')}`}
        />
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-64"
          aria-label={`Pages read per day over the last ${DAYS} days`}
        >
          <BarChart
            data={days}
            margin={{ top: 8, right: 20, left: 0, bottom: 0 }}
          >
            <CartesianGrid />
            <XAxis dataKey="label" tickMargin={8} minTickGap={24} />
            <YAxis
              width={40}
              tickMargin={4}
              domain={[0, scale.top]}
              ticks={scale.ticks}
              tickFormatter={(v: number) =>
                v >= 1000 ? `${Math.round(v / 100) / 10}K` : String(v)
              }
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  hideIndicator
                  valueFormatter={(value) =>
                    Number(value).toLocaleString('en-US')
                  }
                />
              }
            />
            <Bar
              dataKey="pages"
              fill="var(--color-pages)"
              radius={[3, 3, 0, 0]}
              maxBarSize={24}
            />
          </BarChart>
        </ChartContainer>
        {/* The values as a table, for screen readers. A table ignores overflow, so the
            visually hidden box is a div around it. */}
        <div className="sr-only">
          <table>
            <caption>
              Pages per day, counted from where you left each book on the day
              you last read it.
            </caption>
            <thead>
              <tr>
                <th scope="col">Day</th>
                <th scope="col">Pages</th>
                <th scope="col">Books finished</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.date}>
                  <th scope="row">{d.label}</th>
                  <td>{d.pages}</td>
                  <td>{d.finished}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {stats.top_genres.length > 0 && (
        <section aria-labelledby="genres-title" className="flex flex-col gap-4">
          <SectionTitle
            id="genres-title"
            title="Top genres"
            context="Books finished, by genre"
          />
          <ol className="m-0 grid list-none gap-x-12 gap-y-4 border-t border-border/60 p-0 pt-5 md:grid-cols-2">
            {stats.top_genres.map((g) => (
              <li key={g.genre}>
                <Meter
                  label={g.genre}
                  value={g.count}
                  max={best}
                  showValue
                  format={{ style: 'decimal' }}
                  getAriaValueText={(_, value) => countLabel(value, 'book')}
                />
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  )
}

function StatsSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-12">
      <span className="sr-only">Loading your statistics…</span>
      <div className="grid grid-cols-2 gap-x-6 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-3 border-t border-border/60 pt-4 pb-6"
          >
            <Skeleton shape="text" className="w-24" />
            <Skeleton shape="text" className="h-6 w-20" />
          </div>
        ))}
      </div>
      <Skeleton className="h-64 rounded-none" />
    </div>
  )
}
