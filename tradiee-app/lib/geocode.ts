/**
 * Geocode a free-text address to coordinates via OpenStreetMap Nominatim.
 * Works in both the browser and on the server. Returns null on failure so callers
 * can degrade gracefully. Geocode ONCE on save and store lat/lng — never per render.
 */
export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  if (!address?.trim()) return null
  try {
    const q = encodeURIComponent(address)
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${q}&limit=1`, {
      headers: { 'Accept-Language': 'en' },
    })
    if (!res.ok) return null
    const data = await res.json()
    if (data[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
  } catch {
    // network / rate-limit — caller stores null and can retry later
  }
  return null
}
