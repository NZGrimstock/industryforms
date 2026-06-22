'use client'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/toast'
import { Send } from 'lucide-react'

interface Message {
  id: string
  direction: 'inbound' | 'outbound'
  body: string
  created_at: string
}

// Threaded SMS view shown on the customer detail page. Inbound rows arrive
// via the Twilio webhook (/api/sms/inbound) and we re-fetch on a 15s timer;
// good enough without realtime subscriptions and free of WS plumbing.
export function SmsThread({ customerId, customerPhone, initial }: {
  customerId: string
  customerPhone: string | null
  initial: Message[]
}) {
  const supabase = createClient()
  const { toast } = useToast()
  const [messages, setMessages] = useState<Message[]>(initial)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const scrollerRef = useRef<HTMLDivElement>(null)

  async function refresh() {
    const { data } = await supabase
      .from('customer_messages')
      .select('id, direction, body, created_at')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: true })
    if (data) setMessages(data as Message[])
  }

  useEffect(() => {
    const t = setInterval(refresh, 15000)
    return () => clearInterval(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId])

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight })
  }, [messages.length])

  async function send(e: React.FormEvent) {
    e.preventDefault()
    const text = body.trim()
    if (!text) return
    setSending(true)
    const res = await fetch('/api/sms/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_id: customerId, body: text }),
    })
    setSending(false)
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: 'Send failed' }))
      toast(error ?? 'Send failed', 'error')
      return
    }
    setBody('')
    refresh()
  }

  return (
    <div className="flex flex-col h-[28rem] border border-gray-200 rounded-lg bg-white">
      <div ref={scrollerRef} className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.length === 0 ? (
          <p className="text-center text-sm text-gray-400 mt-12">No messages yet</p>
        ) : messages.map(m => (
          <div key={m.id} className={`flex ${m.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
              m.direction === 'outbound'
                ? 'bg-[var(--accent,#f97316)] text-white rounded-br-sm'
                : 'bg-gray-100 text-gray-800 rounded-bl-sm'
            }`}>
              {m.body}
              <p className="text-[10px] opacity-70 mt-1">{new Date(m.created_at).toLocaleString('en-NZ', { dateStyle: 'short', timeStyle: 'short' })}</p>
            </div>
          </div>
        ))}
      </div>
      <form onSubmit={send} className="border-t border-gray-100 p-2 flex gap-2">
        <input
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder={customerPhone ? `Text ${customerPhone}` : 'Customer has no phone on file'}
          disabled={!customerPhone || sending}
          className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-gray-300 disabled:bg-gray-50"
        />
        <button type="submit" disabled={!body.trim() || !customerPhone || sending}
          className="inline-flex items-center gap-1.5 bg-[var(--accent,#f97316)] hover:bg-[var(--accent-hover,#ea580c)] text-white px-3 rounded-lg text-sm font-medium disabled:opacity-50">
          <Send className="h-4 w-4" /> Send
        </button>
      </form>
    </div>
  )
}
