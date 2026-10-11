'use client'

import { useId, useRef, useState } from 'react'
import { type Editor, useEditorState } from '@tiptap/react'
import {
  Bold, Italic, Underline, Strikethrough,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, ListTodo, Quote, Code,
  Link, Image as ImageIcon, Minus,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface ToolbarProps {
  editor: Editor
  onImage: () => void
}

// ── Color palettes ────────────────────────────────────────────────────────────
const TEXT_COLORS = [
  { hex: '#000000', label: 'Black' },
  { hex: '#ef4444', label: 'Red' },
  { hex: '#f97316', label: 'Orange' },
  { hex: '#eab308', label: 'Yellow' },
  { hex: '#22c55e', label: 'Green' },
  { hex: '#3b82f6', label: 'Blue' },
  { hex: '#8b5cf6', label: 'Purple' },
  { hex: '#ec4899', label: 'Pink' },
  { hex: '#6b7280', label: 'Gray' },
  { hex: '#92400e', label: 'Brown' },
  { hex: '#166534', label: 'Dark Green' },
  { hex: '#1e3a8a', label: 'Navy' },
  { hex: '#4c1d95', label: 'Dark Purple' },
  { hex: '#9f1239', label: 'Dark Red' },
  { hex: '#d1d5db', label: 'Light Gray' },
  { hex: '#ffffff', label: 'White' },
]

const HIGHLIGHT_COLORS = [
  { hex: '#fef9c3', label: 'Yellow' },
  { hex: '#fee2e2', label: 'Red' },
  { hex: '#dcfce7', label: 'Green' },
  { hex: '#dbeafe', label: 'Blue' },
  { hex: '#ede9fe', label: 'Purple' },
  { hex: '#fce7f3', label: 'Pink' },
  { hex: '#ffedd5', label: 'Orange' },
  { hex: '#e0f2fe', label: 'Sky' },
]

const LINE_HEIGHTS = ['1', '1.5', '2', '2.5', '3']

// ── Heading helpers ───────────────────────────────────────────────────────────
const HEADING_OPTIONS = [
  { label: 'Normal', action: (e: Editor) => e.chain().focus().setParagraph().run() },
  { label: 'Heading 1', action: (e: Editor) => e.chain().focus().toggleHeading({ level: 1 }).run() },
  { label: 'Heading 2', action: (e: Editor) => e.chain().focus().toggleHeading({ level: 2 }).run() },
  { label: 'Heading 3', action: (e: Editor) => e.chain().focus().toggleHeading({ level: 3 }).run() },
  { label: 'Heading 4', action: (e: Editor) => e.chain().focus().toggleHeading({ level: 4 }).run() },
]

function getHeadingLabel(editor: Editor): string {
  for (let level = 1; level <= 4; level++) {
    if (editor.isActive('heading', { level })) return `Heading ${level}`
  }
  return 'Normal'
}

// The shared dialog supplies keyboard containment, Escape dismissal and focus return.
function ColorPanel({ editor, triggerRef, initialSection, onClose, id }: Readonly<{
  editor: Editor
  triggerRef: React.RefObject<HTMLButtonElement | null>
  initialSection: 'text' | 'highlight'
  onClose: () => void
  id: string
}>) {
  const textRef = useRef<HTMLButtonElement>(null)
  const highlightRef = useRef<HTMLButtonElement>(null)
  return <DialogContent id={id} finalFocus={triggerRef} initialFocus={initialSection === 'text' ? textRef : highlightRef} className="max-h-[90dvh] overflow-y-auto">
    <DialogHeader>
      <DialogTitle>Text color and highlight</DialogTitle>
      <DialogDescription>Choose a color. Select the active color again to remove it. Press Escape to close.</DialogDescription>
    </DialogHeader>
    {([
      { section: 'text', title: 'Text color', colors: TEXT_COLORS, active: editor.getAttributes('textStyle').color, firstRef: textRef },
      { section: 'highlight', title: 'Highlight', colors: HIGHLIGHT_COLORS, active: editor.getAttributes('highlight').color, firstRef: highlightRef },
    ] as const).map(({ section, title, colors, active, firstRef }) => <fieldset key={section}>
      <legend className="mb-2 text-xs font-medium">{title}</legend>
      <div className="grid grid-cols-8 gap-1">
        {colors.map(({ hex, label }, index) => <button
          ref={index === 0 ? firstRef : undefined}
          key={hex}
          type="button"
          title={`${title}: ${label}`}
          aria-label={`${title}: ${label}`}
          aria-pressed={active === hex}
          style={{ background: hex }}
          className="size-7 rounded-sm border border-border cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary aria-pressed:ring-2 aria-pressed:ring-primary aria-pressed:ring-offset-1"
          onClick={() => {
            // Preserve the editor selection while the dialog owns DOM focus.
            if (section === 'text') {
              if (active === hex) editor.chain().unsetColor().run()
              else editor.chain().setColor(hex).run()
            } else if (active === hex) editor.chain().unsetHighlight().run()
            else editor.chain().setHighlight({ color: hex }).run()
            onClose()
          }}
        />)}
      </div>
    </fieldset>)}
  </DialogContent>
}

// ── LineHeightMenu ────────────────────────────────────────────────────────────
interface LineHeightMenuProps {
  editor: Editor
  activeLineHeight: string | null
}

function LineHeightMenu({ editor, activeLineHeight }: LineHeightMenuProps) {
  const [customValue, setCustomValue] = useState('')
  const [customOpen, setCustomOpen] = useState(false)
  const [customError, setCustomError] = useState('')
  const inputId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function applyCustom() {
    const n = Number(customValue)
    if (!customValue.trim() || !Number.isFinite(n) || n < 0.5 || n > 10) {
      setCustomError('Enter a line spacing between 0.5 and 10.')
      inputRef.current?.focus()
      return
    }
    editor.chain().setLineHeight(String(n)).run()
    setCustomOpen(false)
  }

  return <>
    <DropdownMenu>
      <DropdownMenuTrigger
        ref={triggerRef}
        className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary inline-flex items-center justify-between h-8 px-2 text-xs min-w-[52px] rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground gap-1"
        title="Line spacing"
        aria-label={`Line spacing: ${activeLineHeight ?? 'Default'}`}
      >
        <span aria-hidden="true">↕</span>
        <span>{activeLineHeight ?? 'Default'}</span>
        <span aria-hidden="true" className="opacity-50">▾</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-[120px] w-auto">
        <DropdownMenuRadioGroup value={activeLineHeight ?? 'default'} onValueChange={value => {
          if (value === 'default') editor.chain().focus().unsetLineHeight().run()
          else editor.chain().focus().setLineHeight(value).run()
        }}>
          <DropdownMenuRadioItem value="default" closeOnClick>Default</DropdownMenuRadioItem>
          {LINE_HEIGHTS.map(lh => <DropdownMenuRadioItem key={lh} value={lh} closeOnClick>{lh}</DropdownMenuRadioItem>)}
        </DropdownMenuRadioGroup>
        <DropdownMenuItem onClick={() => {
          setCustomValue(activeLineHeight ?? '')
          setCustomError('')
          setCustomOpen(true)
        }}>Custom…</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <Dialog open={customOpen} onOpenChange={setCustomOpen}>
      <DialogContent initialFocus={inputRef} finalFocus={triggerRef}>
        <DialogHeader>
          <DialogTitle>Custom line spacing</DialogTitle>
          <DialogDescription id={`${inputId}-help`}>Enter a value between 0.5 and 10.</DialogDescription>
        </DialogHeader>
        <Label htmlFor={inputId}>Line spacing</Label>
        <Input ref={inputRef} id={inputId} type="number" min={0.5} max={10} step="any"
          value={customValue} aria-invalid={!!customError}
          aria-describedby={[`${inputId}-help`, customError ? `${inputId}-error` : undefined].filter(Boolean).join(' ')}
          onChange={event => setCustomValue(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); applyCustom() } }} />
        {customError && <p id={`${inputId}-error`} role="alert" className="text-sm text-destructive">{customError}</p>}
        <Button type="button" onClick={applyCustom}>Apply spacing</Button>
      </DialogContent>
    </Dialog>
  </>
}

// ── Toolbar ───────────────────────────────────────────────────────────────────
export function Toolbar({ editor, onImage }: ToolbarProps) {
  const [colorPanelOpen, setColorPanelOpen] = useState(false)
  const colorTriggerRef = useRef<HTMLButtonElement | null>(null)
  const [initialSection, setInitialSection] = useState<'text' | 'highlight'>('text')
  const colorPanelId = useId()
  // Subscribe only to values displayed by the toolbar, including selection changes.
  useEditorState({ editor, selector: ({ editor }) => ({
    marks: ['bold', 'italic', 'underline', 'strike', 'subscript', 'superscript', 'link', 'highlight'].map(mark => editor.isActive(mark)),
    blocks: ['bulletList', 'orderedList', 'taskList', 'blockquote', 'codeBlock'].map(block => editor.isActive(block)),
    heading: getHeadingLabel(editor),
    alignment: editor.getAttributes('paragraph').textAlign ?? editor.getAttributes('heading').textAlign,
    color: editor.getAttributes('textStyle').color,
    highlight: editor.getAttributes('highlight').color,
    lineHeight: editor.getAttributes('paragraph').lineHeight ?? editor.getAttributes('heading').lineHeight,
  }) })

  function addLink() {
    const url = window.prompt('Enter URL')
    if (url) editor.chain().focus().setLink({ href: url }).run()
  }


  const activeLineHeight =
    editor.getAttributes('paragraph').lineHeight ??
    editor.getAttributes('heading').lineHeight ??
    null

  const activeColor = editor.getAttributes('textStyle').color ?? '#000000'
  const activeHighlight = editor.getAttributes('highlight').color ?? '#fef9c3'
  const highlightLabel = editor.isActive('highlight') ? activeHighlight : 'none'

  return (
    <fieldset aria-label="Content formatting" className="min-w-0 flex flex-wrap items-center gap-1 p-2 border-b bg-muted/30">

      {/* Group 1: Heading dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger aria-label={`Paragraph style: ${getHeadingLabel(editor)}`} className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary inline-flex items-center justify-between h-8 px-2 text-xs min-w-[90px] rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground">
          {getHeadingLabel(editor)}
          <span aria-hidden="true" className="ml-1 opacity-50">▾</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="min-w-[140px] w-auto">
          <DropdownMenuRadioGroup value={getHeadingLabel(editor)} onValueChange={value => HEADING_OPTIONS.find(option => option.label === value)?.action(editor)}>
            {HEADING_OPTIONS.map(({ label }) => <DropdownMenuRadioItem key={label} value={label} closeOnClick>{label}</DropdownMenuRadioItem>)}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* Group 2: Inline formatting */}
      {[
        { icon: Bold, action: () => editor.chain().focus().toggleBold().run(), isActive: editor.isActive('bold'), title: 'Bold' },
        { icon: Italic, action: () => editor.chain().focus().toggleItalic().run(), isActive: editor.isActive('italic'), title: 'Italic' },
        { icon: Underline, action: () => editor.chain().focus().toggleUnderline().run(), isActive: editor.isActive('underline'), title: 'Underline' },
        { icon: Strikethrough, action: () => editor.chain().focus().toggleStrike().run(), isActive: editor.isActive('strike'), title: 'Strikethrough' },
      ].map(({ icon: Icon, action, isActive, title }) => (
        <Button key={title} type="button" variant={isActive ? 'secondary' : 'ghost'} size="sm" className="h-8 w-8 p-0" onClick={action} title={title} aria-label={title} aria-pressed={isActive}>
          <Icon className="h-4 w-4" />
        </Button>
      ))}
      {/* Subscript / Superscript as compact text buttons */}
      <Button type="button" variant={editor.isActive('subscript') ? 'secondary' : 'ghost'} size="sm" className="h-8 w-8 p-0 text-xs" onClick={() => editor.chain().focus().toggleSubscript().run()} title="Subscript" aria-label="Subscript" aria-pressed={editor.isActive('subscript')}>
        X<sub>2</sub>
      </Button>
      <Button type="button" variant={editor.isActive('superscript') ? 'secondary' : 'ghost'} size="sm" className="h-8 w-8 p-0 text-xs" onClick={() => editor.chain().focus().toggleSuperscript().run()} title="Superscript" aria-label="Superscript" aria-pressed={editor.isActive('superscript')}>
        X<sup>2</sup>
      </Button>

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* Both color controls open the same keyboard-operable palette. */}
      <Dialog open={colorPanelOpen} onOpenChange={setColorPanelOpen}>
        <div className="flex items-center">
          {(['text', 'highlight'] as const).map(section => <Button
            key={section}
            type="button"
            variant="ghost"
            size="sm"
            title={section === 'text' ? 'Text color' : 'Highlight'}
            aria-label={section === 'text' ? `Text color: ${activeColor}` : `Highlight: ${highlightLabel}`}
            aria-haspopup="dialog"
            aria-expanded={colorPanelOpen && initialSection === section}
            aria-controls={colorPanelOpen ? colorPanelId : undefined}
            className="h-8 px-1.5 flex flex-col items-center justify-center gap-0.5"
            onClick={event => {
              colorTriggerRef.current = event.currentTarget
              setInitialSection(section)
              setColorPanelOpen(true)
            }}
          >
            <span aria-hidden="true" className="text-xs font-semibold leading-none" style={section === 'highlight' ? { background: activeHighlight, padding: '0 2px', borderRadius: 2 } : undefined}>A</span>
            <span aria-hidden="true" className="block h-0.5 w-4 rounded-sm" style={{ background: section === 'text' ? activeColor : activeHighlight }} />
          </Button>)}
        </div>
        {colorPanelOpen && <ColorPanel editor={editor} triggerRef={colorTriggerRef} initialSection={initialSection} id={colorPanelId} onClose={() => setColorPanelOpen(false)} />}
      </Dialog>

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* Group 4: Alignment */}
      {[
        { icon: AlignLeft, align: 'left', title: 'Align Left' },
        { icon: AlignCenter, align: 'center', title: 'Align Center' },
        { icon: AlignRight, align: 'right', title: 'Align Right' },
        { icon: AlignJustify, align: 'justify', title: 'Justify' },
      ].map(({ icon: Icon, align, title }) => (
        <Button key={align} type="button" variant={editor.isActive({ textAlign: align }) ? 'secondary' : 'ghost'} size="sm" className="h-8 w-8 p-0" onClick={() => editor.chain().focus().setTextAlign(align).run()} title={title} aria-label={title} aria-pressed={editor.isActive({ textAlign: align })}>
          <Icon className="h-4 w-4" />
        </Button>
      ))}

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* Group 5: Blocks */}
      {[
        { icon: List, action: () => editor.chain().focus().toggleBulletList().run(), isActive: editor.isActive('bulletList'), title: 'Bullet List' },
        { icon: ListOrdered, action: () => editor.chain().focus().toggleOrderedList().run(), isActive: editor.isActive('orderedList'), title: 'Ordered List' },
        { icon: ListTodo, action: () => editor.chain().focus().toggleTaskList().run(), isActive: editor.isActive('taskList'), title: 'Task List' },
        { icon: Quote, action: () => editor.chain().focus().toggleBlockquote().run(), isActive: editor.isActive('blockquote'), title: 'Blockquote' },
        { icon: Code, action: () => editor.chain().focus().toggleCodeBlock().run(), isActive: editor.isActive('codeBlock'), title: 'Code Block' },
      ].map(({ icon: Icon, action, isActive, title }) => (
        <Button key={title} type="button" variant={isActive ? 'secondary' : 'ghost'} size="sm" className="h-8 w-8 p-0" onClick={action} title={title} aria-label={title} aria-pressed={isActive}>
          <Icon className="h-4 w-4" />
        </Button>
      ))}

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* Group 6: Insert */}
      <Button type="button" variant={editor.isActive('link') ? 'secondary' : 'ghost'} size="sm" className="h-8 w-8 p-0" onClick={addLink} title="Link" aria-label="Link" aria-pressed={editor.isActive('link')}>
        <Link className="h-4 w-4" />
      </Button>
      <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onImage} title="Insert or edit image" aria-label="Insert or edit image">
        <ImageIcon className="h-4 w-4" />
      </Button>
      <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Horizontal Rule" aria-label="Insert horizontal rule">
        <Minus className="h-4 w-4" />
      </Button>

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* Group 7: Line height dropdown */}
      <LineHeightMenu editor={editor} activeLineHeight={activeLineHeight} />

    </fieldset>
  )
}
