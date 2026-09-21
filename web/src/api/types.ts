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

export interface Item {
  name: string
  type: string
  state: string
  label?: string
  category?: string
  tags?: string[]
  groupNames?: string[]
  groupType?: string
  stateDescription?: StateDescription
  commandDescription?: CommandDescription
  lastState?: string
  lastStateUpdate?: number
  lastStateChange?: number
  // only the namespaces asked for, so in practice just `autoupdate`
  metadata?: unknown
}

export interface ItemState {
  state: string
  displayState?: string
  numericState?: number
  unit?: string
  type: string
}

export interface RootInfo {
  version?: string
  locale?: string
  measurementSystem?: string
  runtimeInfo?: {
    version: string
    buildString: string
  }
}

export interface UIComponent<C = Record<string, unknown>> {
  uid: string
  component: string
  config: C
  slots?: Record<string, UIComponent[]>
  tags?: string[]
  timestamp?: string
}
