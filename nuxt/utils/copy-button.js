/**
 * The docs' copy button, on any code block: one control, one behaviour.
 *
 * Wraps the `pre` in `.docs-code` so the button anchors to the wrapper and
 * does not scroll away with the code. Enhances a block once.
 *
 * @param {HTMLPreElement} pre - The code block.
 * @param {object} [options]
 * @param {Function} [options.onCopy] - Called after a successful copy.
 */
export function addCopyButton(pre, { onCopy } = {}) {
  if (!pre || pre.hasAttribute('data-enhanced')) return
  pre.setAttribute('data-enhanced', '')
  // Focusable, so the scroll region is reachable and the copy button
  // appears where there is no hover.
  pre.tabIndex = 0

  const wrapper = document.createElement('div')
  wrapper.className = 'docs-code'
  pre.parentNode.insertBefore(wrapper, pre)
  wrapper.appendChild(pre)

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'docs-copy'
  // Named for screen readers; the visible text is a span so code.css
  // can reserve the wider "Copied" width behind it.
  button.setAttribute('aria-label', 'Copy code to clipboard')
  const label = document.createElement('span')
  label.textContent = 'Copy'
  button.appendChild(label)

  // A live region announces the result, so the button keeps its name.
  const status = document.createElement('span')
  status.className = 'sr-only'
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')

  const code = pre.querySelector('code') || pre
  let timer
  const setState = (state, text, announce) => {
    clearTimeout(timer)
    label.textContent = text
    status.textContent = announce
    if (state) button.dataset.state = state
    else delete button.dataset.state
  }
  // navigator.clipboard is undefined on non-secure origins and can
  // reject, so the click is guarded.
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(code.innerText)
      setState('copied', 'Copied', 'Copied to clipboard')
      if (onCopy) onCopy()
    } catch (e) {
      setState('failed', 'Failed', 'Copy failed')
    }
    timer = setTimeout(() => setState(null, 'Copy', ''), 2000)
  })

  wrapper.appendChild(button)
  wrapper.appendChild(status)
}
