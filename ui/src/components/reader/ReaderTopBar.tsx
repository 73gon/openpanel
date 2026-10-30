import { Link } from '@tanstack/react-router'
import {
  Badge,
  BadgeAnchor,
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuGroup,
  MenuGroupLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
  Toolbar,
  ToolbarButton,
  ToolbarSeparator,
} from '@zonsh/ui'
import {
  ArrowLeftIcon,
  ArrowLeftRightIcon,
  BookmarkIcon,
  Columns2Icon,
  GalleryVerticalEndIcon,
  ListOrderedIcon,
  MaximizeIcon,
  Maximize2Icon,
  Minimize2Icon,
  RectangleVerticalIcon,
  SlidersHorizontalIcon,
  StretchHorizontalIcon,
  StretchVerticalIcon,
  SunMediumIcon,
} from 'lucide-react'
import type { BookDetail } from '@/lib/api'
import type { FitMode, ReadDirection, ReadMode } from '@/lib/reader-store'
import { displaySeriesName } from '@/lib/anilist'
import { stripTitleZeros } from '@/lib/utils'

interface ReaderTopBarProps {
  book: BookDetail
  currentPage: number
  bookmarkCount: number
  pageBookmarked: boolean
  bookmarksOpen: boolean
  hasChapters: boolean
  tocOpen: boolean
  readMode: ReadMode
  fitMode: FitMode
  direction: ReadDirection
  onBookmarks: () => void
  onToc: () => void
  onReadMode: (mode: ReadMode) => void
  onFitMode: (mode: FitMode) => void
  onDirection: (direction: ReadDirection) => void
  onSettingsOpenChange: (open: boolean) => void
  keepScreenOn: boolean
  onKeepScreenOn: (on: boolean) => void
  fullscreen: boolean
  /** Absent where the browser can't go full screen (iPhone Safari). */
  onFullscreen?: () => void
}

/** Phones keep the screen on through the Screen Wake Lock API, where it exists. */
const canKeepScreenOn =
  typeof navigator !== 'undefined' && 'wakeLock' in navigator

/** Two floating toolbars: where you are on the left, how you read on the right. */
export function ReaderTopBar({
  book,
  currentPage,
  bookmarkCount,
  pageBookmarked,
  bookmarksOpen,
  hasChapters,
  tocOpen,
  readMode,
  fitMode,
  direction,
  onBookmarks,
  onToc,
  onReadMode,
  onFitMode,
  onDirection,
  onSettingsOpenChange,
  keepScreenOn,
  onKeepScreenOn,
  fullscreen,
  onFullscreen,
}: ReaderTopBarProps) {
  return (
    <div className="pointer-events-none flex items-start justify-between gap-3 px-3 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] sm:px-4">
      <Toolbar
        aria-label="Book"
        className="pointer-events-auto max-w-[min(32rem,58vw)] shadow-overlay!"
      >
        <ToolbarButton
          nativeButton={false}
          render={
            <Link
              to="/series/$seriesId"
              params={{ seriesId: book.series_id }}
            />
          }
          aria-label="Back to the series"
        >
          <ArrowLeftIcon />
        </ToolbarButton>
        <div className="min-w-0 pr-2 pl-1">
          <p className="m-0 truncate text-[13px] leading-tight text-foreground">
            {stripTitleZeros(book.title)}
          </p>
          <p className="m-0 truncate font-mono text-[11px] leading-tight text-muted-foreground">
            {displaySeriesName(book.series_name)}
          </p>
        </div>
      </Toolbar>

      <Toolbar
        aria-label="Reader"
        className="pointer-events-auto shrink-0 shadow-overlay!"
      >
        <span
          className="px-2 font-mono text-xs whitespace-nowrap text-foreground-soft tabular-nums"
          aria-label={`Page ${currentPage} of ${book.page_count}`}
        >
          {currentPage}
          <span className="text-muted-foreground"> / {book.page_count}</span>
        </span>
        <ToolbarSeparator />
        <BadgeAnchor>
          <ToolbarButton
            aria-label={
              bookmarkCount
                ? `Bookmarks, ${bookmarkCount}${pageBookmarked ? ', this page is bookmarked' : ''}`
                : 'Bookmarks'
            }
            aria-pressed={bookmarksOpen}
            onClick={onBookmarks}
          >
            <BookmarkIcon
              className={pageBookmarked ? 'fill-current' : undefined}
            />
          </ToolbarButton>
          <Badge
            size="sm"
            count={bookmarkCount}
            variant="secondary"
            aria-hidden
          />
        </BadgeAnchor>
        {hasChapters && (
          <ToolbarButton
            aria-label="Contents"
            aria-pressed={tocOpen}
            onClick={onToc}
          >
            <ListOrderedIcon />
          </ToolbarButton>
        )}
        {onFullscreen && (
          <ToolbarButton
            aria-label={fullscreen ? 'Leave full screen' : 'Full screen'}
            aria-pressed={fullscreen}
            onClick={onFullscreen}
            className="max-sm:hidden"
          >
            {fullscreen ? <Minimize2Icon /> : <Maximize2Icon />}
          </ToolbarButton>
        )}
        <Menu onOpenChange={onSettingsOpenChange}>
          <ToolbarButton render={<MenuTrigger />} aria-label="Reader settings">
            <SlidersHorizontalIcon />
          </ToolbarButton>
          <MenuContent align="end" className="min-w-60">
            <MenuGroup>
              <MenuGroupLabel>Reading mode</MenuGroupLabel>
              <MenuRadioGroup
                value={readMode}
                onValueChange={(value) => onReadMode(value as ReadMode)}
              >
                <MenuRadioItem value="scroll">
                  <GalleryVerticalEndIcon />
                  Scroll
                </MenuRadioItem>
                <MenuRadioItem value="single">
                  <RectangleVerticalIcon />
                  Single page
                </MenuRadioItem>
                <MenuRadioItem value="double">
                  <Columns2Icon />
                  Two pages
                </MenuRadioItem>
              </MenuRadioGroup>
            </MenuGroup>
            <MenuSeparator />
            <MenuGroup>
              <MenuGroupLabel>Page size</MenuGroupLabel>
              <MenuRadioGroup
                value={fitMode}
                onValueChange={(value) => onFitMode(value as FitMode)}
              >
                <MenuRadioItem value="width">
                  <StretchHorizontalIcon />
                  Fit width
                </MenuRadioItem>
                <MenuRadioItem value="height">
                  <StretchVerticalIcon />
                  Fit height
                </MenuRadioItem>
                <MenuRadioItem value="original">
                  <MaximizeIcon />
                  Original size
                </MenuRadioItem>
              </MenuRadioGroup>
            </MenuGroup>
            <MenuSeparator />
            <MenuGroup>
              <MenuGroupLabel>Direction · this series</MenuGroupLabel>
              <MenuRadioGroup
                value={direction}
                onValueChange={(value) => onDirection(value as ReadDirection)}
              >
                <MenuRadioItem value="ltr">
                  <ArrowLeftRightIcon />
                  Left to right
                </MenuRadioItem>
                <MenuRadioItem value="rtl">
                  <ArrowLeftRightIcon className="-scale-x-100" />
                  Right to left
                </MenuRadioItem>
              </MenuRadioGroup>
            </MenuGroup>
            {canKeepScreenOn && (
              <>
                <MenuSeparator />
                <MenuCheckboxItem
                  checked={keepScreenOn}
                  onCheckedChange={onKeepScreenOn}
                >
                  <SunMediumIcon />
                  Keep the screen on
                </MenuCheckboxItem>
              </>
            )}
          </MenuContent>
        </Menu>
      </Toolbar>
    </div>
  )
}
