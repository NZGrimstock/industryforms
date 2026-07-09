import { useRef, useState } from 'react'
import { View, TextInput, TouchableOpacity, Text, StyleSheet, TextInputProps } from 'react-native'

// Mirrors tradiee-app/components/ui/address-autocomplete.tsx so mobile and web
// behave the same way: falls back to a plain input when no LocationIQ key is
// configured (EXPO_PUBLIC_LOCATIONIQ_KEY), suggestions otherwise.
const API_KEY = process.env.EXPO_PUBLIC_LOCATIONIQ_KEY

type Suggestion = { place_id: string; display_name: string }

function cleanAddress(s: string) {
  return s.replace(/^(\d+[a-zA-Z]?),\s+/, '$1 ')
}

interface Props extends Omit<TextInputProps, 'value' | 'onChangeText'> {
  value: string
  onChangeText: (address: string) => void
}

export function AddressAutocomplete({ value, onChangeText, style, ...inputProps }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleChange(text: string) {
    onChangeText(text)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!text.trim() || !API_KEY) { setSuggestions([]); return }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://api.locationiq.com/v1/autocomplete?key=${API_KEY}&q=${encodeURIComponent(text)}&limit=5&countrycodes=nz,au&dedupe=1&format=json`
        )
        if (!res.ok) return
        const data: Suggestion[] = await res.json()
        setSuggestions(data)
      } catch {
        // silently ignore network errors
      }
    }, 350)
  }

  function select(s: Suggestion) {
    onChangeText(cleanAddress(s.display_name))
    setSuggestions([])
  }

  return (
    <View>
      <TextInput
        style={style}
        value={value}
        onChangeText={handleChange}
        placeholderTextColor="#9ca3af"
        {...inputProps}
      />
      {suggestions.length > 0 && (
        <View style={s.list}>
          {suggestions.map((sug, i) => (
            <TouchableOpacity
              key={sug.place_id}
              onPress={() => select(sug)}
              style={[s.row, i < suggestions.length - 1 && s.rowBorder]}
            >
              <Text style={s.rowText}>{cleanAddress(sug.display_name)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  list: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, marginTop: 4, overflow: 'hidden' },
  row: { paddingHorizontal: 12, paddingVertical: 10 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  rowText: { fontSize: 14, color: '#374151' },
})
