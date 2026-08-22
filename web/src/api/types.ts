/**
 * openHAB REST/SSE data shapes used by neohab.
 * Kept intentionally small - only the fields the UI consumes.
 */

export interface StateOption {
  value: string
  label?: string
}

export interface StateDescription {
  minimum?: number
  maximum?: number
  step?: number
  pattern?: string
  readOnly?: boolean
  options?: StateOption[]
}

export interface CommandOption {
  command: string
  label?: string
}

export interface CommandDescription {
  commandOptions?: CommandOption[]
}

/** An item as returned by `GET /rest/items`. */
export interface Item {
  name: string
  type: string
  state: string
  label?: string
  category?: string
  tags?: string[]
  groupNames?: string[]
  /** Base type of a typed Group (item.type is then just "Group"). */
  groupType?: string
  stateDescription?: StateDescription
  commandDescription?: CommandDescription
  /**
   * State history openHAB keeps in the registry itself. **openHAB 5.x only** - 4.3.7 serves none
   * of these three, so anything reading them must treat their absence as normal. Epoch millis.
   */
  lastState?: string
  lastStateUpdate?: number
  lastStateChange?: number
}

/**
 * Live item state as pushed by the `/rest/events/states` tracker.
 * `displayState` is the server-formatted value and is preferred for display when present.
 */
export interface ItemState {
  state: string
  displayState?: string
  numericState?: number
  unit?: string
  type: string
}

/** openHAB root info from `GET /rest/`. */
export interface RootInfo {
  version?: string
  locale?: string
  measurementSystem?: string
  runtimeInfo?: {
    version: string
    buildString: string
  }
}

/** A UI component root as stored in `/rest/ui/components/{namespace}`. */
export interface UIComponent<C = Record<string, unknown>> {
  uid: string
  component: string
  config: C
  slots?: Record<string, UIComponent[]>
  tags?: string[]
  timestamp?: string
}
