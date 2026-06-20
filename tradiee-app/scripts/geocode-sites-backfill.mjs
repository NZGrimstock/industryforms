// One-off backfill: geocode customer_sites that don't have lat/lng yet and store
// the coordinates, so the Job Map reads them directly instead of geocoding on load.
//
// Run:  node --env-file=.env.local scripts/geocode-sites-backfill.mjs
// (Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY in the env file.)
import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY)

async function geocode(address) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`, {
      headers: { 'Accept-Language': 'en', 'User-Agent': 'IndustryForms-Backfill/1.0' },
    })
    if (!res.ok) return null
    const data = await res.json()
    if (data[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
  } catch {}
  return null
}

const { data: sites, error } = await sb
  .from('customer_sites')
  .select('id, address')
  .is('lat', null)
  .not('address', 'is', null)
if (error) { console.error(error.message); process.exit(1) }

console.log(`${sites.length} site(s) need geocoding`)
let ok = 0
for (const site of sites) {
  const coords = await geocode(site.address)
  if (coords) {
    await sb.from('customer_sites').update({ lat: coords.lat, lng: coords.lng }).eq('id', site.id)
    ok++
    console.log(`✓ ${site.address}`)
  } else {
    console.log(`✗ could not locate: ${site.address}`)
  }
  await new Promise(r => setTimeout(r, 1100)) // Nominatim: max ~1 req/sec
}
console.log(`done — geocoded ${ok}/${sites.length}`)
