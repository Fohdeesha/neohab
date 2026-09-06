import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useConfigStore } from '../store/config'
import {
  clearSelection,
  pasteWidgets,
  redo,
  removeWidgets,
  saveDraft,
  selectAll,
  setDashSettingsOpen,
  setEditBreakpoint,
  setPaletteOpen,
  startEditing,
  stopEditing,
  undo,
  useEditorStore
} from '../store/editor'
import {
  getClipboard,
  parseClipboard,
  serializeClipboard,
  setClipboard,
  setInAppClipboard,
  toClipboardWidget,
  useClipboardStore
} from '../store/clipboard'
import { editingAllowed, useEditingAllowed } from '../store/auth'
import { useKioskMode } from '../store/kiosk'
import { Grid } from '../components/Grid'
import { EditableGrid } from '../components/EditableGrid'
import { anySheetOpen } from '../components/Sheet'
import { useCoarsePointer } from '../components/useCoarsePointer'
import { useGridEditSurface, useSidePanelDocked } from '../components/useEditSurface'
import { useContainerWidth } from '../components/useContainerWidth'
import { widgetsOf, editZoom } from '../model/layout'
import { navigate } from './router'
import i18n from '../i18n'
import { useBackgroundStyle } from '../components/useBackground'
import { SettingsPanel } from '../editor/SettingsPanel'
import { DashboardSettingsPanel } from '../editor/DashboardSettingsPanel'
import { PaletteSheet } from '../editor/PaletteSheet'
import { SignInSheet } from '../editor/SignInSheet'
import { NavButton } from './Sidebar'
import { VoiceButton } from '../audio/VoiceButton'

function isTyping(): boolean {
  const el = document.activeElement as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

export function DashboardView({ id }: { id: string }) {
  const { t } = useTranslation()
  const saved = useConfigStore((s) => s.dashboards.find((d) => d.id === id))
  const authRequired = useConfigStore((s) => s.authRequired)
  const editor = useEditorStore()
  const gridSurface = useGridEditSurface()
  const clipboardCount = useClipboardStore((s) => s.widgets.length)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const surfaceWidth = useContainerWidth(surfaceRef)
  const panelDocked = useSidePanelDocked()
  const kiosk = useKioskMode()
  const canEdit = useEditingAllowed()
  const [signInOpen, setSignInOpen] = useState(false)
  const [retryAfterSignIn, setRetryAfterSignIn] = useState(false)
  const coarse = useCoarsePointer()

  const editing = editor.editing && editor.draft?.id === id
  const dashboard = editing ? editor.draft! : saved
  const backgroundStyle = useBackgroundStyle(dashboard)
  const selectedIds = editor.selectedIds
  const selected =
    editing && editor.panelOpen && selectedIds.length === 1 ? editor.draft!.widgets.find((w) => w.id === selectedIds[0]) : undefined

  const panelOpen = editing && !!(selected || editor.dashSettingsOpen)
  const zoom = editZoom(surfaceWidth, panelOpen && panelDocked)

  // asked AFTER the navigation: window.confirm inside the route change wedges a dialog into a navigation nothing
  // can finish
  useEffect(() => {
    return () => {
      const s = useEditorStore.getState()
      if (!s.editing) return
      if (!s.dirty) {
        stopEditing()
        return
      }
      setTimeout(() => {
        if (!useEditorStore.getState().editing) return
        if (window.confirm(i18n.t('Discard all unsaved changes?'))) stopEditing()
        else navigate({ name: 'dashboard', id })
      }, 0)
    }
  }, [id])

  useEffect(() => {
    if (!editing) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!useEditorStore.getState().dirty) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [editing])

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
        if (anySheetOpen() || e.defaultPrevented) return
        const s = useEditorStore.getState()
        e.preventDefault()
        if (s.selectedIds.length > 0) clearSelection()
        else if (!s.dirty || window.confirm(t('Discard all unsaved changes?'))) stopEditing()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editing, t])

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
          <span className="nh-dash__title">{authRequired ? t('Sign in') : t('Not found')}</span>
        </header>
        {authRequired ? (
          <div className="nh-dash__empty">
            <p>{t('This openHAB server needs you to sign in before it will show anything.')}</p>
            <button type="button" className="nh-btn nh-btn--primary" onClick={() => setSignInOpen(true)}>
              {t('Sign in')}
            </button>
          </div>
        ) : (
          <p className="nh-dash__empty">{t('Dashboard “{{id}}” does not exist.', { id })}</p>
        )}
        {signInOpen ? <SignInSheet reason="view" onClose={() => setSignInOpen(false)} onToken={() => setSignInOpen(false)} /> : null}
      </div>
    )
  }

  const enterEdit = () => {
    if (editingAllowed()) startEditing(dashboard)
    else setSignInOpen(true)
  }

  const cancel = () => {
    if (editor.dirty && !window.confirm(t('Discard all unsaved changes?'))) return
    stopEditing()
  }

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
    <div className="nh-dash" style={backgroundStyle}>
      {/* Kiosk mode is a full-screen dashboard: no header at all (edit mode cannot start while
          it is on, but a draft in progress keeps its toolbar if kiosk flips mid-edit). */}
      {kiosk && !editing ? null : (
        <header className="nh-dash__bar">
          {editing ? (
            <>
              <span className="nh-dash__title">{t('Editing - {{name}}', { name: dashboard.name })}</span>
              <span className="nh-dash__spacer" />
              {gridSurface ? (
                <button
                  className={'nh-btn nh-btn--ghost nh-bpswitch' + (editor.bp === 'md' ? ' nh-bpswitch--md' : '')}
                  onClick={() => setEditBreakpoint(editor.bp === 'lg' ? 'md' : 'lg')}
                  title={t(
                    'Switch between the desktop layout and a separate tablet layout. Tablets use it below 1200px wide; without one they show the desktop layout.'
                  )}>
                  {editor.bp === 'md' ? t('Tablet layout') : t('Desktop layout')}
                </button>
              ) : null}
              <button
                className="nh-iconbtn"
                onClick={() => setDashSettingsOpen(true)}
                aria-label={t('Dashboard settings')}
                title={t('Dashboard settings')}>
                ⚙
              </button>
              <button className="nh-iconbtn" onClick={() => setPaletteOpen(true)} aria-label={t('Add widget')} title={t('Add widget')}>
                +
              </button>
              <button
                className="nh-iconbtn"
                onClick={undo}
                disabled={editor.undoStack.length === 0}
                aria-label={t('Undo')}
                title={t('Undo (Ctrl+Z)')}>
                ↩
              </button>
              <button
                className="nh-iconbtn"
                onClick={redo}
                disabled={editor.redoStack.length === 0}
                aria-label={t('Redo')}
                title={t('Redo (Ctrl+Shift+Z)')}>
                ↪
              </button>
              <button className="nh-btn nh-btn--ghost" onClick={cancel} title={t('Exit edit mode, Esc (unsaved changes are discarded)')}>
                {t('Exit')}
              </button>
              <button
                className="nh-btn nh-btn--primary"
                onClick={() => void saveDraft()}
                disabled={!editor.dirty || editor.saving}
                title={t('Save changes and exit edit mode')}>
                {editor.saving ? t('Saving…') : t('Save')}
              </button>
            </>
          ) : (
            <>
              <NavButton />
              <span className="nh-dash__title">{dashboard.name}</span>
              <span className="nh-dash__spacer" />
              <VoiceButton />
              {canEdit ? (
                <button className="nh-iconbtn" onClick={enterEdit} aria-label={t('Edit dashboard')} title={t('Edit dashboard')}>
                  ✎
                </button>
              ) : null}
            </>
          )}
        </header>
      )}

      {/* Contextual selection/clipboard actions (also the touch path - no Ctrl keys there). */}
      {editing && (selectedIds.length > 0 || clipboardCount > 0) ? (
        <div className="nh-selbar" role="toolbar" aria-label={t('Selection actions')}>
          {selectedIds.length > 0 ? (
            <>
              <span className="nh-selbar__count">{t('{{count}} widgets selected', { count: selectedIds.length })}</span>
              <button className="nh-btn nh-btn--ghost" onClick={copySelected}>
                {t('Copy')}
              </button>
              <button className="nh-btn nh-btn--ghost" onClick={cutSelected}>
                {t('Cut')}
              </button>
              <button className="nh-btn nh-btn--danger" onClick={deleteSelected}>
                {t('Delete')}
              </button>
              <button className="nh-btn nh-btn--ghost" onClick={clearSelection}>
                {t('Deselect')}
              </button>
            </>
          ) : null}
          {clipboardCount > 0 ? (
            <button className="nh-btn nh-btn--ghost" onClick={pasteClipboard}>
              {t('Paste')}
              {selectedIds.length === 0 ? ` ${clipboardCount}` : ''}
            </button>
          ) : null}
        </div>
      ) : null}

      {/* A refusal for want of credentials is not a dead end: the draft is still here, so offer
          the sign-in and save again afterwards rather than leaving Exit as the only button. */}
      {editing && editor.saveError ? (
        <div className="nh-dash__error">
          <span>{t('Save failed: {{error}}', { error: editor.saveError })}</span>
          {editor.saveNeedsAuth ? (
            <button
              type="button"
              className="nh-btn nh-btn--primary"
              onClick={() => {
                setRetryAfterSignIn(true)
                setSignInOpen(true)
              }}>
              {t('Sign in and save')}
            </button>
          ) : null}
        </div>
      ) : null}

      <div ref={surfaceRef} className={'nh-dash__surface' + (panelOpen ? ' nh-dash__surface--panel' : '')}>
        {editing ? (
          <div className="nh-editzoom" style={{ '--nh-editzoom': zoom } as React.CSSProperties}>
            <EditableGrid dashboard={dashboard} />
          </div>
        ) : (
          <Grid dashboard={dashboard} />
        )}
        {/* The hint describes the gestures this device actually has. A dashboard with nothing on
            it yet has a different first step from one being rearranged, and telling a phone about
            Ctrl+C was the palette hint's mistake one line further down. */}
        {editing ? (
          <p className="nh-dash__edithint">
            {widgetsOf(dashboard).length === 0
              ? t('Nothing here yet - press + in the bar above to add your first widget.')
              : coarse
                ? t('Drag by the handle · tap to configure · long-press to select several')
                : t(
                    'Drag by the handle · tap to configure · Ctrl/Cmd- or Shift-click, drag a box, or long-press to select several · Ctrl+C / Ctrl+V to copy and paste'
                  )}
          </p>
        ) : null}
      </div>

      {editing && selected ? <SettingsPanel key={selected.id} widget={selected} /> : null}
      {editing && !selected && editor.dashSettingsOpen ? <DashboardSettingsPanel dashboard={dashboard} /> : null}
      {editing && editor.paletteOpen ? <PaletteSheet /> : null}
      {signInOpen ? (
        <SignInSheet
          onClose={() => {
            setSignInOpen(false)
            setRetryAfterSignIn(false)
          }}
          onToken={() => {
            setSignInOpen(false)
            if (retryAfterSignIn) {
              setRetryAfterSignIn(false)
              void saveDraft()
            } else startEditing(dashboard)
          }}
        />
      ) : null}
    </div>
  )
}
