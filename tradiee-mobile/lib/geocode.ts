/**
 * Geocode a free-text address to coordinates.
 * Mirrors tradiee-app/lib/geocode.ts: LocationIQ when EXPO_PUBLIC_LOCATIONIQ_KEY
 * is set, OpenStreetMap Nominatim fallback. Returns null on failure.
 * Geocode ONCE on save and store lat/lng — never per render.
 */
export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  if (!address?.trim()) return null
  try {
    const key = process.env.EXPO_PUBLIC_LOCATIONIQ_KEY
    const q = encodeURIComponent(address.trim())

    if (key) {
      const res = await fetch(
        `https://us1.locationiq.com/v1/search?key=${key}&q=${q}&format=json&limit=1&countrycodes=nz,au`,
        { headers: { Accept: 'application/json' } }
      )
      if (!res.ok) return null
      const data = await res.json()
      if (!data[0]) return null
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
    }

    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${q}&limit=1`,
      { headers: { 'Accept-Language': 'en', 'User-Agent': 'TradeHub/1.0' } }
    )
    if (!res.ok) return null
    const data = await res.json()
    if (!data[0]) return null
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
  } catch {
    // network / rate-limit — caller stores null and can retry later
  }
  return null
}
