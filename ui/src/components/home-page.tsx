import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Link, getRouteApi, useNavigate } from '@tanstack/react-router'
import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
} from '@tanstack/react-query'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
  Eyebrow,
  Heading,
  Progress,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
} from '@zonsh/ui'
import {
  ArrowDownWideNarrowIcon,
  ArrowUpNarrowWideIcon,
  DownloadIcon,
  LibraryBigIcon,
  PlayIcon,
  SearchXIcon,
  SlidersHorizontalIcon,
  WifiOffIcon,
  XIcon,
} from 'lucide-react'
import { type SectionVisibility, defaultSections } from '@/lib/types'
import {
  type ContinueReadingItem,
  type Series,
  fetchAllSeries,
  fetchAvailableGenres,
  fetchContinueReading,
  fetchPreferences,
  fetchRecentlyAdded,
  fetchRecentlyUpdated,
  fetchSeriesMetadata,
  getThumbnailUrl,
} from '@/lib/api'
import { displaySeriesName } from '@/lib/anilist'
import {
  getDownloadedCover,
  getDownloadsBySeries,
  type SeriesDownloadGroup,
} from '@/lib/downloads'
import { queryClient, queryKeys } from '@/lib/query'
import { useAppStore } from '@/lib/store'
import { cn, countLabel, stripTitleZeros } from '@/lib/utils'
import type { LibrarySearch, LibrarySort } from '@/routes/index'
import { Backdrop } from '@/components/backdrop'
import { Cover } from '@/components/cover'
import { Page } from '@/components/page'
import { PageHeader } from '@/components/page-header'
import { PullToRefresh } from '@/components/pull-to-refresh'
import { Shelf } from '@/components/shelf'
import {
  POSTER_GAP,
  POSTER_GRID,
  SHELF_TILE,
  SeriesPoster,
  posterColumns,
} from '@/components/series-poster'

const routeApi = getRouteApi('/')

export const SERIES_PER_PAGE = 36

export function HomePage() {
  const { offline } = routeApi.useLoaderData()
  return offline ? <OfflineHome /> : <OnlineHome />
}

/* ── Online ──────────────────────────────────────────────────────────────── */

function OnlineHome() {
  const { data: continueReading = [] } = useQuery({
    queryKey: queryKeys.continueReading(),
    queryFn: fetchContinueReading,
  })

  const { data: recentlyAdded = [] } = useQuery({
    queryKey: queryKeys.recentlyAdded(12),
    queryFn: () => fetchRecentlyAdded(12),
  })

  const { data: recentlyUpdated = [] } = useQuery({
    queryKey: queryKeys.recentlyUpdated(12),
    queryFn: () => fetchRecentlyUpdated(12),
  })

  const { data: sections = defaultSections } = useQuery({
    queryKey: queryKeys.preferences(),
    queryFn: async () => {
      const prefs = await fetchPreferences()
      if (prefs.homeSections && typeof prefs.homeSections === 'object') {
        return {
          ...defaultSections,
          ...(prefs.homeSections as Partial<SectionVisibility>),
        }
      }
      return defaultSections
    },
    staleTime: 60_000,
  })

  const handleRefresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.continueReading() }),
      queryClient.invalidateQueries({ queryKey: ['recentlyAdded'] }),
      queryClient.invalidateQueries({ queryKey: ['recentlyUpdated'] }),
      queryClient.invalidateQueries({ queryKey: ['allSeries'] }),
      queryClient.invalidateQueries({ queryKey: queryKeys.seriesProgress() }),
    ])
  }, [])

  const [hero, ...alsoReading] = sections.continueReading ? continueReading : []

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="relative">
        {hero && <HeroBackdrop seriesId={hero.series_id} />}
        <Page className="relative flex flex-col gap-14 sm:gap-16">
          <h1 className="sr-only">Library</h1>

          {hero && <ContinueHero item={hero} />}

          {alsoReading.length > 0 && (
            <Shelf title="Also reading" count={alsoReading.length}>
              {alsoReading.map((item) => (
                <ContinueCard key={item.book_id} item={item} />
              ))}
            </Shelf>
          )}

          {sections.recentlyAdded && recentlyAdded.length > 0 && (
            <Shelf title="Recently added" count={recentlyAdded.length}>
              {recentlyAdded.map((series) => (
                <SeriesPoster
                  key={series.id}
                  series={series}
                  className={SHELF_TILE}
                />
              ))}
            </Shelf>
          )}

          {sections.recentlyUpdated && recentlyUpdated.length > 0 && (
            <Shelf title="Recently updated" count={recentlyUpdated.length}>
              {recentlyUpdated.map((series) => (
                <SeriesPoster
                  key={series.id}
                  series={series}
                  className={SHELF_TILE}
                />
              ))}
            </Shelf>
          )}

          <LibrarySection />
        </Page>
      </div>
    </PullToRefresh>
  )
}

/** The banner of the series being read, behind the top of the page, when AniList has one. */
function HeroBackdrop({ seriesId }: { seriesId: string }) {
  const { data: meta } = useQuery({
    queryKey: queryKeys.seriesMetadata(seriesId),
    queryFn: () => fetchSeriesMetadata(seriesId),
    staleTime: 10 * 60_000,
  })
  return <Backdrop src={meta?.banner_url} className="h-[26rem] sm:h-[30rem]" />
}

function readPercent(item: ContinueReadingItem): number {
  return item.total_pages > 0
    ? Math.round((item.page / item.total_pages) * 100)
    : 0
}

/**
 * The book read last: its cover, where the reader stopped, and the one primary action. On a
 * phone the cover sits beside the title and the actions run under both, so the shelves below
 * start on the first screen.
 */
function ContinueHero({ item }: { item: ContinueReadingItem }) {
  const pct = readPercent(item)
  const name = displaySeriesName(item.series_name)
  return (
    <section
      aria-labelledby="continue-title"
      className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-5 gap-y-6 [grid-template-areas:'cover_text'_'actions_actions'] sm:grid-cols-[11rem_minmax(0,1fr)] sm:grid-rows-[1fr_auto] sm:gap-x-10 sm:gap-y-6 sm:[grid-template-areas:'cover_text'_'cover_actions']"
    >
      <Link
        to="/read/$bookId"
        params={{ bookId: item.book_id }}
        tabIndex={-1}
        aria-hidden
        className="group/poster block self-end [grid-area:cover]"
      >
        <Cover
          src={item.cover_url ?? getThumbnailUrl(item.book_id)}
          loading="eager"
          imgClassName="group-hover/poster:scale-[1.03]"
        />
      </Link>
      <div className="flex min-w-0 flex-col gap-3 self-end [grid-area:text] sm:gap-4">
        <Eyebrow>Continue reading</Eyebrow>
        <Heading
          level={2}
          id="continue-title"
          className="max-sm:line-clamp-3 max-sm:text-[26px]"
        >
          {name}
        </Heading>
        <p className="m-0 font-mono text-[12px] tracking-wide text-foreground-soft uppercase tabular-nums">
          {stripTitleZeros(item.book_title)} · Page {item.page} of{' '}
          {item.total_pages}
        </p>
        <Progress
          value={pct}
          aria-label={`${pct}% of ${stripTitleZeros(item.book_title)} read`}
          className="max-w-xs"
        />
      </div>
      <div className="flex gap-3 [grid-area:actions] max-sm:[&>*:first-child]:flex-1">
        <Button
          size="lg"
          nativeButton={false}
          render={<Link to="/read/$bookId" params={{ bookId: item.book_id }} />}
        >
          <PlayIcon />
          Continue reading
        </Button>
        <Button
          variant="secondary"
          size="lg"
          nativeButton={false}
          render={
            <Link
              to="/series/$seriesId"
              params={{ seriesId: item.series_id }}
            />
          }
        >
          Series<span className="max-sm:hidden"> details</span>
        </Button>
      </div>
    </section>
  )
}

const ContinueCard = memo(function ContinueCard({
  item,
}: {
  item: ContinueReadingItem
}) {
  const pct = readPercent(item)
  return (
    <Link
      to="/read/$bookId"
      params={{ bookId: item.book_id }}
      className={cn('group/poster block focus-ring', SHELF_TILE)}
    >
      <Cover
        src={getThumbnailUrl(item.book_id)}
        imgClassName="group-hover/poster:scale-[1.03]"
      >
        {pct > 0 && (
          <div className="absolute inset-x-2 bottom-2">
            <Progress value={pct} aria-label={`${pct}% read`} />
          </div>
        )}
      </Cover>
      <p className="mt-3 truncate text-[15px] leading-snug text-foreground">
        {displaySeriesName(item.series_name)}
      </p>
      <p className="mt-0.5 truncate font-mono text-[12px] text-muted-foreground tabular-nums">
        {stripTitleZeros(item.book_title)} · {item.page}/{item.total_pages}
      </p>
    </Link>
  )
})

/* ── The whole library ───────────────────────────────────────────────────── */

const SORT_ITEMS: { value: LibrarySort; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'year', label: 'Year' },
  { value: 'score', label: 'Score' },
  { value: 'recently_added', label: 'Recently added' },
]

const STATUS_ITEMS = [
  { value: 'all', label: 'Any status' },
  { value: 'RELEASING', label: 'Releasing' },
  { value: 'FINISHED', label: 'Finished' },
  { value: 'HIATUS', label: 'Hiatus' },
  { value: 'NOT_YET_RELEASED', label: 'Not yet released' },
  { value: 'CANCELLED', label: 'Cancelled' },
]

function LibrarySection() {
  const { series: firstPage, total: firstTotal } = routeApi.useLoaderData()
  const search = routeApi.useSearch()
  const navigate = useNavigate({ from: '/' })
  const isAdmin = useAppStore((s) => s.user?.is_admin) ?? false

  const sort = search.sort ?? 'name'
  const dir = search.dir ?? 'asc'
  const filtered = !!(
    search.sort ||
    search.dir ||
    search.genre ||
    search.status
  )

  const setSearch = (patch: Partial<LibrarySearch>) =>
    navigate({
      search: (prev: LibrarySearch) => ({ ...prev, ...patch }),
      replace: true,
      resetScroll: false,
    })

  const { data: genres = [] } = useQuery({
    queryKey: queryKeys.genres(),
    queryFn: fetchAvailableGenres,
    staleTime: 5 * 60_000,
  })

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isPlaceholderData,
  } = useInfiniteQuery({
    queryKey: queryKeys.allSeries({
      sort,
      dir,
      genre: search.genre ?? '',
      status: search.status ?? '',
    }),
    queryFn: ({ pageParam }) =>
      fetchAllSeries({
        page: pageParam,
        perPage: SERIES_PER_PAGE,
        ...(sort !== 'name' ? { sort } : {}),
        sortDir: dir,
        genre: search.genre,
        status: search.status,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, _allPages, lastPageParam) =>
      lastPage.series.length < SERIES_PER_PAGE ? undefined : lastPageParam + 1,
    initialData:
      !filtered && firstPage.length > 0
        ? {
            pages: [{ series: firstPage, total: firstTotal }],
            pageParams: [1],
          }
        : undefined,
    placeholderData: keepPreviousData,
  })

  const series = data?.pages.flatMap((p) => p.series) ?? []
  const total = data?.pages[0]?.total ?? series.length

  // Load the next page a screen before the end is reached.
  const sentinel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = sentinel.current
    if (!el || !hasNextPage || isFetchingNextPage) return
    const io = new IntersectionObserver(
      ([entry]) => entry.isIntersecting && fetchNextPage(),
      { rootMargin: '100% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const genreItems = [
    { value: 'all', label: 'Any genre' },
    ...genres.map((g) => ({ value: g, label: g })),
  ]

  return (
    <section
      aria-labelledby="library-title"
      className="flex flex-col gap-8 border-t border-border/60 pt-8"
    >
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="flex items-baseline gap-2.5">
          <Heading level={3} as="h2" id="library-title">
            All series
          </Heading>
          <span className="font-mono text-[12px] text-muted-foreground tabular-nums">
            {total.toLocaleString('en-US')}
          </span>
        </div>

        <div className="flex items-center gap-2 max-sm:hidden">
          <LibraryControls
            sort={sort}
            dir={dir}
            genre={search.genre}
            status={search.status}
            genreItems={genreItems}
            onChange={setSearch}
          />
          {filtered && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                navigate({ search: {}, replace: true, resetScroll: false })
              }
            >
              <XIcon />
              Clear
            </Button>
          )}
        </div>
        <FilterSheet
          activeCount={
            (search.sort ? 1 : 0) +
            (search.dir ? 1 : 0) +
            (search.genre ? 1 : 0) +
            (search.status ? 1 : 0)
          }
          onClear={() =>
            navigate({ search: {}, replace: true, resetScroll: false })
          }
        >
          <LibraryControls
            sort={sort}
            dir={dir}
            genre={search.genre}
            status={search.status}
            genreItems={genreItems}
            onChange={setSearch}
            stacked
          />
        </FilterSheet>
      </div>

      {series.length > 0 ? (
        <div
          className={cn(
            'transition-opacity duration-(--duration) ease-(--ease)',
            isPlaceholderData && 'opacity-50',
          )}
        >
          <SeriesGrid series={series} />
          <div ref={sentinel} aria-hidden />
          {isFetchingNextPage && (
            <div className="flex justify-center pt-4 text-muted-foreground">
              <Spinner label="Loading more series" />
            </div>
          )}
        </div>
      ) : filtered ? (
        <Empty>
          <EmptyMedia>
            <SearchXIcon />
          </EmptyMedia>
          <EmptyTitle render={<h3 />}>No series match these filters</EmptyTitle>
          <EmptyDescription>
            Try another genre or status, or clear the filters to see everything.
          </EmptyDescription>
          <EmptyActions>
            <Button
              variant="secondary"
              onClick={() =>
                navigate({ search: {}, replace: true, resetScroll: false })
              }
            >
              Clear filters
            </Button>
          </EmptyActions>
        </Empty>
      ) : (
        <Empty>
          <EmptyMedia>
            <LibraryBigIcon />
          </EmptyMedia>
          <EmptyTitle render={<h3 />}>Your library is empty</EmptyTitle>
          <EmptyDescription>
            {isAdmin
              ? 'Add a folder of CBZ files as a library and scan it. Each subfolder becomes a series.'
              : 'Ask your administrator to add a library. Series appear here once it has been scanned.'}
          </EmptyDescription>
          {isAdmin && (
            <EmptyActions>
              <Button
                nativeButton={false}
                render={<Link to="/admin" search={{ tab: 'libraries' }} />}
              >
                Add a library
              </Button>
            </EmptyActions>
          )}
        </Empty>
      )}
    </section>
  )
}

/** Sort, order, genre and status: a row of controls, or a column of fields in the sheet. */
function LibraryControls({
  sort,
  dir,
  genre,
  status,
  genreItems,
  onChange,
  stacked,
}: {
  sort: LibrarySort
  dir: 'asc' | 'desc'
  genre?: string
  status?: string
  genreItems: { value: string; label: string }[]
  onChange: (patch: Partial<LibrarySearch>) => void
  stacked?: boolean
}) {
  const field = (label: string, control: ReactNode) =>
    stacked ? (
      <div className="flex flex-col gap-2">
        <span className="eyebrow">{label}</span>
        {control}
      </div>
    ) : (
      control
    )
  const width = stacked ? 'w-full' : 'w-40'

  return (
    <div className={cn(stacked ? 'flex flex-col gap-5' : 'contents')}>
      {field(
        'Sort by',
        <div className="flex items-center gap-2">
          <Select
            items={SORT_ITEMS}
            value={sort}
            onValueChange={(value) => {
              const next = value as LibrarySort
              onChange({ sort: next === 'name' ? undefined : next })
            }}
          >
            <SelectTrigger
              size={stacked ? 'default' : 'sm'}
              aria-label="Sort by"
              className={cn(width, stacked && 'flex-1')}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="secondary"
            size={stacked ? 'icon' : 'icon-sm'}
            aria-label={
              dir === 'asc'
                ? 'Ascending order. Switch to descending'
                : 'Descending order. Switch to ascending'
            }
            onClick={() => onChange({ dir: dir === 'asc' ? 'desc' : undefined })}
          >
            {dir === 'asc' ? (
              <ArrowUpNarrowWideIcon />
            ) : (
              <ArrowDownWideNarrowIcon />
            )}
          </Button>
        </div>,
      )}
      {field(
        'Genre',
        <Select
          items={genreItems}
          value={genre ?? 'all'}
          onValueChange={(value) =>
            onChange({
              genre: value === 'all' ? undefined : (value as string),
            })
          }
        >
          <SelectTrigger
            size={stacked ? 'default' : 'sm'}
            aria-label="Genre"
            className={width}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {genreItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>,
      )}
      {field(
        'Status',
        <Select
          items={STATUS_ITEMS}
          value={status ?? 'all'}
          onValueChange={(value) =>
            onChange({
              status: value === 'all' ? undefined : (value as string),
            })
          }
        >
          <SelectTrigger
            size={stacked ? 'default' : 'sm'}
            aria-label="Status"
            className={width}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_ITEMS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>,
      )}
    </div>
  )
}

/** On a phone: one button, with how many filters are on, opening the controls in a sheet. */
function FilterSheet({
  activeCount,
  onClear,
  children,
}: {
  activeCount: number
  onClear: () => void
  children: ReactNode
}) {
  return (
    <Drawer side="bottom">
      <DrawerTrigger
        render={<Button variant="secondary" size="sm" className="sm:hidden" />}
      >
        <SlidersHorizontalIcon />
        Sort and filter
        {activeCount > 0 && (
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            {activeCount}
          </span>
        )}
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Sort and filter</DrawerTitle>
          <DrawerDescription>
            Changes apply as you choose them.
          </DrawerDescription>
        </DrawerHeader>
        <div className="pb-2">{children}</div>
        <DrawerFooter>
          {activeCount > 0 && (
            <Button variant="secondary" onClick={onClear}>
              Clear filters
            </Button>
          )}
          <DrawerClose render={<Button />}>Show series</DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

/**
 * The library's posters, rendered a row at a time as they near the screen: large libraries
 * keep a small page. Columns follow the column's width, like POSTER_GRID.
 */
function SeriesGrid({ series }: { series: Series[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [scrollMargin, setScrollMargin] = useState(0)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      setWidth(el.clientWidth)
      setScrollMargin(el.getBoundingClientRect().top + window.scrollY)
    }
    measure()
    // The grid moves when what is above it (the shelves) arrives or changes.
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    ro.observe(document.body)
    return () => ro.disconnect()
  }, [])

  const cols = width ? posterColumns(width) : 2
  const posterWidth = width ? (width - (cols - 1) * POSTER_GAP) / cols : 160
  // Cover (5:7 plus its edge), the two lines under it and the row gap.
  const rowEstimate = Math.round(posterWidth * 1.4 + 2 + 12 + 21 + 20 + 32)

  const virtualizer = useWindowVirtualizer({
    count: Math.ceil(series.length / cols),
    estimateSize: () => rowEstimate,
    overscan: 3,
    scrollMargin,
  })

  useEffect(() => {
    virtualizer.measure()
  }, [cols, virtualizer])

  return (
    <div
      ref={ref}
      className="relative"
      style={{ height: virtualizer.getTotalSize() }}
    >
      {virtualizer.getVirtualItems().map((row) => (
        <div
          key={row.key}
          data-index={row.index}
          ref={virtualizer.measureElement}
          className="absolute inset-x-0 top-0 grid gap-x-4 pb-8"
          style={{
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            transform: `translateY(${row.start - virtualizer.options.scrollMargin}px)`,
          }}
        >
          {series.slice(row.index * cols, (row.index + 1) * cols).map((s) => (
            <SeriesPoster key={s.id} series={s} />
          ))}
        </div>
      ))}
    </div>
  )
}

/* ── Offline ─────────────────────────────────────────────────────────────── */

function OfflineHome() {
  const [groups, setGroups] = useState<SeriesDownloadGroup[] | null>(null)
  const [covers, setCovers] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    getDownloadsBySeries().then(async (found) => {
      if (cancelled) return
      setGroups(found)
      const urls: Record<string, string> = {}
      for (const g of found) {
        const url = await getDownloadedCover(
          `/api/series/${g.seriesId}/thumbnail`,
        )
        if (url) urls[g.seriesId] = url
      }
      if (!cancelled) setCovers(urls)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Page className="flex flex-col gap-10">
      <PageHeader
        eyebrow="Offline"
        title="Your downloads"
        facts={
          groups ? countLabel(groups.length, 'series', 'series') : undefined
        }
      />
      <Alert>
        <WifiOffIcon />
        <AlertTitle>You're offline</AlertTitle>
        <AlertDescription>
          These are the series you downloaded. The rest of your library comes
          back with the connection.
        </AlertDescription>
      </Alert>

      {groups && groups.length === 0 ? (
        <Empty>
          <EmptyMedia>
            <DownloadIcon />
          </EmptyMedia>
          <EmptyTitle render={<h2 />}>Nothing downloaded yet</EmptyTitle>
          <EmptyDescription>
            Download volumes or chapters from a series page while you're online
            to read them here.
          </EmptyDescription>
        </Empty>
      ) : (
        <ul className={POSTER_GRID}>
          {groups?.map((group) => (
            <li key={group.seriesId}>
              <Link to="/downloads" className="group/poster block focus-ring">
                <Cover
                  src={covers[group.seriesId]}
                  fallback={group.seriesName}
                  imgClassName="group-hover/poster:scale-[1.03]"
                />
                <p className="mt-3 truncate text-[15px] leading-snug">
                  {group.seriesName}
                </p>
                <p className="mt-0.5 font-mono text-[12px] text-muted-foreground tabular-nums">
                  {countLabel(group.completedBooks, 'book')} downloaded
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Page>
  )
}
