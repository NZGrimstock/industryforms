'use client'
import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Camera, X, Loader2 } from 'lucide-react'

const R2_PUBLIC_BASE = (process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL ?? '').replace(/\/$/, '')

interface Photo {
  id: string
  storage_path: string
  caption: string | null
  created_at: string
}

interface Props {
  jobId: string
  companyId: string
  profileId: string
  photos: Photo[]
  onUploaded?: () => void
}

export function JobPhotoUpload({ jobId, companyId, profileId, photos: initial, onUploaded }: Props) {
  const supabase = createClient()
  const [photos, setPhotos] = useState<Photo[]>(initial)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function getPublicUrl(path: string) {
    return `${R2_PUBLIC_BASE}/${path}`
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    setError('')

    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue
      if (file.size > 10 * 1024 * 1024) { setError('Max 10MB per photo'); continue }

      const ext = file.name.split('.').pop() ?? 'jpg'

      // Get a presigned R2 upload URL (key is built server-side from the company)
      const res = await fetch('/api/storage/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'job-photo', jobId, ext, contentType: file.type }),
      })
      if (!res.ok) { setError((await res.json()).error ?? 'Upload failed'); continue }
      const { url, key } = await res.json()

      const put = await fetch(url, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file })
      if (!put.ok) { setError('Upload to storage failed'); continue }

      const { data: photo, error: dbError } = await supabase.from('job_photos').insert({
        job_id: jobId,
        company_id: companyId,
        uploaded_by: profileId,
        storage_path: key,
      }).select().single()

      if (dbError) { setError(dbError.message) } else if (photo) { setPhotos(p => [...p, photo]) }
    }

    setUploading(false)
    onUploaded?.()
  }

  async function deletePhoto(photo: Photo) {
    await fetch('/api/storage/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: photo.storage_path }),
    })
    await supabase.from('job_photos').delete().eq('id', photo.id)
    setPhotos(p => p.filter(x => x.id !== photo.id))
  }

  return (
    <div>
      {photos.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-3 px-6">
          {photos.map(photo => (
            <div key={photo.id} className="relative group aspect-square">
              <img
                src={getPublicUrl(photo.storage_path)}
                alt={photo.caption ?? 'Job photo'}
                className="w-full h-full object-cover rounded-lg border border-gray-100"
              />
              <button
                onClick={() => deletePhoto(photo)}
                className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-red-500 px-6 mb-2">{error}</p>}

      <div className="px-6 py-2">
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-[var(--accent,#f97316)] font-medium disabled:opacity-50"
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
          {uploading ? 'Uploading…' : 'Add photos'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={e => handleFiles(e.target.files)}
        />
      </div>
    </div>
  )
}
