'use client'
import { useState, useRef } from 'react'
import { Mic, MicOff, Loader2, Sparkles, X } from 'lucide-react'

type ParseMode = 'customer' | 'job' | 'description' | 'quote_header'

interface VoiceInputProps {
  mode: ParseMode
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onParsed: (data: Record<string, any>) => void
  hint?: string
  label?: string
}

export function VoiceInput({ mode, onParsed, hint, label = 'VoiceFill' }: VoiceInputProps) {
  const [open, setOpen] = useState(false)
  const [recording, setRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState('')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)

  const defaultHints: Record<ParseMode, string> = {
    customer: 'e.g. "Residential, John Smith, 021 555 1234, john@email.com, 5 Oak Street"',
    job: 'e.g. "Install heat pump for the Smiths, urgent, needs to be done by Friday"',
    description: 'e.g. "fix leaky tap in the kitchen been dripping for a week"',
    quote_header: 'e.g. "Quote for bathroom renovation including new vanity and tiling"',
  }

  function startRecording() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      setError('Voice input requires Chrome or Safari. Firefox is not supported.')
      return
    }

    const recognition = new SR()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-NZ'

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (e: any) => {
      let full = ''
      for (let i = 0; i < e.results.length; i++) {
        full += e.results[i][0].transcript
      }
      setTranscript(full)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (e: any) => {
      if (e.error === 'no-speech') {
        setError('No speech detected — tap the mic and try again.')
      } else if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        setError('Microphone access denied. Allow mic access in your browser settings.')
      } else if (e.error === 'network') {
        setError('Speech service unreachable — it needs an internet connection and works best in Chrome. You can also just type what you’d say below.')
      } else if (e.error === 'aborted') {
        // user stopped — not an error
      } else {
        setError(`Mic error: ${e.error}. You can type your text below instead.`)
      }
      setRecording(false)
    }

    recognition.onend = () => setRecording(false)

    recognition.start()
    recognitionRef.current = recognition
    setRecording(true)
    setTranscript('')
    setError('')
  }

  function stopRecording() {
    recognitionRef.current?.stop()
    setRecording(false)
  }

  function closeModal() {
    stopRecording()
    setOpen(false)
    setTranscript('')
    setError('')
  }

  async function parseTranscript() {
    if (!transcript.trim()) return
    setParsing(true)
    setError('')
    try {
      const res = await fetch('/api/voice/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript, mode }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      onParsed(data)
      closeModal()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    }
    setParsing(false)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--accent,#f97316)] hover:text-[var(--accent,#f97316)] border border-orange-200 rounded-lg px-3 py-1.5 hover:bg-orange-50 transition-colors"
      >
        <Sparkles className="h-3.5 w-3.5" />
        {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 relative">
            <button
              type="button"
              onClick={closeModal}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="h-4 w-4 text-orange-500" />
              <h3 className="text-base font-semibold text-gray-900">Voice input</h3>
            </div>
            <p className="text-xs text-gray-400 mb-6">{hint ?? defaultHints[mode]}</p>

            {/* Mic button */}
            <div className="flex justify-center mb-5">
              <button
                type="button"
                onClick={recording ? stopRecording : startRecording}
                className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all focus:outline-none ${
                  recording
                    ? 'bg-red-500 hover:bg-red-600 shadow-xl shadow-red-200'
                    : 'bg-[var(--accent,#f97316)] hover:bg-[var(--accent-hover,#ea580c)] shadow-xl shadow-orange-200'
                }`}
              >
                {recording && (
                  <>
                    <span className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-60" />
                    <span className="absolute inset-[-8px] rounded-full border-2 border-red-300 animate-pulse opacity-40" />
                  </>
                )}
                {recording
                  ? <MicOff className="h-8 w-8 text-white relative z-10" />
                  : <Mic className="h-8 w-8 text-white" />
                }
              </button>
            </div>

            <p className="text-center text-xs text-gray-400 mb-4">
              {recording ? 'Listening… tap to stop' : transcript ? 'Tap to re-record, or edit below' : 'Tap to speak — or type below'}
            </p>

            {/* Transcript (editable — also a fallback when the mic isn't available) */}
            <textarea
              value={transcript}
              onChange={e => setTranscript(e.target.value)}
              placeholder={recording ? 'Listening…' : 'Speak, or type what you’d say here…'}
              rows={3}
              className={`w-full rounded-xl p-3 mb-4 text-sm resize-none focus:outline-none transition-colors ${
                recording ? 'bg-red-50 border border-red-100' : 'bg-gray-50 border border-gray-200 focus:border-orange-400'
              } text-gray-700`}
            />

            {error && (
              <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2 mb-3">{error}</p>
            )}

            <div className="flex gap-2">
              {transcript && !recording && (
                <button
                  type="button"
                  onClick={parseTranscript}
                  disabled={parsing}
                  className="flex-1 flex items-center justify-center gap-2 bg-[var(--accent,#f97316)] hover:bg-[var(--accent-hover,#ea580c)] disabled:opacity-60 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
                >
                  {parsing
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Filling form…</>
                    : <><Sparkles className="h-4 w-4" /> Fill form</>
                  }
                </button>
              )}
              <button
                type="button"
                onClick={closeModal}
                className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
