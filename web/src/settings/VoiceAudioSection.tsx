import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { saveSettings, useConfigStore } from '../store/config'
import { setAudioSettings, useAudioStore } from '../store/audio'
import { listVoices, onVoicesChanged, recognitionSupported, speak, ttsSupported } from '../audio/speech'
import { ItemPicker } from '../components/ItemPicker'
import { useEditingAllowed } from '../store/auth'
import type { NoticeFn } from '../store/notify'

export function VoiceAudioSection({ onNotice }: { onNotice: NoticeFn }) {
  const { t } = useTranslation()
  const audio = useAudioStore((s) => s.settings)
  const blocked = useAudioStore((s) => s.blocked)
  const speechItem = useConfigStore((s) => s.settings.speechItem) ?? ''
  const voiceButtonOn = useConfigStore((s) => s.settings.voiceButton !== false)
  const canEdit = useEditingAllowed()
  const [voices, setVoices] = useState(listVoices)
  useEffect(() => onVoicesChanged(() => setVoices(listVoices())), [])

  const speakOn = audio.speak !== false
  const voiceKnown = !audio.voice || voices.length === 0 || voices.some((v) => v.name === audio.voice)

  const setSpeechItem = async (name: string) => {
    onNotice(null)
    const err = await saveSettings({ speechItem: name || undefined })
    if (err) onNotice(t('Applied on this device, but saving failed: {{error}}', { error: err }))
  }

  const setVoiceButton = async (on: boolean) => {
    onNotice(null)
    const err = await saveSettings({ voiceButton: on ? undefined : false })
    if (err) onNotice(t('Applied on this device, but saving failed: {{error}}', { error: err }))
  }

  return (
    <section>
      <h2 className="nh-settings__h">{t('Voice & audio')}</h2>
      <p className="nh-settings__text">
        {t(
          'Every open dashboard is a speaker for openHAB’s Web Audio sink. This device’s own choices are here; the shared ones are at the bottom.'
        )}
      </p>

      <label className="nh-field nh-field--row" htmlFor="nh-set-playaudio">
        <span className="nh-field__label">{t('Play server audio on this device')}</span>
        <input
          id="nh-set-playaudio"
          type="checkbox"
          checked={audio.playAudio !== false}
          onChange={(e) => setAudioSettings({ playAudio: e.target.checked ? undefined : false })}
        />
      </label>

      <label className="nh-field nh-field--row" htmlFor="nh-set-speak">
        <span className="nh-field__label">{t('Speak announcements on this device')}</span>
        <input
          id="nh-set-speak"
          type="checkbox"
          checked={speakOn}
          disabled={!ttsSupported()}
          onChange={(e) => setAudioSettings({ speak: e.target.checked ? undefined : false })}
        />
      </label>
      {!ttsSupported() ? <p className="nh-settings__text">{t('This browser has no speech synthesis.')}</p> : null}
      {ttsSupported() && speakOn ? (
        <>
          <label className="nh-field" htmlFor="nh-set-voice">
            <span className="nh-field__label">{t('Voice on this device')}</span>
            <select id="nh-set-voice" value={audio.voice ?? ''} onChange={(e) => setAudioSettings({ voice: e.target.value || undefined })}>
              <option value="">{t('Browser default voice')}</option>
              {!voiceKnown ? <option value={audio.voice}>{audio.voice}</option> : null}
              {voices.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name + (v.lang ? ` (${v.lang})` : '')}
                </option>
              ))}
            </select>
          </label>
          <div className="nh-settings__row">
            <button
              type="button"
              className="nh-btn nh-btn--ghost"
              onClick={() => speak(t('This is the neohab voice on this device.'), audio.voice)}>
              {t('Test voice')}
            </button>
          </div>
        </>
      ) : null}

      {blocked ? <p className="nh-settings__text">{t('The browser is blocking sound until you tap the page once.')}</p> : null}

      {!recognitionSupported() ? (
        <p className="nh-settings__text">{t('The microphone button needs a Chromium browser and HTTPS.')}</p>
      ) : null}

      {canEdit ? (
        <>
          <label className="nh-field" htmlFor="nh-set-speechitem">
            <span className="nh-field__label">{t('Speech item (all devices)')}</span>
            <ItemPicker
              id="nh-set-speechitem"
              value={speechItem}
              onChange={(n) => void setSpeechItem(n)}
              itemTypes={['String']}
              placeholder={t('No speech item')}
            />
          </label>
          {speechItem ? (
            <div className="nh-settings__row">
              <button type="button" className="nh-btn nh-btn--ghost" onClick={() => void setSpeechItem('')}>
                {t('Clear speech item')}
              </button>
            </div>
          ) : null}
          <p className="nh-settings__text">
            {t('Anything a rule writes to this String item is spoken aloud. Each device picks its own voice above.')}
          </p>

          <label className="nh-field nh-field--row" htmlFor="nh-set-voicebtn">
            <span className="nh-field__label">{t('Voice input button (all devices)')}</span>
            <input id="nh-set-voicebtn" type="checkbox" checked={voiceButtonOn} onChange={(e) => void setVoiceButton(e.target.checked)} />
          </label>
          <p className="nh-settings__text">
            {t(
              'Puts a microphone in the dashboard header. What you say goes to openHAB’s interpreter, and its answer appears as a notice.'
            )}
          </p>
        </>
      ) : null}
    </section>
  )
}
