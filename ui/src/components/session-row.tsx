import {
  Button,
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
  Tag,
} from '@zonsh/ui'
import { LaptopIcon, SmartphoneIcon } from 'lucide-react'
import type { SessionInfo } from '@/lib/api'
import { describeDevice, timeAgo } from '@/lib/utils'

/** A phone or tablet, by its browser's name for itself. */
function isMobileDevice(userAgent: string | null): boolean {
  return /iPhone|iPad|Android|Mobile/.test(userAgent ?? '')
}

/** One signed-in device: what it is, where it was last, and when. */
export function SessionRow({
  session,
  first,
  onSignOut,
  busy,
}: {
  session: SessionInfo
  first: boolean
  onSignOut?: () => void
  busy?: boolean
}) {
  const Icon = isMobileDevice(session.user_agent) ? SmartphoneIcon : LaptopIcon
  const seen = timeAgo(session.last_seen_at ?? session.created_at)
  return (
    <>
      {!first && <ItemSeparator />}
      <Item render={<li />} size="sm" className="px-0">
        <ItemMedia variant="icon">
          <Icon />
        </ItemMedia>
        <ItemContent className="min-w-0">
          <ItemTitle className="flex-wrap">
            {describeDevice(session.user_agent)}
            {session.current && <Tag variant="outline">This device</Tag>}
          </ItemTitle>
          <ItemDescription className="font-mono text-xs tabular-nums">
            {[
              seen ? `Active ${seen}` : null,
              session.ip_address,
              `signed in ${timeAgo(session.created_at) ?? ''}`.trim(),
            ]
              .filter(Boolean)
              .join(' · ')}
          </ItemDescription>
        </ItemContent>
        {onSignOut && !session.current && (
          <ItemActions>
            <Button
              variant="ghost"
              size="sm"
              onClick={onSignOut}
              disabled={busy}
            >
              Sign out
            </Button>
          </ItemActions>
        )}
      </Item>
    </>
  )
}

