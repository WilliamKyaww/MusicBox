import { toggleSubscription, useLibrary } from '../library'
import { useVideoActions } from '../videoActions'

type SubscribeButtonProps = {
  channelId: string
  name: string
  handle: string | null
  avatarUrl: string | null
}

/** Subscriptions are local to this browser; they drive the sidebar and feed. */
export function SubscribeButton({ channelId, name, handle, avatarUrl }: SubscribeButtonProps) {
  const { pushToast } = useVideoActions()
  const subscribed = useLibrary((state) =>
    state.subscriptions.some((entry) => entry.id === channelId),
  )

  if (!channelId) return null

  return (
    <button
      type="button"
      className={`yt-subscribe ${subscribed ? 'yt-subscribe--active' : ''}`}
      onClick={() => {
        const nowSubscribed = toggleSubscription({ id: channelId, name, handle, avatarUrl })
        pushToast(nowSubscribed ? `Subscribed to ${name}.` : `Unsubscribed from ${name}.`)
      }}
    >
      {subscribed ? 'Subscribed' : 'Subscribe'}
    </button>
  )
}
