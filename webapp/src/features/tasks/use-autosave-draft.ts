import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * A text field that saves itself. The draft is sent when typing pauses, when the field loses
 * focus, and when the screen closes. A new saved value from the server replaces the draft.
 * `commit` runs once per edited value.
 */
export function useAutosaveDraft({
  commit,
  delayMs,
  saved,
}: {
  commit: (value: string) => void
  delayMs: number
  saved: string
}) {
  const [state, setState] = useState({ draft: saved, saved })
  if (state.saved !== saved) setState({ draft: saved, saved })

  const latest = useRef({ commit, draft: state.draft, saved })
  const sent = useRef<string | null>(null)
  useEffect(() => {
    latest.current = { commit, draft: state.draft, saved }
  })

  const flush = useCallback(() => {
    const { commit, draft, saved } = latest.current
    if (draft === saved || draft === sent.current) return
    sent.current = draft
    commit(draft)
  }, [])

  useEffect(() => {
    if (state.draft === saved) return
    const timer = setTimeout(flush, delayMs)
    return () => clearTimeout(timer)
  }, [state.draft, saved, delayMs, flush])

  // The cleanup sends an edit that is still waiting when the screen closes.
  useEffect(() => flush, [flush])

  const setDraft = (draft: string) => {
    // An edit after a failed save is sent again.
    sent.current = null
    setState((current) => ({ ...current, draft }))
  }

  return { draft: state.draft, flush, setDraft }
}
