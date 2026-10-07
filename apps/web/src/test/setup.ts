import '@testing-library/jest-dom/vitest'
window.scrollTo = () => undefined
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (media) => ({
    matches: false,
    media,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => true,
  })
}

const dialogPrototype = window.HTMLDialogElement?.prototype
if (dialogPrototype && typeof dialogPrototype.showModal !== 'function') {
  dialogPrototype.showModal = function showModal() {
    this.setAttribute('open', '')
  }
}
if (dialogPrototype && typeof dialogPrototype.close !== 'function') {
  dialogPrototype.close = function close() {
    this.removeAttribute('open')
  }
}
