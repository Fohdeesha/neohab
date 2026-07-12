/** Widget palette: pick a type, it's placed at the first free spot and selected. */
import { Sheet } from '../components/Sheet'
import { listWidgetDefinitions } from '../widgets'
import { addWidget, setPaletteOpen } from '../store/editor'

export function PaletteSheet() {
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
    </Sheet>
  )
}
