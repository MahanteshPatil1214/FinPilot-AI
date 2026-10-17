import { useEffect, useRef, useState } from 'react'

import { useConversation, useSendMessage } from '../../hooks/useChat'
import { StateMessage } from '../ui/StateMessage'
import { Composer } from './Composer'
import { MessageItem } from './MessageItem'

interface ConversationThreadProps {
  conversationId: string
  draft?: string
  draftKey?: number
}

// The active conversation: its transcript, an optimistic "working" row while a
// turn is in flight, an error banner if the turn fails, and the composer. The
// suggestion draft (if any) is handed to the composer so an empty conversation
// opened from a capability card is ready to send.
export function ConversationThread({
  conversationId,
  draft,
  draftKey,
}: ConversationThreadProps) {
  const detail = useConversation(conversationId)
  const send = useSendMessage(conversationId)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [sentKey, setSentKey] = useState(0)
  const messages = detail.data?.messages ?? []

  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [messages.length, send.isPending, conversationId])

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 py-5">
          {detail.isLoading ? (
            <StateMessage kind="loading" title="Loading conversation…" />
          ) : detail.isError ? (
            <StateMessage
              kind="error"
              title="Conversation could not be loaded"
              message="The transcript is unavailable right now."
              onRetry={() => void detail.refetch()}
            />
          ) : messages.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">
              This conversation is empty. Ask a question below to get started.
            </p>
          ) : (
            <div className="flex flex-col gap-6">
              {messages.map((message) => (
                <MessageItem key={message.id} message={message} />
              ))}
              {send.isPending ? (
                <div className="flex items-center gap-2 text-xs text-muted">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-line-strong border-t-accent" />
                  The assistant is working…
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {send.isError ? (
        <div className="border-t border-status-risk/25 bg-status-riskSoft px-6 py-2">
          <p className="mx-auto max-w-3xl text-xs text-status-risk">
            The request could not be completed.{' '}
            {send.error instanceof Error ? send.error.message : ''}
          </p>
        </div>
      ) : null}

      <Composer
        onSend={(content, attachmentIds) =>
          send.mutate(
            {
              content,
              attachment_document_ids:
                attachmentIds.length > 0 ? attachmentIds : undefined,
            },
            { onSuccess: () => setSentKey((current) => current + 1) },
          )
        }
        disabled={!detail.data}
        isSending={send.isPending}
        initialValue={draft}
        draftKey={draftKey}
        resetKey={sentKey}
      />
    </div>
  )
}
