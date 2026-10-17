/**
 * Publishes the width of the window's scrollbar as `--scrollbar-width` (0px when scrollbars
 * overlay the page, as on touch devices and macOS).
 *
 * Video and Movies scroll the window and reserve that space permanently, while Music scrolls
 * inside its panels. Music's top bar adds the same width to its inset, so the experience
 * switch stays in exactly the same place in all three.
 */
export function publishScrollbarWidth() {
  const probe = document.createElement('div')
  probe.style.cssText = 'position:absolute;top:-999px;width:100px;height:100px;overflow:scroll;visibility:hidden'
  document.body.append(probe)
  const width = probe.offsetWidth - probe.clientWidth
  probe.remove()
  document.documentElement.style.setProperty('--scrollbar-width', `${width}px`)
}
