import { useTranslation } from 'react-i18next'
import type { WidgetDefinition, WidgetProps } from '../types'
import { WidgetFrame } from '../common/WidgetFrame'
import type { ItemChoice } from '../common/itemControl'
import { useOptimisticValue } from '../common/useOptimisticValue'

interface PlayerConfig {
  item: string
  label?: string
}

function PlayerWidget({ config, ctx }: WidgetProps<PlayerConfig>) {
  const { t } = useTranslation()
  const state = ctx.getItem(config.item)?.state
  // through the same hold every other control has, so play/pause does not flip back while the player catches up
  const optimistic = useOptimisticValue<string | undefined>(state, state ?? '', (live, sent) => live === sent, {
    item: config.item || undefined
  })
  const playing = optimistic.display === 'PLAY'
  const send = (command: string) => {
    if (ctx.editing || !config.item) return
    const settles = command === 'PLAY' || command === 'PAUSE'
    if (settles) optimistic.commit(command)
    void ctx.sendCommand(config.item, command).then((accepted) => {
      if (!accepted && settles) optimistic.cancel(command)
    })
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
  controlFor: (c, item) => (item === c.item ? { kind: 'choices', choices: PLAYER_COMMANDS } : undefined),
  Component: PlayerWidget
}
