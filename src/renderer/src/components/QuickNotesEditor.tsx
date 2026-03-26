import { useEffect, useRef, useState, useCallback } from 'react'
import { getApi } from '../api/client'
import { useToastStore } from '../stores/useToastStore'
import { useQuickNotesStore } from '../stores/useQuickNotesStore'
import { CopyIcon, TrashIcon } from './icons'

interface QuickNotesEditorProps {
  parentId: string
  parentType: 'session' | 'agent'
  parentName: string
  onDeleted?: () => void
}

export function QuickNotesEditor({ parentId, parentType, parentName, onDeleted }: QuickNotesEditorProps) {
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
      useQuickNotesStore.getState().markSaved(parentId)
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

  const handleDelete = async () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    await getApi().quickNotes.delete(parentId, parentType)
    useQuickNotesStore.getState().clearSaved(parentId)
    setContent('')
    setNoteId(null)
    addToast('Notes deleted', 'success')
    onDeleted?.()
  }

  return (
    <div className="quick-notes-editor">
      <div className="quick-notes-toolbar">
        <span className="quick-notes-label">{parentName}</span>
        <div className="quick-notes-toolbar-actions">
          <button className="quick-notes-copy-btn" onClick={handleCopy} title="Copy notes">
            <CopyIcon />
            Copy
          </button>
          {(content.length > 0 || noteId) && (
            <button className="quick-notes-delete-btn" onClick={handleDelete} title="Delete notes">
              <TrashIcon />
              Delete
            </button>
          )}
        </div>
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
