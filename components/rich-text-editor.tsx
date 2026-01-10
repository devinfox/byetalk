'use client'

import { useEditor, EditorContent, Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'
import { useState, useCallback, useEffect } from 'react'
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Link as LinkIcon,
  List,
  ListOrdered,
  ChevronDown,
  Variable,
} from 'lucide-react'
import { EMAIL_VARIABLES, EmailVariableGroup } from '@/lib/email-variables'

interface RichTextEditorProps {
  content: string
  onChange: (html: string) => void
  placeholder?: string
  className?: string
}

function MenuButton({
  onClick,
  isActive = false,
  disabled = false,
  children,
  title,
}: {
  onClick: () => void
  isActive?: boolean
  disabled?: boolean
  children: React.ReactNode
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-2 rounded-lg transition-all ${
        isActive
          ? 'bg-yellow-500/20 text-yellow-400'
          : 'text-gray-400 hover:text-white hover:bg-white/10'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      {children}
    </button>
  )
}

function VariableDropdown({
  editor,
  groups,
}: {
  editor: Editor | null
  groups: EmailVariableGroup[]
}) {
  const [isOpen, setIsOpen] = useState(false)

  const insertVariable = useCallback(
    (variable: string) => {
      if (editor) {
        editor.chain().focus().insertContent(variable).run()
      }
      setIsOpen(false)
    },
    [editor]
  )

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 px-3 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-all"
        title="Insert variable"
      >
        <Variable className="w-4 h-4" />
        <span className="text-sm">Variables</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute left-0 top-full mt-1 z-50 w-64 max-h-80 overflow-y-auto glass-card p-2">
            {groups.map((group) => (
              <div key={group.name} className="mb-2 last:mb-0">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-2 py-1">
                  {group.name}
                </div>
                {group.variables.map((variable) => (
                  <button
                    key={variable.key}
                    type="button"
                    onClick={() => insertVariable(variable.key)}
                    className="w-full text-left px-2 py-1.5 rounded-lg text-sm text-gray-300 hover:bg-white/10 hover:text-white transition-all"
                  >
                    <span className="font-medium">{variable.label}</span>
                    <span className="text-xs text-gray-500 ml-2">{variable.key}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function LinkModal({
  editor,
  isOpen,
  onClose,
}: {
  editor: Editor | null
  isOpen: boolean
  onClose: () => void
}) {
  const [url, setUrl] = useState('')

  useEffect(() => {
    if (isOpen && editor) {
      const previousUrl = editor.getAttributes('link').href || ''
      setUrl(previousUrl)
    }
  }, [isOpen, editor])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (editor) {
      if (url) {
        editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
      } else {
        editor.chain().focus().extendMarkRange('link').unsetLink().run()
      }
    }
    onClose()
  }

  if (!isOpen) return null

  return (
    <>
      <div className="fixed inset-0 z-50" onClick={onClose} />
      <div className="absolute left-0 top-full mt-1 z-50 glass-card p-3 w-72">
        <form onSubmit={handleSubmit}>
          <label className="block text-xs font-medium text-gray-400 mb-1">URL</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            className="glass-input w-full px-3 py-2 text-sm mb-2"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3 py-1.5 text-sm glass-button-gold rounded-lg"
            >
              {url ? 'Set Link' : 'Remove Link'}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}

function MenuBar({ editor }: { editor: Editor | null }) {
  const [showLinkModal, setShowLinkModal] = useState(false)

  if (!editor) return null

  return (
    <div className="flex items-center gap-1 p-2 border-b border-white/10 bg-white/5 rounded-t-xl flex-wrap">
      <MenuButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive('bold')}
        title="Bold (Ctrl+B)"
      >
        <Bold className="w-4 h-4" />
      </MenuButton>

      <MenuButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive('italic')}
        title="Italic (Ctrl+I)"
      >
        <Italic className="w-4 h-4" />
      </MenuButton>

      <MenuButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        isActive={editor.isActive('underline')}
        title="Underline (Ctrl+U)"
      >
        <UnderlineIcon className="w-4 h-4" />
      </MenuButton>

      <div className="w-px h-6 bg-white/10 mx-1" />

      <div className="relative">
        <MenuButton
          onClick={() => setShowLinkModal(true)}
          isActive={editor.isActive('link')}
          title="Add link"
        >
          <LinkIcon className="w-4 h-4" />
        </MenuButton>
        <LinkModal
          editor={editor}
          isOpen={showLinkModal}
          onClose={() => setShowLinkModal(false)}
        />
      </div>

      <div className="w-px h-6 bg-white/10 mx-1" />

      <MenuButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        isActive={editor.isActive('bulletList')}
        title="Bullet list"
      >
        <List className="w-4 h-4" />
      </MenuButton>

      <MenuButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        isActive={editor.isActive('orderedList')}
        title="Numbered list"
      >
        <ListOrdered className="w-4 h-4" />
      </MenuButton>

      <div className="w-px h-6 bg-white/10 mx-1" />

      <VariableDropdown editor={editor} groups={EMAIL_VARIABLES} />
    </div>
  )
}

export function RichTextEditor({
  content,
  onChange,
  placeholder = 'Write your email content...',
  className = '',
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        code: false,
        blockquote: false,
        horizontalRule: false,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-yellow-400 underline hover:text-yellow-300',
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    content,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
    editorProps: {
      attributes: {
        class:
          'prose prose-invert max-w-none p-4 min-h-[250px] focus:outline-none text-white',
      },
    },
  })

  // Update content when prop changes (for edit mode)
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content)
    }
  }, [content, editor])

  return (
    <div className={`border border-white/10 rounded-xl overflow-hidden bg-white/5 ${className}`}>
      <MenuBar editor={editor} />
      <div className="editor-content">
        <EditorContent editor={editor} />
      </div>
      <style jsx global>{`
        .editor-content .ProseMirror {
          min-height: 250px;
          padding: 1rem;
        }
        .editor-content .ProseMirror p.is-editor-empty:first-child::before {
          color: rgba(255, 255, 255, 0.3);
          content: attr(data-placeholder);
          float: left;
          height: 0;
          pointer-events: none;
        }
        .editor-content .ProseMirror p {
          margin-bottom: 0.75rem;
        }
        .editor-content .ProseMirror ul,
        .editor-content .ProseMirror ol {
          margin-left: 1.5rem;
          margin-bottom: 0.75rem;
        }
        .editor-content .ProseMirror li {
          margin-bottom: 0.25rem;
        }
        .editor-content .ProseMirror a {
          color: #facc15;
          text-decoration: underline;
        }
        .editor-content .ProseMirror a:hover {
          color: #fde047;
        }
      `}</style>
    </div>
  )
}

export default RichTextEditor
