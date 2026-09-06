import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PresetBridgeFields } from '../../components/PresetBridgeFields'
import { parseHsb } from '../../model/color'
import { commandForState, commandKind, type Preset, type PresetLight, type StatusState } from '../../model/presets'
import { subscribeItems, useItemsStore } from '../../store/items'
import { ColorSliders } from '../color/ColorSliders'
import type { FloorplanLight } from './model'

export function PresetEdit({
  preset,
  bridged,
  planLights,
  busy,
  onCancel,
  onSave
}: {
  preset: Preset
  bridged: boolean
  planLights: FloorplanLight[]
  busy: boolean
  onCancel: () => void
  onSave: (next: Preset, bridge: boolean) => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState(preset.name)
  const [lights, setLights] = useState<PresetLight[]>(preset.lights)
  const [statusItem, setStatusItem] = useState(preset.statusItem ?? '')
  const [statusState, setStatusState] = useState<StatusState>(preset.statusState ?? 'ON')
  const [bridge, setBridge] = useState(bridged)
  const [adding, setAdding] = useState('')

  const itemsKey = JSON.stringify([...new Set([...lights.map((l) => l.item), ...planLights.map((l) => l.item)])])
  const itemNames = useMemo(() => JSON.parse(itemsKey) as string[], [itemsKey])
  useEffect(() => subscribeItems(itemNames), [itemNames])
  const states = useItemsStore((s) => s.states)

  const labelFor = (item: string) => planLights.find((l) => l.item === item)?.label ?? item
  const currentOf = (item: string) => commandForState(states[item]?.type, states[item]?.state)
  const setCommand = (i: number, command: string) => setLights((ls) => ls.map((l, n) => (n === i ? { ...l, command } : l)))

  const absent = planLights.filter((l) => !lights.some((x) => x.item === l.item))
  const addLight = () => {
    const command = currentOf(adding)
    if (!adding || command === null) return
    setLights([...lights, { item: adding, command }])
    setAdding('')
  }

  return (
    <div className="nh-pmgr__edit">
      <label className="nh-field">
        <span className="nh-field__label">{t('Name')}</span>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
      </label>

      <h3 className="nh-pmgr__h">{t('What this preset sets')}</h3>
      {lights.length === 0 ? <p className="nh-pmgr__none">{t('This preset sets no lights.')}</p> : null}
      <div className="nh-pmgr__lights">
        {lights.map((l, i) => (
          <div key={i} className="nh-pmgr__light">
            <div className="nh-pmgr__lighthead">
              <span className="nh-pmgr__lightname" title={l.item}>
                {labelFor(l.item)}
              </span>
              <button
                type="button"
                className="nh-btn nh-btn--ghost"
                disabled={currentOf(l.item) === null}
                title={currentOf(l.item) === null ? t('This light has no state to copy') : undefined}
                onClick={() => {
                  const cur = currentOf(l.item)
                  if (cur !== null) setCommand(i, cur)
                }}>
                {t('Copy from the light')}
              </button>
              <button
                type="button"
                className="nh-iconbtn"
                aria-label={t('Remove from this preset')}
                title={t('Remove from this preset')}
                onClick={() => setLights(lights.filter((_, n) => n !== i))}>
                ✕
              </button>
            </div>
            <ValueControl command={l.command} onChange={(v) => setCommand(i, v)} />
          </div>
        ))}
      </div>

      {absent.length > 0 ? (
        <div className="nh-pmgr__add">
          <select value={adding} aria-label={t('Add a light from the plan')} onChange={(e) => setAdding(e.target.value)}>
            <option value="">{t('Add a light from the plan…')}</option>
            {absent.map((l) => (
              <option key={l.id} value={l.item} disabled={currentOf(l.item) === null}>
                {(l.label ?? l.item) + (currentOf(l.item) === null ? ' - ' + t('no state') : '')}
              </option>
            ))}
          </select>
          <button type="button" className="nh-btn" disabled={!adding} onClick={addLight}>
            {t('Add')}
          </button>
        </div>
      ) : null}

      <h3 className="nh-pmgr__h">{t('Wall switch')}</h3>
      <PresetBridgeFields
        idPrefix={'pmgr-' + preset.uid}
        item={statusItem}
        state={statusState}
        bridge={bridge}
        onItem={setStatusItem}
        onState={setStatusState}
        onBridge={setBridge}
      />

      <div className="nh-form__footer">
        <button type="button" className="nh-btn nh-btn--ghost" onClick={onCancel}>
          {t('Cancel')}
        </button>
        <button
          type="button"
          className="nh-btn nh-btn--primary"
          disabled={busy || name.trim() === '' || lights.some((l) => l.command.trim() === '')}
          onClick={() =>
            onSave(
              {
                ...preset,
                name: name.trim(),
                lights,
                statusItem: statusItem || undefined,
                statusState: statusItem ? statusState : undefined
              },
              statusItem !== '' && bridge
            )
          }>
          {busy ? t('Saving…') : t('Save')}
        </button>
      </div>
    </div>
  )
}

function ValueControl({ command, onChange }: { command: string; onChange: (v: string) => void }) {
  const { t } = useTranslation()
  const kind = commandKind(command)

  if (kind === 'color') {
    const hsb = parseHsb(command)
    return (
      <ColorSliders hsb={hsb} onInput={(next) => onChange(`${Math.round(next.h) % 360},${Math.round(next.s)},${Math.round(next.b)}`)} />
    )
  }

  if (kind === 'level') {
    return (
      <div className="nh-slider">
        <input
          type="range"
          className="nh-slider__input"
          min={0}
          max={100}
          step={1}
          value={Number(command)}
          aria-label={t('Value')}
          onChange={(e) => onChange(e.target.value)}
        />
        <div className="nh-slider__value">{command}</div>
      </div>
    )
  }

  if (kind === 'onoff') {
    return (
      <div className="nh-fplan__onoff">
        <button type="button" className={'nh-btn' + (command === 'ON' ? ' nh-btn--primary' : '')} onClick={() => onChange('ON')}>
          {t('On')}
        </button>
        <button type="button" className={'nh-btn' + (command === 'OFF' ? ' nh-btn--primary' : '')} onClick={() => onChange('OFF')}>
          {t('Off')}
        </button>
      </div>
    )
  }

  return <input type="text" className="nh-pmgr__value" value={command} aria-label={t('Value')} onChange={(e) => onChange(e.target.value)} />
}
