export function isPopout(): boolean {
  return new URLSearchParams(window.location.search).has('popout')
}
