/** Widget palette: pick a type, it's placed at the first free spot and selected. */
import { Sheet } from '../components/Sheet'
import { listWidgetDefinitions } from '../widgets'
import { addWidget, setPaletteOpen } from '../store/editor'
import { useConfigStore } from '../store/config'

export function PaletteSheet() {
  const customDefs = useConfigStore((s) => s.widgetDefs)

  return (
    <Sheet title="Add a widget" onClose={() => setPaletteOpen(false)}>
      <div className="nh-palette">
        {listWidgetDefinitions().map((def) => (
          <button key={def.type} type="button" className="nh-palette__card" onClick={() => addWidget(def.type)}>
            <span className="nh-palette__name">{def.name}</span>
            <span className="nh-palette__desc">{def.description}</span>
          </button>
        ))}
      </div>
      {customDefs.length > 0 ? (
        <>
          <h3 className="nh-palette__section">Custom widgets</h3>
          <div className="nh-palette">
            {customDefs.map((def) => (
              <button
                key={def.id}
                type="button"
                className="nh-palette__card"
                onClick={() => addWidget('template', { label: def.name, customwidget: def.id, config: {} })}
              >
                <span className="nh-palette__name">{def.name}</span>
                <span className="nh-palette__desc">{def.kind === 'js' ? 'JavaScript widget' : 'Template widget'}</span>
              </button>
            ))}
          </div>
        </>
      ) : null}
    </Sheet>
  )
}
