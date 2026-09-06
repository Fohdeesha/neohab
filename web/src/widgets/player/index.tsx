import { useTranslation } from 'react-i18next'
import type { WidgetDefinition, WidgetProps } from '../types'
import { WidgetFrame } from '../common/WidgetFrame'
import type { ItemChoice } from '../common/itemControl'

interface PlayerConfig {
  item: string
  label?: string
}

/** Player - previous / play-pause / next transport controls for Player items. */
function PlayerWidget({ config, ctx }: WidgetProps<PlayerConfig>) {
  const { t } = useTranslation()
  const state = ctx.getItem(config.item)
  const playing = state?.state === 'PLAY'
  const send = (command: string) => {
    if (!ctx.editing && config.item) ctx.sendCommand(config.item, command)
  }

  return (
    <WidgetFrame label={config.label} center>
      <div className="nh-player">
        <button type="button" className="nh-player__btn" aria-label={t('Previous')} onClick={() => send('PREVIOUS')}>
          ⏮
        </button>
        <button
          type="button"
          className="nh-player__btn nh-player__btn--main"
          aria-label={playing ? t('Pause') : t('Play')}
          onClick={() => send(playing ? 'PAUSE' : 'PLAY')}>
          {playing ? '⏸' : '▶'}
        </button>
        <button type="button" className="nh-player__btn" aria-label={t('Next')} onClick={() => send('NEXT')}>
          ⏭
        </button>
      </div>
    </WidgetFrame>
  )
}

/** The transport, as a list a popup can draw. Keys, not labels: this is our own vocabulary. */
const PLAYER_COMMANDS: ItemChoice[] = [
  { command: 'PREVIOUS', labelKey: 'Previous' },
  { command: 'PLAY', labelKey: 'Play' },
  { command: 'PAUSE', labelKey: 'Pause' },
  { command: 'NEXT', labelKey: 'Next' }
]

export const playerWidget: WidgetDefinition<PlayerConfig> = {
  type: 'player',
  name: 'Player',
  description: 'Media transport controls',
  defaultSize: { w: 4, h: 3 },
  hasHeader: true,
  defaultConfig: () => ({ item: '' }),
  settings: [
    { key: 'item', type: 'item', label: 'openHAB Item', itemTypes: ['Player'] },
    { key: 'label', type: 'text', label: 'Name' }
  ],
  itemKeys: (c) => [c.item],
  canCommand: () => true,
  // PLAY is not a shape a state sniffer recognises, so a popup that guessed from the state offered
  // this widget's item nothing at all. Play and pause are separate buttons here rather than the
  // tile's one toggle: a list of commands is what a detail sheet can draw, and both are always
  // reachable whatever the player is doing.
  controlFor: (c, item) => (item === c.item ? { kind: 'choices', choices: PLAYER_COMMANDS } : undefined),
  Component: PlayerWidget
}
