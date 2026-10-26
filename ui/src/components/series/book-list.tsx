import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import {
  Checkbox,
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
  Progress,
} from '@zonsh/ui'
import { CheckIcon } from 'lucide-react'
import {
  getPageUrl,
  getThumbnailUrl,
  type Book,
  type ReadingProgress,
  type SeriesChapter,
} from '@/lib/api'
import { cn, countLabel, pad2, stripTitleZeros } from '@/lib/utils'
import { Cover } from '@/components/cover'
import { POSTER_GRID } from '@/components/series-poster'

/** Where a reader stands in one book. */
function readingState(book: Book, prog: ReadingProgress | undefined) {
  const completed = !!prog?.is_completed
  const pct =
    prog && book.page_count > 0
      ? Math.round((prog.page / book.page_count) * 100)
      : 0
  const started = !completed && !!prog && prog.page > 1
  return { completed, started, pct, page: prog?.page ?? 0 }
}

function ReadMark() {
  return (
    <span className="flex items-center gap-1.5 font-mono text-[12px] text-muted-foreground">
      <CheckIcon className="size-3.5" aria-hidden />
      Read
    </span>
  )
}

interface BookListProps {
  books: Book[]
  progress: Record<string, ReadingProgress>
  view: 'list' | 'grid'
  selecting: boolean
  selected: Set<string>
  onSelectChange: (bookId: string, selected: boolean) => void
  /** The download control for a book, when downloads are available. */
  renderDownload?: (book: Book) => ReactNode
}

/** The volumes or chapter files of a series, as hairline rows or a grid of covers. */
export function BookList(props: BookListProps) {
  const { books, view } = props
  if (view === 'grid') {
    return (
      <ul className={POSTER_GRID}>
        {books.map((book) => (
          <li key={book.id}>
            <BookCard book={book} {...props} />
          </li>
        ))}
      </ul>
    )
  }
  return (
    <ol className="m-0 flex list-none flex-col border-y border-border/60 p-0">
      {books.map((book, i) => (
        <li
          key={book.id}
          className={cn(
            'flex items-center gap-2 py-1.5',
            i > 0 && 'border-t border-border/60',
          )}
        >
          <BookRow book={book} {...props} />
        </li>
      ))}
    </ol>
  )
}

function BookRow({
  book,
  progress,
  selecting,
  selected,
  onSelectChange,
  renderDownload,
}: BookListProps & { book: Book }) {
  const state = readingState(book, progress[book.id])
  const title = stripTitleZeros(book.title)

  const body = (
    <>
      <span className="hidden w-8 shrink-0 text-center font-mono text-[13px] text-muted-foreground tabular-nums sm:block">
        {pad2(book.sort_order)}
      </span>
      <Cover src={getThumbnailUrl(book.id)} className="w-11 shrink-0" />
      <ItemContent className="min-w-0">
        <ItemTitle
          className={cn(
            'truncate text-[15px] font-normal',
            state.completed && 'text-foreground-soft',
          )}
        >
          {title}
        </ItemTitle>
        <ItemDescription className="font-mono text-[12px] tabular-nums">
          {state.started
            ? `Page ${state.page} of ${book.page_count}`
            : countLabel(book.page_count, 'page')}
        </ItemDescription>
        {state.started && (
          <Progress
            value={state.pct}
            aria-label={`${state.pct}% of ${title} read`}
            className="mt-1.5 max-w-48"
          />
        )}
      </ItemContent>
      {state.completed && (
        <ItemActions>
          <ReadMark />
        </ItemActions>
      )}
    </>
  )

  if (selecting) {
    return (
      <Item
        render={<label />}
        className="min-w-0 flex-1 cursor-pointer gap-4 px-2 sm:gap-5"
      >
        <Checkbox
          checked={selected.has(book.id)}
          onCheckedChange={(checked) => onSelectChange(book.id, checked)}
          aria-label={`Select ${title}`}
        />
        {body}
      </Item>
    )
  }

  return (
    <>
      <Item
        render={<Link to="/read/$bookId" params={{ bookId: book.id }} />}
        className="min-w-0 flex-1 gap-4 px-2 sm:gap-5"
      >
        {body}
      </Item>
      {renderDownload?.(book)}
    </>
  )
}

function BookCard({
  book,
  progress,
  selecting,
  selected,
  onSelectChange,
  renderDownload,
}: BookListProps & { book: Book }) {
  const state = readingState(book, progress[book.id])
  const title = stripTitleZeros(book.title)

  const art = (
    <Cover
      src={getThumbnailUrl(book.id)}
      imgClassName={selecting ? undefined : 'group-hover/poster:scale-[1.03]'}
    >
      {state.started && (
        <div className="absolute inset-x-2 bottom-2">
          <Progress value={state.pct} aria-label={`${state.pct}% read`} />
        </div>
      )}
    </Cover>
  )
  const caption = (
    <>
      <p
        className={cn(
          'mt-3 truncate text-[15px] leading-snug',
          state.completed ? 'text-foreground-soft' : 'text-foreground',
        )}
      >
        {title}
      </p>
      <p className="mt-0.5 flex items-center gap-2 font-mono text-[12px] text-muted-foreground tabular-nums">
        {countLabel(book.page_count, 'page')}
        {state.completed && (
          <>
            <span aria-hidden>·</span>
            <ReadMark />
          </>
        )}
      </p>
    </>
  )

  if (selecting) {
    return (
      <label className="relative block cursor-pointer">
        {art}
        <span className="absolute top-2 left-2 flex rounded-checkbox bg-background/80 p-1 backdrop-blur-sm">
          <Checkbox
            checked={selected.has(book.id)}
            onCheckedChange={(checked) => onSelectChange(book.id, checked)}
            aria-label={`Select ${title}`}
          />
        </span>
        {caption}
      </label>
    )
  }

  return (
    <div className="relative">
      <Link
        to="/read/$bookId"
        params={{ bookId: book.id }}
        className="group/poster block focus-ring"
      >
        {art}
        {caption}
      </Link>
      {renderDownload && (
        <div className="absolute top-2 right-2 rounded-full bg-background/80 backdrop-blur-sm">
          {renderDownload(book)}
        </div>
      )}
    </div>
  )
}

/** Chapters found inside the volumes: each opens the reader at its first page. */
export function ChapterList({
  chapters,
  view,
}: {
  chapters: SeriesChapter[]
  view: 'list' | 'grid'
}) {
  if (view === 'grid') {
    return (
      <ul className={POSTER_GRID}>
        {chapters.map((ch) => (
          <li key={`${ch.book_id}-${ch.chapter_number}`}>
            <Link
              to="/read/$bookId"
              params={{ bookId: ch.book_id }}
              search={{ page: ch.start_page + 1 }}
              className="group/poster block focus-ring"
            >
              <Cover
                src={getPageUrl(ch.book_id, ch.start_page + 1)}
                imgClassName="group-hover/poster:scale-[1.03]"
              />
              <p className="mt-3 truncate text-[15px] leading-snug text-foreground">
                {stripTitleZeros(ch.title)}
              </p>
              <p className="mt-0.5 font-mono text-[12px] text-muted-foreground tabular-nums">
                {countLabel(ch.end_page - ch.start_page + 1, 'page')}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    )
  }
  return (
    <ol className="m-0 flex list-none flex-col border-y border-border/60 p-0">
      {chapters.map((ch, i) => (
        <li
          key={`${ch.book_id}-${ch.chapter_number}`}
          className={cn('py-1.5', i > 0 && 'border-t border-border/60')}
        >
          <Item
            render={
              <Link
                to="/read/$bookId"
                params={{ bookId: ch.book_id }}
                search={{ page: ch.start_page + 1 }}
              />
            }
            className="gap-4 px-2 sm:gap-5"
          >
            <span className="w-8 shrink-0 text-center font-mono text-[13px] text-muted-foreground tabular-nums">
              {pad2(ch.chapter_number)}
            </span>
            <ItemContent className="min-w-0">
              <ItemTitle className="truncate text-[15px] font-normal">
                {stripTitleZeros(ch.title)}
              </ItemTitle>
              <ItemDescription className="font-mono text-[12px] tabular-nums">
                {stripTitleZeros(ch.book_title)} · Pages {ch.start_page + 1}–
                {ch.end_page + 1}
              </ItemDescription>
            </ItemContent>
            <ItemActions className="font-mono text-[12px] text-muted-foreground tabular-nums">
              {countLabel(ch.end_page - ch.start_page + 1, 'page')}
            </ItemActions>
          </Item>
        </li>
      ))}
    </ol>
  )
}
