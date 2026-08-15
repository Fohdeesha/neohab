/**
 * Generate dashboards from the items an openHAB server already has.
 *
 * Four steps: choose where the structure comes from, choose which groups of items to use (or
 * pick items by hand), review every widget it would create, then create them. Nothing is written
 * to the server until the last step, and the review lets any row be dropped or given a different
 * widget - a generator that guesses on forty items has to be correctable.
 */
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getSemanticTags } from '../api/tags'
import type { Item } from '../api/types'
import { Sheet } from '../components/Sheet'
import { navigate } from '../app/router'
import {
  buildDashboards,
  buildPlan,
  countPlanned,
  type GeneratePlan,
  type OutputMode,
  type PlanWidget,
} from '../generate/build'
import { titleCase } from '../generate/mapping'
import { buildTagIndex, type TagIndex } from '../generate/semantics'
import { pickedCluster, surveySources, type Cluster, type SourceKind } from '../generate/sources'
import { getWidgetDefinition } from '../widgets'
import { ensureCatalog, useCatalogStore } from '../store/catalog'
import { saveDashboard, useConfigStore } from '../store/config'

type Step = 'source' | 'pick' | 'clusters' | 'preview'

export function GenerateSheet({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const items = useCatalogStore((s) => s.items)
  const catalogLoading = useCatalogStore((s) => s.loading)
  const dashboards = useConfigStore((s) => s.dashboards)
  const [index, setIndex] = useState<TagIndex | null>(null)
  const [step, setStep] = useState<Step>('source')
  const [source, setSource] = useState<SourceKind>('prefix')
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [mode, setMode] = useState<OutputMode>('each')
  const [singleName, setSingleName] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [pickName, setPickName] = useState('')
  const [plan, setPlan] = useState<GeneratePlan | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => ensureCatalog(), [])
  useEffect(() => {
    const controller = new AbortController()
    getSemanticTags(controller.signal)
      .then((tags) => setIndex(buildTagIndex(tags)))
      // No /rest/tags on this server: the bundled default hierarchy still classifies stock tags.
      .catch(() => setIndex(buildTagIndex()))
    return () => controller.abort()
  }, [])

  const survey = useMemo(() => (index ? surveySources(items, index) : null), [items, index])

  const clustersFor = (kind: SourceKind): Cluster[] => {
    if (!survey) return []
    if (kind === 'semantic') return survey.semantic
    if (kind === 'group') return survey.groups
    if (kind === 'prefix') return survey.prefixes
    return []
  }

  const chooseSource = (kind: SourceKind) => {
    setSource(kind)
    setError(null)
    if (kind === 'pick') {
      setStep('pick')
      return
    }
    const found = clustersFor(kind)
    setChosen(new Set(found.map((c) => c.id)))
    setMode(found.length > 1 ? 'each' : 'single')
    setSingleName(found.length === 1 ? found[0].name : '')
    setStep('clusters')
  }

  const toPreview = (clusters: Cluster[]) => {
    if (!index || clusters.length === 0) return
    setPlan(buildPlan(clusters, items, index, source))
    setStep('preview')
  }

  const create = async () => {
    if (!plan || busy) return
    setBusy(true)
    setError(null)
    const existingIds = new Set(dashboards.map((d) => d.id))
    const built = buildDashboards(plan, {
      mode: source === 'pick' ? 'single' : mode,
      name: source === 'pick' ? pickName : singleName,
      existingIds,
    })
    try {
      for (const dashboard of built) await saveDashboard(dashboard)
      onClose()
      if (built.length === 1) navigate({ name: 'dashboard', id: built[0].id })
      else navigate({ name: 'home' })
    } catch (err) {
      setBusy(false)
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const title =
    step === 'preview' ? t('Review what will be created') : step === 'source' ? t('Generate dashboards') : t('Choose what to include')

  return (
    <Sheet title={title} onClose={onClose}>
      {!survey ? (
        <p className="nh-settings__text">{catalogLoading || !index ? t('Reading your items…') : t('No items could be read from this server.')}</p>
      ) : step === 'source' ? (
        <SourceStep survey={survey} onChoose={chooseSource} />
      ) : step === 'pick' ? (
        <PickStep
          items={items}
          picked={picked}
          setPicked={setPicked}
          name={pickName}
          setName={setPickName}
          onBack={() => setStep('source')}
          onNext={() => toPreview([pickedCluster(picked, pickName.trim() || t('My dashboard'))])}
        />
      ) : step === 'clusters' ? (
        <ClusterStep
          clusters={clustersFor(source)}
          chosen={chosen}
          setChosen={setChosen}
          mode={mode}
          setMode={setMode}
          name={singleName}
          setName={setSingleName}
          onBack={() => setStep('source')}
          onNext={() => toPreview(clustersFor(source).filter((c) => chosen.has(c.id)))}
        />
      ) : plan ? (
        <PreviewStep
          plan={plan}
          setPlan={setPlan}
          busy={busy}
          error={error}
          onBack={() => setStep(source === 'pick' ? 'pick' : 'clusters')}
          onCreate={() => void create()}
        />
      ) : null}
    </Sheet>
  )
}

/* ------------------------------------ step 1: source ------------------------------------ */

function SourceStep({
  survey,
  onChoose,
}: {
  survey: ReturnType<typeof surveySources>
  onChoose: (kind: SourceKind) => void
}) {
  const { t } = useTranslation()
  const card = (kind: SourceKind, name: string, description: string, count: number, empty: string) => (
    <button
      key={kind}
      type="button"
      className="nh-palette__card"
      disabled={count === 0}
      onClick={() => onChoose(kind)}
      data-source={kind}
    >
      <span className="nh-palette__name">{name}</span>
      <span className="nh-palette__desc">{count === 0 ? empty : description}</span>
    </button>
  )
  return (
    <div className="nh-form">
      <p className="nh-settings__text">
        {t('Build dashboards from the items this server already has. Nothing is created until you have reviewed it.')}
      </p>
      <div className="nh-palette">
        {card(
          'semantic',
          t('Semantic model'),
          t('{{count}} locations, with their equipment as sections', { count: survey.semantic.length }),
          survey.semantic.length,
          t('No items on this server are tagged with a location')
        )}
        {card(
          'prefix',
          t('Item naming'),
          t('{{count}} groups of items that share the start of their name', { count: survey.prefixes.length }),
          survey.prefixes.length,
          t('No shared naming pattern found')
        )}
        {card(
          'group',
          t('Groups'),
          t('{{count}} group items, each with its members', { count: survey.groups.length }),
          survey.groups.length,
          t('This server has no group items')
        )}
        {card(
          'pick',
          t('Pick items yourself'),
          t('Choose from {{count}} items', { count: survey.placeable }),
          survey.placeable,
          t('No usable items found')
        )}
      </div>
    </div>
  )
}

/* ---------------------------------- step 2a: clusters ----------------------------------- */

function ClusterStep({
  clusters,
  chosen,
  setChosen,
  mode,
  setMode,
  name,
  setName,
  onBack,
  onNext,
}: {
  clusters: Cluster[]
  chosen: Set<string>
  setChosen: (s: Set<string>) => void
  mode: OutputMode
  setMode: (m: OutputMode) => void
  name: string
  setName: (n: string) => void
  onBack: () => void
  onNext: () => void
}) {
  const { t } = useTranslation()
  const selected = clusters.filter((c) => chosen.has(c.id))
  const toggle = (id: string) => {
    const next = new Set(chosen)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setChosen(next)
  }
  return (
    <div className="nh-form">
      <div className="nh-gen__list">
        {clusters.map((cluster) => (
          <label key={cluster.id} className="nh-gen__row">
            <input type="checkbox" checked={chosen.has(cluster.id)} onChange={() => toggle(cluster.id)} />
            <span className="nh-gen__rowname">{cluster.name}</span>
            <span className="nh-gen__meta">{t('{{count}} items', { count: cluster.count })}</span>
          </label>
        ))}
      </div>

      <div className="nh-gen__actions">
        <button type="button" className="nh-btn nh-btn--ghost" onClick={() => setChosen(new Set(clusters.map((c) => c.id)))}>
          {t('Select all')}
        </button>
        <button type="button" className="nh-btn nh-btn--ghost" onClick={() => setChosen(new Set())}>
          {t('Select none')}
        </button>
      </div>

      <fieldset className="nh-gen__modes">
        <legend className="nh-field__label">{t('Create')}</legend>
        <label className="nh-gen__mode">
          <input type="radio" name="nh-gen-mode" checked={mode === 'each'} onChange={() => setMode('each')} />
          <span>{t('One dashboard per group')}</span>
        </label>
        <label className="nh-gen__mode">
          <input type="radio" name="nh-gen-mode" checked={mode === 'single'} onChange={() => setMode('single')} />
          <span>{t('One dashboard, with a heading per group')}</span>
        </label>
      </fieldset>

      {mode === 'single' ? (
        <label className="nh-field" htmlFor="nh-gen-name">
          <span className="nh-field__label">{t('Name')}</span>
          <input id="nh-gen-name" value={name} placeholder={t('My home')} onChange={(e) => setName(e.target.value)} />
        </label>
      ) : null}

      <StepFooter
        onBack={onBack}
        onNext={onNext}
        disabled={selected.length === 0 || (mode === 'single' && !name.trim())}
        nextLabel={t('Review {{count}} items', { count: selected.reduce((n, c) => n + c.count, 0) })}
      />
    </div>
  )
}

/* ------------------------------------ step 2b: pick ------------------------------------- */

const PICK_LIMIT = 300

function PickStep({
  items,
  picked,
  setPicked,
  name,
  setName,
  onBack,
  onNext,
}: {
  items: Item[]
  picked: string[]
  setPicked: (p: string[]) => void
  name: string
  setName: (n: string) => void
  onBack: () => void
  onNext: () => void
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const chosen = new Set(picked)
  const q = query.trim().toLowerCase()
  const matches = items.filter(
    (i) => !q || i.name.toLowerCase().includes(q) || (i.label ?? '').toLowerCase().includes(q)
  )
  const shown = matches.slice(0, PICK_LIMIT)
  const toggle = (itemName: string) =>
    setPicked(chosen.has(itemName) ? picked.filter((n) => n !== itemName) : [...picked, itemName])

  return (
    <div className="nh-form">
      <label className="nh-field" htmlFor="nh-gen-search">
        <span className="nh-field__label">{t('Search items')}</span>
        <input
          id="nh-gen-search"
          value={query}
          placeholder={t('Type to filter…')}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>

      <div className="nh-gen__list">
        {shown.map((item) => (
          <label key={item.name} className="nh-gen__row">
            <input type="checkbox" checked={chosen.has(item.name)} onChange={() => toggle(item.name)} />
            <span className="nh-gen__rowname">{item.label?.trim() || titleCase(item.name)}</span>
            <span className="nh-gen__meta">{item.type}</span>
          </label>
        ))}
        {shown.length === 0 ? <p className="nh-settings__text">{t('No matching items')}</p> : null}
        {matches.length > shown.length ? (
          <p className="nh-settings__text">{t('…and {{count}} more - type to narrow', { count: matches.length - shown.length })}</p>
        ) : null}
      </div>

      <label className="nh-field" htmlFor="nh-gen-pickname">
        <span className="nh-field__label">{t('Name')}</span>
        <input id="nh-gen-pickname" value={name} placeholder={t('My dashboard')} onChange={(e) => setName(e.target.value)} />
      </label>

      <StepFooter
        onBack={onBack}
        onNext={onNext}
        disabled={picked.length === 0 || !name.trim()}
        nextLabel={t('Review {{count}} items', { count: picked.length })}
      />
    </div>
  )
}

/* ----------------------------------- step 3: preview ------------------------------------ */

function PreviewStep({
  plan,
  setPlan,
  busy,
  error,
  onBack,
  onCreate,
}: {
  plan: GeneratePlan
  setPlan: (p: GeneratePlan) => void
  busy: boolean
  error: string | null
  onBack: () => void
  onCreate: () => void
}) {
  const { t } = useTranslation()

  const patch = (key: string, change: (w: PlanWidget) => PlanWidget) =>
    setPlan({
      ...plan,
      clusters: plan.clusters.map((c) => ({
        ...c,
        sections: c.sections.map((s) => ({ ...s, widgets: s.widgets.map((w) => (w.key === key ? change(w) : w)) })),
      })),
    })

  const toggleCluster = (id: string) =>
    setPlan({ ...plan, clusters: plan.clusters.map((c) => (c.id === id ? { ...c, include: !c.include } : c)) })

  const total = countPlanned(plan)

  return (
    <div className="nh-form">
      {plan.clusters.map((cluster) => (
        <div key={cluster.id} className={'nh-gen__cluster' + (cluster.include ? '' : ' nh-gen__cluster--off')}>
          <label className="nh-gen__clusterhead">
            <input type="checkbox" checked={cluster.include} onChange={() => toggleCluster(cluster.id)} />
            <span className="nh-gen__rowname">{cluster.name}</span>
          </label>
          {cluster.sections.map((section, si) => (
            <div key={section.name ?? '#' + si}>
              {section.name ? <div className="nh-gen__section">{section.name}</div> : null}
              {section.widgets.map((widget) => (
                <div key={widget.key} className={'nh-gen__row' + (widget.include ? '' : ' nh-gen__row--off')}>
                  <input
                    type="checkbox"
                    checked={widget.include}
                    aria-label={widget.label}
                    onChange={() => patch(widget.key, (w) => ({ ...w, include: !w.include }))}
                  />
                  <span className="nh-gen__rowname" title={widget.item.name}>
                    {widget.label}
                    {widget.note ? <span className="nh-gen__note">{noteText(t, widget.note)}</span> : null}
                  </span>
                  <select
                    className="nh-gen__type"
                    value={widget.type}
                    aria-label={t('Widget for {{item}}', { item: widget.label })}
                    onChange={(e) =>
                      patch(widget.key, (w) => ({
                        ...w,
                        type: e.target.value,
                        // The note explained the suggestion; a deliberate override supersedes it.
                        note: e.target.value === w.suggested ? w.note : undefined,
                      }))
                    }
                  >
                    {widget.choices.map((choice) => (
                      <option key={choice} value={choice}>
                        {t(getWidgetDefinition(choice)?.name ?? choice)}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}

      {plan.skipped.length > 0 ? (
        <p className="nh-settings__text">
          {t('{{count}} items were left out because no widget can show them', { count: plan.skipped.length })}
        </p>
      ) : null}

      {error ? (
        <p className="nh-form__error">
          {t('Could not create: {{error}} - are you signed in as an administrator?', { error })}
        </p>
      ) : null}

      <StepFooter
        onBack={onBack}
        onNext={onCreate}
        disabled={total === 0 || busy}
        nextLabel={busy ? t('Creating…') : t('Create {{count}} widgets', { count: total })}
      />
    </div>
  )
}

/** Why a fallback widget was chosen. Kept as literal copy here rather than in the engine. */
function noteText(t: (key: string) => string, note: NonNullable<PlanWidget['note']>): string {
  return note === 'readonly' ? t('read-only') : t('no range declared')
}

function StepFooter({
  onBack,
  onNext,
  disabled,
  nextLabel,
}: {
  onBack: () => void
  onNext: () => void
  disabled: boolean
  nextLabel: string
}) {
  const { t } = useTranslation()
  return (
    <div className="nh-gen__footer">
      <button type="button" className="nh-btn nh-btn--ghost" onClick={onBack}>
        {t('Back')}
      </button>
      <button type="button" className="nh-btn nh-btn--primary" disabled={disabled} onClick={onNext}>
        {nextLabel}
      </button>
    </div>
  )
}
