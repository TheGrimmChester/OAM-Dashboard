import React, { useState } from 'react'
import { FiCopy, FiCheck } from 'react-icons/fi'
import { Button } from '@open-family/ui'
import './CopyField.css'

/**
 * Ghost copy control — confirms with a tick so hue is never the only signal.
 */
export default function CopyField({ text, label = 'Copy', disabled = false }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    if (disabled || text == null || text === '') return
    const value = String(text)
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value)
      } else {
        const area = document.createElement('textarea')
        area.value = value
        area.style.position = 'fixed'
        area.style.left = '-999999px'
        document.body.appendChild(area)
        area.select()
        document.execCommand('copy')
        document.body.removeChild(area)
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard may be blocked */
    }
  }

  const name = copied ? 'Copied to clipboard' : 'Copy to clipboard'

  return (
    <Button
      variant="ghost"
      size="sm"
      className={`oam-copy${copied ? ' is-copied' : ''}`}
      icon={copied ? <FiCheck /> : <FiCopy />}
      onClick={copy}
      disabled={disabled || text == null || text === ''}
      title={name}
      aria-label={label === 'Copy' ? name : undefined}
    >
      {copied ? 'Copied' : label}
    </Button>
  )
}
