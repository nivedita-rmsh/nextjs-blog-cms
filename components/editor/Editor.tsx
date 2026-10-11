'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { pastedImageFile } from '@/features/posts/media/clipboard'
import { useEditor, useEditorState, type Editor as TipTapEditor, EditorContent as TipTapContent } from '@tiptap/react'
import { extensions } from './extensions'
import { Toolbar } from './Toolbar'
import { ImageDialog } from './ImageDialog'
import type { ImageValue } from '@/features/posts/media/validation'

interface EditorProps {
  value: string
  onChange: (value: string) => void
  className?: string
  id?: string
  labelledBy?: string
  describedBy?: string
  invalid?: boolean
  scrollOffset?: number
  editorId?: string
}

/** Returns parsed TipTap JSON object when value is JSON, otherwise returns the
 *  raw string so TipTap can treat it as HTML. */
export function parseEditorContent(value: string): object | string {
  try {
    return JSON.parse(value) as object
  } catch {
    return value
  }
}

export function Editor({ value, onChange, className, editorId, id, labelledBy, describedBy, invalid = false, scrollOffset = 120 }: Readonly<EditorProps>) {
  const [imageDialog, setImageDialog] = useState<{ file?: File; initial?: ImageValue; position: number; editing: boolean }>()
  const isInternalUpdate = useRef(false)
  const lastEmittedValue = useRef<string | null>(null)

  const handleUpdate = useCallback(
    ({ editor }: { editor: { getJSON: () => object } }) => {
      if (isInternalUpdate.current) return
      // Keep form values current before Save/Publish can be clicked.
      const serialized = JSON.stringify(editor.getJSON())
      lastEmittedValue.current = serialized
      onChange(serialized)
    },
    [onChange]
  )

  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    content: value ? parseEditorContent(value) : '',
    onUpdate: handleUpdate,
    editorProps: {
      // ProseMirror must keep the caret below sticky controls when navigating long articles.
      scrollThreshold: { top: scrollOffset, bottom: 24, left: 16, right: 16 },
      scrollMargin: { top: scrollOffset, bottom: 24, left: 16, right: 16 },
      handlePaste: (view, event) => {
        const file = pastedImageFile(event.clipboardData)
        if (!file || !editorId) return false
        event.preventDefault()
        setImageDialog({ file, position: view.state.selection.from, editing: false })
        return true
      },
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false
        const file = Array.from(event.dataTransfer?.files ?? [])[0]
        if (!file || !editorId) return false
        event.preventDefault()
        const position = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? view.state.selection.from
        setImageDialog({ file, position, editing: false })
        return true
      },
      attributes: {
        class: 'prose prose-sm sm:prose-base max-w-none min-h-[300px] p-4',
        role: 'textbox',
        'aria-multiline': 'true',
        ...(id ? { id } : {}),
        ...(labelledBy ? { 'aria-labelledby': labelledBy } : { 'aria-label': 'Article content' }),
        ...(describedBy ? { 'aria-describedby': describedBy } : {}),
        'aria-invalid': String(invalid),
      },
    },
  })

  // Sync external value changes (e.g. form reset or switching posts)
  useEffect(() => {
    if (!editor || value === lastEmittedValue.current) return
    lastEmittedValue.current = null
    const parsed = value ? parseEditorContent(value) : ''
    if (typeof parsed === 'object') {
      // JSON content: skip if editor already contains the same data
      if (JSON.stringify(parsed) === JSON.stringify(editor.getJSON())) return
    }
    isInternalUpdate.current = true
    editor.commands.setContent(parsed, { emitUpdate: false })
    isInternalUpdate.current = false
  }, [editor, value])

  useEffect(() => {
    if (!editor) return
    editor.setEditable(!imageDialog, false)
  }, [editor, imageDialog])

  if (!editor) return null

  return (
    <div className={`border rounded-md overflow-hidden ${className ?? ''}`}>
      <Toolbar editor={editor} onImage={() => editorId && setImageDialog({ position: editor.state.selection.from, editing: editor.isActive('image'), initial: editor.isActive('image') ? editor.getAttributes('image') as ImageValue : undefined })} />
      {imageDialog && editorId && <ImageDialog editorId={editorId} initial={imageDialog.initial} initialFile={imageDialog.file}
        onClose={() => setImageDialog(undefined)} onSave={image => {
          // No document mutation occurs until upload, URL validation and metadata succeed.
          editor.setEditable(true, false)
          if (imageDialog.editing) editor.chain().focus().setNodeSelection(imageDialog.position).updateAttributes('image', image).run()
          else editor.chain().focus().setTextSelection(imageDialog.position).setImage(image).run()
        }} />}
      <TipTapContent editor={editor} />
      <EditorCount editor={editor} />
    </div>
  )
}

function EditorCount({ editor }: { readonly editor: TipTapEditor }) {
  const count = useEditorState({ editor, selector: ({ editor }) => ({
    words: editor.storage.characterCount?.words() ?? 0,
    characters: editor.storage.characterCount?.characters() ?? 0,
  }) })
  return <div className="px-4 py-1.5 border-t text-xs text-muted-foreground text-right select-none">
    {count.words} words · {count.characters} characters
  </div>
}
