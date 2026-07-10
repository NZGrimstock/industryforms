import { findNodeHandle } from 'react-native'
import type { ScrollView, TextInput } from 'react-native'
import type { RefObject } from 'react'

// Scrolls a focused field (plus room for anything rendered below it, e.g. an
// autocomplete dropdown) up above the keyboard. RN's ScrollView doesn't do
// this automatically — the API docs say it must be wired up from onFocus.
export function scrollFieldAboveKeyboard(
  scrollViewRef: RefObject<ScrollView | null>,
  inputRef: RefObject<TextInput | null>,
  extraOffset = 80,
) {
  const node = findNodeHandle(inputRef.current)
  if (node == null || !scrollViewRef.current) return
  scrollViewRef.current.scrollResponderScrollNativeHandleToKeyboard(node, extraOffset, true)
}
