'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'
import { UserPlus } from 'lucide-react'

interface Props {
  jobId: string
  jobTitle: string
  projectAddress: string | null
  // When controlled (open/onOpenChange supplied), the built-in trigger button is
  // hidden — used when opened from the job's "Add" dropdown instead.
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

interface SendResponse {
  id: string
  token: string
  onPlatform: boolean
}

export function InviteSubcontractorModal({ jobId, jobTitle, projectAddress, open: controlledOpen, onOpenChange }: Props) {
  const { toast } = useToast()
  const controlled = controlledOpen !== undefined
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const open = controlled ? controlledOpen : uncontrolledOpen
  const setOpen = (v: boolean) => { if (controlled) onOpenChange?.(v); else setUncontrolledOpen(v) }
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    subcontractorEmail: '',
    description: jobTitle,
    projectAddress: projectAddress ?? '',
    dueDate: '',
    agreedPrice: '',
  })

  function resetForm() {
    setForm({
      subcontractorEmail: '',
      description: jobTitle,
      projectAddress: projectAddress ?? '',
      dueDate: '',
      agreedPrice: '',
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    try {
      const res = await fetch('/api/invitations/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          subcontractorEmail: form.subcontractorEmail,
          title: jobTitle,
          description: form.description || undefined,
          projectAddress: form.projectAddress || undefined,
          dueDate: form.dueDate || undefined,
          agreedPrice: form.agreedPrice ? parseFloat(form.agreedPrice) : undefined,
        }),
      })

      const data = await res.json() as SendResponse & { error?: string }

      if (!res.ok) {
        toast(data.error ?? 'Failed to send invitation', 'error')
        setLoading(false)
        return
      }

      if (data.onPlatform) {
        toast(`Invitation sent! ${form.subcontractorEmail.split('@')[0]} is already on IndustryForms — they'll get a notification.`)
      } else {
        toast(`Invitation sent! We emailed ${form.subcontractorEmail} with a link to view the job.`)
      }

      setOpen(false)
      resetForm()
    } catch {
      toast('Network error. Please try again.', 'error')
    }

    setLoading(false)
  }

  return (
    <>
      {!controlled && (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <UserPlus className="h-4 w-4" />
          Invite subcontractor
        </Button>
      )}

      <Dialog open={open} onClose={() => { setOpen(false); resetForm() }} title="Invite subcontractor">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Subcontractor email <span className="text-red-400">*</span></Label>
            <Input
              type="email"
              value={form.subcontractorEmail}
              onChange={e => setForm(f => ({ ...f, subcontractorEmail: e.target.value }))}
              placeholder="sub@example.com"
              required
            />
          </div>

          <div>
            <Label>Description</Label>
            <Textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={3}
              placeholder="Describe the work..."
            />
          </div>

          <div>
            <Label>Project address</Label>
            <Input
              type="text"
              value={form.projectAddress}
              onChange={e => setForm(f => ({ ...f, projectAddress: e.target.value }))}
              placeholder="123 Main St, Auckland"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Due date</Label>
              <Input
                type="date"
                value={form.dueDate}
                onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
              />
            </div>
            <div>
              <Label>Agreed price ($)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.agreedPrice}
                onChange={e => setForm(f => ({ ...f, agreedPrice: e.target.value }))}
                placeholder="Optional"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <Button type="submit" loading={loading}>Send invitation</Button>
            <Button type="button" variant="outline" onClick={() => { setOpen(false); resetForm() }}>Cancel</Button>
          </div>
        </form>
      </Dialog>
    </>
  )
}
