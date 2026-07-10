import type { RefObject } from 'react'
import { findNodeHandle, type ScrollView, type TextInput } from 'react-native'

// Scrolls a focused field (plus room for anything rendered below it, e.g. an
// autocomplete dropdown) up above the keyboard. RN's ScrollView doesn't do
// this automatically — the API docs say it must be wired up from onFocus.
export function scrollFieldAboveKeyboard(
  scrollViewRef: RefObject<ScrollView | null>,
  inputRef: RefObject<TextInput | null>,
  extraOffset = 12,
) {
  const input = inputRef.current
  const scrollView = scrollViewRef.current
  if (!input || !scrollView) return

  const scrollNode = findNodeHandle(scrollView)
  const inputNode = findNodeHandle(input)
  if (scrollNode != null) {
    input.measureLayout(
      scrollNode,
      (_x, y) => scrollView.scrollTo({ y: Math.max(0, y - extraOffset), animated: true }),
      () => {
        if (inputNode != null) {
          scrollView.scrollResponderScrollNativeHandleToKeyboard(inputNode, 120, true)
        }
      },
    )
    return
  }

  if (inputNode != null) {
    scrollView.scrollResponderScrollNativeHandleToKeyboard(inputNode, 120, true)
  }
}
