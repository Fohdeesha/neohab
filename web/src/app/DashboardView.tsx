import { useEffect, useState } from 'react'
import { useConfigStore } from '../store/config'
import {
  redo,
  saveDraft,
  setDashSettingsOpen,
  setPaletteOpen,
  startEditing,
  stopEditing,
  undo,
  useEditorStore,
} from '../store/editor'
import { isLoggedIn } from '../api/auth'
import { Grid } from '../components/Grid'
import { EditableGrid } from '../components/EditableGrid'
import { SettingsPanel } from '../editor/SettingsPanel'
import { DashboardSettingsPanel } from '../editor/DashboardSettingsPanel'
import { PaletteSheet } from '../editor/PaletteSheet'
import { SignInSheet } from '../editor/SignInSheet'
import { NavButton } from './Sidebar'

export function DashboardView({ id }: { id: string }) {
  // subscribed, not read once: a save, an import or a reload replaces the stored dashboard, and
  // the view must follow it on its own rather than relying on an editor render to carry it in.
  const saved = useConfigStore((s) => s.dashboards.find((d) => d.id === id))
  const editor = useEditorStore()
  const [signInOpen, setSignInOpen] = useState(false)

  const editing = editor.editing && editor.draft?.id === id
  const dashboard = editing ? editor.draft! : saved
  const selected = editing ? editor.draft!.widgets.find((w) => w.id === editor.selectedId) : undefined

  // Leave edit mode if the route changes away mid-edit.
  useEffect(() => {
    return () => {
      if (useEditorStore.getState().editing) stopEditing()
    }
  }, [id])

  // Undo/redo keyboard shortcuts while editing.
  useEffect(() => {
    if (!editing) return
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA') return
      e.preventDefault()
      if (e.shiftKey) redo()
      else undo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
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

  const discard = () => {
    if (editor.dirty && !window.confirm('Discard all unsaved changes?')) return
    stopEditing()
  }

  return (
    <div className="nh-dash">
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
            <button className="nh-btn nh-btn--ghost" onClick={discard}>
              Discard
            </button>
            <button
              className="nh-btn nh-btn--primary"
              onClick={() => void saveDraft()}
              disabled={!editor.dirty || editor.saving}
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
            Drag widgets by their handle · tap to configure · hold over an occupied spot to bump it aside
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
