import { useEffect, useState } from 'react'
import { useConfigStore } from '../store/config'
import {
  clearSelection,
  pasteWidgets,
  redo,
  removeWidgets,
  saveDraft,
  selectAll,
  setDashSettingsOpen,
  setPaletteOpen,
  startEditing,
  stopEditing,
  undo,
  useEditorStore,
} from '../store/editor'
import {
  getClipboard,
  parseClipboard,
  serializeClipboard,
  setClipboard,
  setInAppClipboard,
  toClipboardWidget,
  useClipboardStore,
} from '../store/clipboard'
import { isLoggedIn } from '../api/auth'
import { useKioskMode } from '../store/kiosk'
import { Grid } from '../components/Grid'
import { EditableGrid } from '../components/EditableGrid'
import { SettingsPanel } from '../editor/SettingsPanel'
import { DashboardSettingsPanel } from '../editor/DashboardSettingsPanel'
import { PaletteSheet } from '../editor/PaletteSheet'
import { SignInSheet } from '../editor/SignInSheet'
import { NavButton } from './Sidebar'

/** True when the keyboard focus is in a text field, so shortcuts must not fire. */
function isTyping(): boolean {
  const el = document.activeElement as HTMLElement | null
  return (
    !!el &&
    (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
  )
}

export function DashboardView({ id }: { id: string }) {
  // subscribed, not read once: a save, an import or a reload replaces the stored dashboard, and
  // the view must follow it on its own rather than relying on an editor render to carry it in.
  const saved = useConfigStore((s) => s.dashboards.find((d) => d.id === id))
  const editor = useEditorStore()
  const clipboardCount = useClipboardStore((s) => s.widgets.length)
  const kiosk = useKioskMode()
  const [signInOpen, setSignInOpen] = useState(false)

  const editing = editor.editing && editor.draft?.id === id
  const dashboard = editing ? editor.draft! : saved
  const selectedIds = editor.selectedIds
  // The settings panel is for one widget at a time, and only when the selection was an explicit
  // single-select (panelOpen). Ctrl/Shift-click, marquee and long-press never open it, even at
  // selection size 1 — they signal multi-select intent.
  const selected =
    editing && editor.panelOpen && selectedIds.length === 1
      ? editor.draft!.widgets.find((w) => w.id === selectedIds[0])
      : undefined

  // Leave edit mode if the route changes away mid-edit.
  useEffect(() => {
    return () => {
      if (useEditorStore.getState().editing) stopEditing()
    }
  }, [id])

  // Editing keyboard shortcuts: undo/redo, delete, select-all, deselect. Copy/cut/paste ride the
  // browser's native clipboard events instead (below), so Ctrl+C/Ctrl+V behave like anywhere.
  useEffect(() => {
    if (!editing) return
    const onKey = (e: KeyboardEvent) => {
      if (isTyping()) return
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      if (mod && key === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (mod && key === 'a') {
        e.preventDefault()
        selectAll()
      } else if (key === 'delete' || key === 'backspace') {
        const ids = useEditorStore.getState().selectedIds
        if (ids.length === 0) return
        e.preventDefault()
        removeWidgets(ids)
      } else if (key === 'escape') {
        if (useEditorStore.getState().selectedIds.length === 0) return
        e.preventDefault()
        clearSelection()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editing])

  // Native clipboard: Ctrl+C / Ctrl+X / Ctrl+V (and the menu equivalents) copy, cut, and paste
  // widgets. Writing/reading via the event's clipboardData is synchronous and prompt-free, and
  // the tagged JSON lets a widget be pasted into another tab or window too.
  useEffect(() => {
    if (!editing) return
    const selectedWidgets = () => {
      const s = useEditorStore.getState()
      if (!s.draft) return []
      const set = new Set(s.selectedIds)
      return s.draft.widgets.filter((w) => set.has(w.id)).map(toClipboardWidget)
    }
    const onCopy = (e: ClipboardEvent) => {
      if (isTyping()) return
      const items = selectedWidgets()
      if (items.length === 0) return
      e.preventDefault()
      setInAppClipboard(items)
      e.clipboardData?.setData('text/plain', serializeClipboard(items))
    }
    const onCut = (e: ClipboardEvent) => {
      if (isTyping()) return
      const items = selectedWidgets()
      if (items.length === 0) return
      e.preventDefault()
      setInAppClipboard(items)
      e.clipboardData?.setData('text/plain', serializeClipboard(items))
      removeWidgets(useEditorStore.getState().selectedIds)
    }
    const onPaste = (e: ClipboardEvent) => {
      if (isTyping()) return
      const text = e.clipboardData?.getData('text/plain') ?? ''
      const items = parseClipboard(text) ?? getClipboard()
      if (items.length === 0) return
      e.preventDefault()
      pasteWidgets(items)
    }
    document.addEventListener('copy', onCopy)
    document.addEventListener('cut', onCut)
    document.addEventListener('paste', onPaste)
    return () => {
      document.removeEventListener('copy', onCopy)
      document.removeEventListener('cut', onCut)
      document.removeEventListener('paste', onPaste)
    }
  }, [editing])

  if (!dashboard) {
    return (
      <div className="nh-dash">
        <header className="nh-dash__bar">
          <NavButton />
          <span className="nh-dash__title">Not found</span>
        </header>
        <p className="nh-dash__empty">Dashboard “{id}” does not exist.</p>
      </div>
    )
  }

  const enterEdit = () => {
    if (isLoggedIn()) startEditing(dashboard)
    else setSignInOpen(true)
  }

  const cancel = () => {
    if (editor.dirty && !window.confirm('Discard all unsaved changes?')) return
    stopEditing()
  }

  // Toolbar/touch equivalents of the clipboard shortcuts (button clicks are a user gesture, so
  // these can also mirror to the OS clipboard).
  const copySelected = () => {
    const s = useEditorStore.getState()
    if (!s.draft || s.selectedIds.length === 0) return
    const set = new Set(s.selectedIds)
    setClipboard(s.draft.widgets.filter((w) => set.has(w.id)).map(toClipboardWidget))
  }
  const cutSelected = () => {
    copySelected()
    removeWidgets(useEditorStore.getState().selectedIds)
  }
  const deleteSelected = () => removeWidgets(useEditorStore.getState().selectedIds)
  const pasteClipboard = () => {
    const items = getClipboard()
    if (items.length > 0) pasteWidgets(items)
  }

  return (
    <div className="nh-dash">
      {/* Kiosk mode is a full-screen dashboard: no header at all (edit mode cannot start while
          it is on, but a draft in progress keeps its toolbar if kiosk flips mid-edit). */}
      {kiosk && !editing ? null : (
      <header className="nh-dash__bar">
        {editing ? (
          <>
            <span className="nh-dash__title">Editing — {dashboard.name}</span>
            <span className="nh-dash__spacer" />
            <button
              className="nh-iconbtn"
              onClick={() => setDashSettingsOpen(true)}
              aria-label="Dashboard settings"
              title="Dashboard settings"
            >
              ⚙
            </button>
            <button className="nh-iconbtn" onClick={() => setPaletteOpen(true)} aria-label="Add widget" title="Add widget">
              +
            </button>
            <button
              className="nh-iconbtn"
              onClick={undo}
              disabled={editor.undoStack.length === 0}
              aria-label="Undo"
              title="Undo (Ctrl+Z)"
            >
              ↩
            </button>
            <button
              className="nh-iconbtn"
              onClick={redo}
              disabled={editor.redoStack.length === 0}
              aria-label="Redo"
              title="Redo (Ctrl+Shift+Z)"
            >
              ↪
            </button>
            <button className="nh-btn nh-btn--ghost" onClick={cancel}>
              Cancel
            </button>
            <button
              className="nh-btn nh-btn--primary"
              onClick={() => void saveDraft()}
              disabled={!editor.dirty || editor.saving}
              title="Save changes and exit edit mode"
            >
              {editor.saving ? 'Saving…' : 'Save'}
            </button>
          </>
        ) : (
          <>
            <NavButton />
            <span className="nh-dash__title">{dashboard.name}</span>
            <span className="nh-dash__spacer" />
            <button className="nh-iconbtn" onClick={enterEdit} aria-label="Edit dashboard" title="Edit dashboard">
              ✎
            </button>
          </>
        )}
      </header>
      )}

      {/* Contextual selection/clipboard actions (also the touch path — no Ctrl keys there). */}
      {editing && (selectedIds.length > 0 || clipboardCount > 0) ? (
        <div className="nh-selbar" role="toolbar" aria-label="Selection actions">
          {selectedIds.length > 0 ? (
            <>
              <span className="nh-selbar__count">
                {selectedIds.length} widget{selectedIds.length === 1 ? '' : 's'} selected
              </span>
              <button className="nh-btn nh-btn--ghost" onClick={copySelected}>
                Copy
              </button>
              <button className="nh-btn nh-btn--ghost" onClick={cutSelected}>
                Cut
              </button>
              <button className="nh-btn nh-btn--danger" onClick={deleteSelected}>
                Delete
              </button>
              <button className="nh-btn nh-btn--ghost" onClick={clearSelection}>
                Deselect
              </button>
            </>
          ) : null}
          {clipboardCount > 0 ? (
            <button className="nh-btn nh-btn--ghost" onClick={pasteClipboard}>
              Paste{selectedIds.length === 0 ? ` ${clipboardCount}` : ''}
            </button>
          ) : null}
        </div>
      ) : null}

      {editing && editor.saveError ? (
        <div className="nh-dash__error">Save failed: {editor.saveError} — are you signed in as an administrator?</div>
      ) : null}

      <div
        className={
          'nh-dash__surface' +
          (editing && (selected || editor.dashSettingsOpen) ? ' nh-dash__surface--panel' : '')
        }
      >
        {editing ? <EditableGrid dashboard={dashboard} /> : <Grid dashboard={dashboard} />}
        {editing ? (
          <p className="nh-dash__edithint">
            Drag by the handle · tap to configure · Ctrl/Cmd- or Shift-click, drag a box, or long-press to
            select several · Ctrl+C / Ctrl+V to copy and paste
          </p>
        ) : null}
      </div>

      {editing && selected ? <SettingsPanel key={selected.id} widget={selected} /> : null}
      {editing && !selected && editor.dashSettingsOpen ? <DashboardSettingsPanel dashboard={dashboard} /> : null}
      {editing && editor.paletteOpen ? <PaletteSheet /> : null}
      {signInOpen ? (
        <SignInSheet
          onClose={() => setSignInOpen(false)}
          onToken={() => {
            setSignInOpen(false)
            startEditing(dashboard)
          }}
        />
      ) : null}
    </div>
  )
}
