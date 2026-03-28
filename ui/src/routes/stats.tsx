import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useMemo } from 'react'
import { motion } from 'motion/react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Book02Icon,
  Loading03Icon,
  FireIcon,
  ChartLineData01Icon,
  Tick01Icon,
  ArrowLeft,
} from '@hugeicons/core-free-icons'
import { Link } from '@tanstack/react-router'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  fetchReadingStats,
  type ReadingStats,
  type DailyActivity,
} from '@/lib/api'

export const Route = createFileRoute('/stats')({
  component: StatsPage,
})

function StatCard({
  label,
  value,
  icon,
  delay = 0,
}: {
  label: string
  value: string | number
  icon: typeof Book02Icon
  delay?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
    >
      <Card className="h-full">
        <CardContent className="flex items-center gap-4 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10">
            <HugeiconsIcon icon={icon} size={20} className="text-primary" />
          </div>
          <div>
            <p className="text-2xl font-bold tabular-nums">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

/** Simple bar chart rendered with plain divs */
function ActivityChart({ data }: { data: DailyActivity[] }) {
  const maxPages = useMemo(
    () => Math.max(1, ...data.map((d) => d.pages_read)),
    [data],
  )

  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No activity in the last 30 days
      </p>
    )
  }

  return (
    <div className="flex items-end gap-px" style={{ height: 120 }}>
      {data.map((d, i) => {
        const height = Math.max(2, (d.pages_read / maxPages) * 100)
        return (
          <div
            key={d.date}
            className="group relative flex-1"
            style={{ height: '100%' }}
          >
            <motion.div
              className="absolute bottom-0 w-full rounded-sm bg-primary/70 transition-colors group-hover:bg-primary"
              initial={{ height: 0 }}
              animate={{ height: `${height}%` }}
              transition={{ delay: i * 0.02, duration: 0.3 }}
            />
            {/* Tooltip on hover */}
            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded bg-popover px-2 py-1 text-xs shadow-lg group-hover:block">
              <p className="font-medium tabular-nums">{d.pages_read} pages</p>
              <p className="text-muted-foreground">{d.date}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function StatsPage() {
  const [stats, setStats] = useState<ReadingStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchReadingStats()
      .then(setStats)
      .catch((e) => setError(e?.message || 'Failed to load statistics'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <HugeiconsIcon
          icon={Loading03Icon}
          size={24}
          className="animate-spin text-muted-foreground"
        />
      </div>
    )
  }

  if (error || !stats) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">{error || 'No data'}</p>
        <Link to="/">
          <Button variant="outline" size="sm">
            Go home
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/profiles">
          <Button variant="ghost" size="icon" aria-label="Back to profile">
            <HugeiconsIcon icon={ArrowLeft} size={18} />
          </Button>
        </Link>
        <h1 className="text-xl font-bold">Reading Statistics</h1>
      </div>

      {/* Top-level metrics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {stats.volumes_completed > 0 && (
          <StatCard
            icon={Tick01Icon}
            label="Volumes Completed"
            value={stats.volumes_completed}
            delay={0}
          />
        )}
        {stats.chapters_completed > 0 && (
          <StatCard
            icon={Tick01Icon}
            label="Chapters Completed"
            value={stats.chapters_completed}
            delay={0.05}
          />
        )}
        {stats.volumes_in_progress > 0 && (
          <StatCard
            icon={Book02Icon}
            label="Volumes In Progress"
            value={stats.volumes_in_progress}
            delay={0.1}
          />
        )}
        {stats.chapters_in_progress > 0 && (
          <StatCard
            icon={Book02Icon}
            label="Chapters In Progress"
            value={stats.chapters_in_progress}
            delay={0.1}
          />
        )}
        <StatCard
          icon={ChartLineData01Icon}
          label="Pages Read"
          value={stats.total_pages_read.toLocaleString()}
          delay={0.15}
        />
        <StatCard
          icon={FireIcon}
          label="Series Explored"
          value={stats.total_series_touched}
          delay={0.2}
        />
      </div>

      {/* Streaks */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <HugeiconsIcon
                icon={FireIcon}
                size={18}
                className="text-primary"
              />
              Reading Streaks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-8">
              <div>
                <p className="text-3xl font-bold tabular-nums">
                  {stats.current_streak}
                </p>
                <p className="text-xs text-muted-foreground">
                  Current streak (days)
                </p>
              </div>
              <div>
                <p className="text-3xl font-bold tabular-nums">
                  {stats.longest_streak}
                </p>
                <p className="text-xs text-muted-foreground">
                  Longest streak (days)
                </p>
              </div>
              <div>
                <p className="text-3xl font-bold tabular-nums">
                  {Math.round(stats.completion_rate * 100)}%
                </p>
                <p className="text-xs text-muted-foreground">Completion rate</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* 30-day activity chart */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
      >
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <HugeiconsIcon
                icon={ChartLineData01Icon}
                size={18}
                className="text-primary"
              />
              Last 30 Days
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ActivityChart data={stats.daily_activity} />
            <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
              <span>30 days ago</span>
              <span>Today</span>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Top genres */}
      {stats.top_genres.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Top Genres</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {stats.top_genres.map((g, i) => {
                  const maxCount = stats.top_genres[0]?.count || 1
                  const pct = (g.count / maxCount) * 100
                  return (
                    <div key={g.genre} className="flex items-center gap-3">
                      <span className="w-24 shrink-0 truncate text-sm">
                        {g.genre}
                      </span>
                      <div className="relative h-5 flex-1 overflow-hidden rounded-sm bg-muted">
                        <motion.div
                          className="absolute inset-y-0 left-0 rounded-sm bg-primary/60"
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ delay: 0.3 + i * 0.04, duration: 0.4 }}
                        />
                      </div>
                      <span className="w-8 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                        {g.count}
                      </span>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  )
}
