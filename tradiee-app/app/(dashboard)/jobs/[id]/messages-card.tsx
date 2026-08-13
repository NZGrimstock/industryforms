'use client'
// Admin ↔ technician thread for a job. Sits alongside the Job notes card
// rather than replacing it: notes are the durable job record (and print on the
// job sheet), messages are the conversation. Both are job_notes rows split by
// `kind` — see JOB_MESSAGING_SCOPE.md.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'
import { formatDateTime } from '@/lib/utils'

export type JobMessage = {
  id: string
  body: string
  author_id: string | null
  created_at: string
  profiles: { full_name: string } | null
}

export function JobMessagesCard({ jobId, profileId, messages }: {
  jobId: string
  profileId: string
  messages: JobMessage[]
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim() || sending) return
    setSending(true)
    const res = await fetch(`/api/jobs/${jobId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: body.trim() }),
    })
    // Same guard as the mobile client and lib/sms.ts — an error response with
    // an empty body must not blow up on .json().
    const data = await res.json().catch(() => ({}))
    setSending(false)
    if (!res.ok) { toast(data.error ?? 'Could not send message', 'error'); return }
    setBody('')
    router.refresh()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Messages</CardTitle>
        <p className="mt-1 text-xs text-gray-500">
          Between you and the workers on this job. Not shown on the job sheet.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {messages.length === 0 ? (
          <p className="text-sm text-gray-400">No messages yet</p>
        ) : (
          <ul className="space-y-3 max-h-96 overflow-y-auto">
            {messages.map(m => {
              const mine = m.author_id === profileId
              return (
                <li key={m.id} className={mine ? 'flex justify-end' : 'flex justify-start'}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2 ${mine ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-800'}`}>
                    {!mine && (
                      <p className="text-xs font-medium text-gray-600 mb-0.5">
                        {m.profiles?.full_name ?? 'Unknown'}
                      </p>
                    )}
                    <p className="text-sm whitespace-pre-wrap">{m.body}</p>
                    <p className={`text-[11px] mt-1 ${mine ? 'text-orange-100' : 'text-gray-400'}`}>
                      {formatDateTime(m.created_at)}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        <form onSubmit={send} className="flex items-end gap-2">
          <Textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Message the team on this job…"
            rows={2}
            maxLength={2000}
            className="flex-1"
          />
          <Button type="submit" disabled={!body.trim() || sending}>
            {sending ? 'Sending…' : 'Send'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
