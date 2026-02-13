import { useEffect, useRef, useState, useCallback } from 'react'
import { getApi } from '../api/client'
import { useToastStore } from '../stores/useToastStore'
import { CopyIcon } from './icons'

interface QuickNotesEditorProps {
  parentId: string
  parentType: 'session' | 'agent'
  parentName: string
}

export function QuickNotesEditor({ parentId, parentType, parentName }: QuickNotesEditorProps) {
  const [content, setContent] = useState('')
  const [noteId, setNoteId] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { addToast } = useToastStore()

  // Load note on mount
  useEffect(() => {
    let cancelled = false
    getApi().quickNotes.load(parentId, parentType).then((note: any) => {
      if (cancelled) return
      if (note) {
        setContent(note.content as string)
        setNoteId(note.id as string)
      }
    })
    return () => { cancelled = true }
  }, [parentId, parentType])

  // Auto-focus on mount
  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  // Debounced save
  const save = useCallback((text: string) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      let id = noteId
      if (!id) {
        id = crypto.randomUUID()
        setNoteId(id)
      }
      getApi().quickNotes.save(id, parentId, parentType, text)
    }, 500)
  }, [noteId, parentId, parentType])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value
    setContent(text)
    save(text)
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(content).then(() => {
      addToast('Notes copied', 'success')
    }).catch(() => {
      addToast('Failed to copy', 'error')
    })
  }

  return (
    <div className="quick-notes-editor">
      <div className="quick-notes-toolbar">
        <span className="quick-notes-label">{parentName}</span>
        <button className="quick-notes-copy-btn" onClick={handleCopy} title="Copy notes">
          <CopyIcon />
          Copy
        </button>
      </div>
      <textarea
        ref={textareaRef}
        className="quick-notes-textarea"
        value={content}
        onChange={handleChange}
        placeholder="Type your notes here..."
        spellCheck={false}
      />
    </div>
  )
}
