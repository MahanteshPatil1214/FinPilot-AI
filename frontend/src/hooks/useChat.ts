import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
  sendChatMessage,
} from '../services/api'
import type {
  ChatMessage,
  ChatMessageRequest,
  ConversationCreateRequest,
  ConversationDetail,
} from '../types/api'

const CONVERSATIONS_KEY = ['chat', 'conversations'] as const
const conversationKey = (id: string) => ['chat', 'conversation', id] as const

export function useConversations() {
  return useQuery({
    queryKey: CONVERSATIONS_KEY,
    queryFn: () => listConversations(),
  })
}

export function useConversation(conversationId: string | null) {
  return useQuery({
    queryKey: conversationKey(conversationId ?? 'none'),
    queryFn: () => getConversation(conversationId as string),
    enabled: Boolean(conversationId),
  })
}

export function useCreateConversation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: ConversationCreateRequest = {}) =>
      createConversation(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY })
    },
  })
}

export function useDeleteConversation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (conversationId: string) => deleteConversation(conversationId),
    onSuccess: (_result, conversationId) => {
      queryClient.removeQueries({ queryKey: conversationKey(conversationId) })
      void queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY })
    },
  })
}

interface SendContext {
  previous: ConversationDetail | undefined
  optimisticId: string
}

// Sends a turn optimistically: the user's message appears immediately, then is
// replaced by the persisted user and assistant messages the backend returns.
// The assistant message carries the outcome, tool-call statuses, citations and
// result references; nothing is fabricated if the request fails (the optimistic
// message is rolled back and the error surfaced).
export function useSendMessage(conversationId: string) {
  const queryClient = useQueryClient()
  return useMutation<
    Awaited<ReturnType<typeof sendChatMessage>>,
    Error,
    ChatMessageRequest,
    SendContext
  >({
    mutationFn: (payload) => sendChatMessage(conversationId, payload),
    onMutate: async (payload) => {
      const key = conversationKey(conversationId)
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<ConversationDetail>(key)
      const optimisticId = `optimistic-${Date.now()}`
      const optimistic: ChatMessage = {
        id: optimisticId,
        role: 'user',
        content: payload.content,
        outcome: null,
        tool_calls: [],
        citations: [],
        result_refs: [],
        created_at: new Date().toISOString(),
      }
      if (previous) {
        queryClient.setQueryData<ConversationDetail>(key, {
          ...previous,
          messages: [...previous.messages, optimistic],
        })
      }
      return { previous, optimisticId }
    },
    onError: (_error, _payload, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(
          conversationKey(conversationId),
          context.previous,
        )
      }
    },
    onSuccess: (data, _payload, context) => {
      const key = conversationKey(conversationId)
      queryClient.setQueryData<ConversationDetail>(key, (current) => {
        const base = current ?? context?.previous
        if (!base) return current
        const withoutOptimistic = base.messages.filter(
          (message) => message.id !== context?.optimisticId,
        )
        return {
          ...base,
          messages: [
            ...withoutOptimistic,
            data.user_message,
            data.assistant_message,
          ],
        }
      })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY })
    },
  })
}
