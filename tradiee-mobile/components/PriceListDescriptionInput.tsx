import { useMemo, useState } from 'react'
import {
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native'

export type PriceListLookupItem = {
  id: string
  name: string
  unit?: string | null
  sell_price?: number | null
  cost_price?: number | null
  category?: string | null
}

type Props = {
  value: string
  items: PriceListLookupItem[]
  onChangeText: (value: string) => void
  onPick: (item: PriceListLookupItem) => void
  placeholder?: string
  inputStyle?: StyleProp<TextStyle>
  containerStyle?: StyleProp<ViewStyle>
  autoFocus?: boolean
}

export function PriceListDescriptionInput({
  value,
  items,
  onChangeText,
  onPick,
  placeholder = 'Description',
  inputStyle,
  containerStyle,
  autoFocus,
}: Props) {
  const [focused, setFocused] = useState(false)
  const matches = useMemo(() => {
    const q = value.trim().toLowerCase()
    if (!q) return []
    return items
      .filter(item => item.name.toLowerCase().includes(q) || (item.category ?? '').toLowerCase().includes(q))
      .slice(0, 8)
  }, [items, value])
  const showMatches = focused && matches.length > 0

  return (
    <View style={containerStyle}>
      <TextInput
        style={inputStyle}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#6b7280"
        autoFocus={autoFocus}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 120)}
      />
      {showMatches && (
        <View style={styles.dropdown}>
          {matches.map(item => (
            <TouchableOpacity
              key={item.id}
              style={styles.option}
              onPress={() => {
                onPick(item)
                setFocused(false)
              }}
              activeOpacity={0.7}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.optionName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.optionMeta} numberOfLines={1}>
                  {item.unit || 'ea'} · ${(Number(item.sell_price) || 0).toFixed(2)}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  dropdown: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#fed7aa',
    borderRadius: 12,
    marginTop: 4,
    marginBottom: 8,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  optionName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  optionMeta: { fontSize: 12, color: '#6b7280', marginTop: 1 },
})
