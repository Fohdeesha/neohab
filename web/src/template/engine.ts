import DOMPurify from 'dompurify'
import { ohUrl } from '../api/base'
import { safeUrl } from '../model/url'
import { lookup } from '../model/lookup'
import { evaluate, type Scope } from './evaluator'
import { FILTERS, splitTopLevel } from './filters'

const DIRECTIVE_ATTRS = [
  'x-if',
  'ng-if',
  'x-for',
  'ng-repeat',
  'x-class',
  'ng-class',
  'x-style',
  'ng-style',
  'x-on:tap',
  'ng-click',
  'x-init',
  'ng-init',
  'ng-show',
  'ng-hide',
  'ng-bind',
  'ng-src',
  'ng-href'
]

const SANITIZE_CONFIG = {
  ADD_TAGS: ['iframe', 'link', 'style', 'widget-icon'],
  ADD_ATTR: [
    ...DIRECTIVE_ATTRS,
    'target',
    'frameborder',
    'allowfullscreen',
    'allow',
    'scrolling',
    'iconset',
    'icon',
    'state',
    'size',
    'rel',
    'media',
    'align',
    'valign'
  ]
}

const compileCache = new Map<string, HTMLTemplateElement>()

export function compileTemplate(raw: string): HTMLTemplateElement {
  let tpl = compileCache.get(raw)
  if (!tpl) {
    tpl = document.createElement('template')
    tpl.innerHTML = String(DOMPurify.sanitize(raw, SANITIZE_CONFIG))
    if (compileCache.size > 100) compileCache.clear()
    compileCache.set(raw, tpl)
  }
  return tpl
}

export function evalWithFilters(src: string, scope: Scope): unknown {
  const segments = splitTopLevel(src, '|')
  let value = evaluate(segments[0], scope)
  for (let i = 1; i < segments.length; i++) {
    const [name, ...argSrcs] = splitTopLevel(segments[i], ':')
    // through lookup: the filter name comes from whoever wrote the template, not from us
    const filter = lookup(FILTERS, name.trim())
    if (!filter) continue
    value = filter(value, ...argSrcs.map((a) => evaluate(a, scope)))
  }
  return value
}

const INTERPOLATION = /\{\{([\s\S]+?)\}\}/g

function interpolate(text: string, scope: Scope): string {
  return text.replace(INTERPOLATION, (_, expr: string) => {
    const v = evalWithFilters(expr, scope)
    return v === null || v === undefined ? '' : String(v)
  })
}

const URL_ATTRS = new Set(['src', 'href', 'action', 'formaction', 'xlink:href'])

// interpolated attributes are written AFTER the sanitizer runs, so URLs get checked here
function attrUrl(value: string): string {
  return safeUrl(value) ?? ''
}

function attr(el: Element, ...names: string[]): string | null {
  for (const n of names) {
    const v = el.getAttribute(n)
    if (v !== null) return v
  }
  return null
}

export function renderTemplate(compiled: HTMLTemplateElement, scope: Scope): DocumentFragment {
  const frag = compiled.content.cloneNode(true) as DocumentFragment
  for (const child of [...frag.children]) processElement(child, scope)
  interpolateTextNodes(frag, scope)
  for (const el of frag.querySelectorAll(`[${DONE_ATTR}]`)) el.removeAttribute(DONE_ATTR)
  return frag
}

function processElement(el: Element, scope: Scope): void {
  const init = attr(el, 'x-init', 'ng-init')
  if (init !== null) {
    for (const stmt of splitTopLevel(init, ';')) {
      if (stmt.trim()) evaluate(stmt, scope)
    }
  }

  const forExpr = attr(el, 'x-for', 'ng-repeat')
  if (forExpr !== null) {
    expandRepeat(el, forExpr, scope)
    return
  }

  const ifExpr = attr(el, 'x-if', 'ng-if')
  if (ifExpr !== null && !evalWithFilters(ifExpr, scope)) {
    el.remove()
    return
  }

  if (el.tagName === 'WIDGET-ICON') {
    replaceWidgetIcon(el, scope)
    return
  }

  const show = el.getAttribute('ng-show')
  if (show !== null && !evalWithFilters(show, scope)) (el as HTMLElement).style.display = 'none'
  const hide = el.getAttribute('ng-hide')
  if (hide !== null && evalWithFilters(hide, scope)) (el as HTMLElement).style.display = 'none'

  const bind = el.getAttribute('ng-bind')
  if (bind !== null) {
    const v = evalWithFilters(bind, scope)
    el.textContent = v === null || v === undefined ? '' : String(v)
  }

  const classExpr = attr(el, 'x-class', 'ng-class')
  if (classExpr !== null) applyClass(el, evalWithFilters(classExpr, scope))

  const styleExpr = attr(el, 'x-style', 'ng-style')
  if (styleExpr !== null) applyStyle(el as HTMLElement, evalWithFilters(styleExpr, scope))

  const src = el.getAttribute('ng-src')
  if (src !== null) el.setAttribute('src', attrUrl(interpolate(src, scope)))
  const href = el.getAttribute('ng-href')
  if (href !== null) el.setAttribute('href', attrUrl(interpolate(href, scope)))

  for (const a of [...el.attributes]) {
    if (a.value.includes('{{')) {
      const v = interpolate(a.value, scope)
      el.setAttribute(a.name, URL_ATTRS.has(a.name) ? attrUrl(v) : v)
    }
  }

  const click = attr(el, 'x-on:tap', 'ng-click')
  if (click !== null) {
    el.addEventListener('click', (event) => {
      event.preventDefault()
      for (const stmt of splitTopLevel(click, ';')) {
        if (stmt.trim()) evaluate(stmt, scope)
      }
    })
    ;(el as HTMLElement).style.cursor ||= 'pointer'
  }

  if (el.tagName === 'IFRAME') {
    const frameSrc = el.getAttribute('src') ?? ''
    try {
      if (new URL(frameSrc, location.href).origin === location.origin) {
        el.setAttribute('sandbox', 'allow-scripts')
      }
    } catch {
      el.setAttribute('sandbox', 'allow-scripts')
    }
  }

  for (const child of [...el.children]) processElement(child, scope)
}

const REPEAT_RE = /^\s*([$\w]+)\s+in\s+(.+?)(?:\s+track\s+by\s+.+)?\s*$/

const FORBIDDEN_SCOPE_NAMES = new Set(['__proto__', 'prototype', 'constructor'])

function expandRepeat(el: Element, expr: string, scope: Scope): void {
  const m = REPEAT_RE.exec(expr)
  if (!m) {
    el.remove()
    return
  }
  const [, varName, listExpr] = m
  const value = evalWithFilters(listExpr, scope)
  const list = Array.isArray(value) ? value : value && typeof value === 'object' ? Object.values(value) : []
  const parent = el.parentNode
  if (!parent) return
  el.removeAttribute('x-for')
  el.removeAttribute('ng-repeat')
  list.forEach((item, index) => {
    const child: Scope = Object.create(scope)
    if (!FORBIDDEN_SCOPE_NAMES.has(varName)) child[varName] = item
    child.$index = index
    child.$first = index === 0
    child.$last = index === list.length - 1
    const clone = el.cloneNode(true) as Element
    parent.insertBefore(clone, el)
    processElement(clone, child)
    interpolateTextNodes(clone, child)
    markInterpolated(clone)
  })
  el.remove()
}

function replaceWidgetIcon(el: Element, scope: Scope): void {
  const iconset = String(evaluate(el.getAttribute('iconset') ?? "'classic'", scope) ?? 'classic')
  const icon = String(evaluate(el.getAttribute('icon') ?? "''", scope) ?? '')
  const state = evaluate(el.getAttribute('state') ?? 'undefined', scope)
  const size = Number(evaluate(el.getAttribute('size') ?? '32', scope) ?? 32)
  const img = document.createElement('img')
  const params = new URLSearchParams({ iconset, anyFormat: 'true', format: 'svg' })
  if (state !== undefined && state !== null) params.set('state', String(state))
  img.src = `${ohUrl('/icon/')}${encodeURIComponent(icon)}?${params.toString()}`
  img.width = size
  img.height = size
  img.alt = icon
  el.replaceWith(img)
}

function applyClass(el: Element, value: unknown): void {
  if (typeof value === 'string') {
    for (const c of value.split(/\s+/)) if (c) el.classList.add(c)
  } else if (Array.isArray(value)) {
    for (const v of value) applyClass(el, v)
  } else if (value && typeof value === 'object') {
    for (const [cls, on] of Object.entries(value)) {
      if (on) el.classList.add(...cls.split(/\s+/).filter(Boolean))
    }
  }
}

function applyStyle(el: HTMLElement, value: unknown): void {
  if (!value || typeof value !== 'object') return
  for (const [prop, v] of Object.entries(value)) {
    if (v === null || v === undefined || v === '') continue
    el.style.setProperty(
      prop.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()),
      String(v)
    )
  }
}

const DONE_ATTR = 'data-nh-interpolated'

function markInterpolated(el: Element): void {
  el.setAttribute(DONE_ATTR, '')
}

function interpolateTextNodes(root: Node, scope: Scope): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const texts: Text[] = []
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if ((n as Text).data.includes('{{')) texts.push(n as Text)
  }
  for (const t of texts) {
    if (t.parentElement?.closest('style')) continue
    if (t.parentElement?.closest(`[${DONE_ATTR}]`)) continue
    t.data = interpolate(t.data, scope)
  }
}

export const TEMPLATE_BASE_CSS = `
:host { display: block; height: 100%; position: relative; overflow: hidden; color: inherit; }
*, *::before, *::after { box-sizing: border-box; }
img { max-width: 100%; }
/* Chromium paints an opaque WHITE canvas behind an iframe whose embedded page doesn't match
   the embedder's color-scheme (our themes set color-scheme: dark). HABPanel-era pages are
   light-scheme with transparent backgrounds; declaring the iframe element light restores the
   transparent canvas so the widget background shows through, like it did in HABPanel. */
iframe { color-scheme: light; }
a { color: inherit; }
.glyphicon { font-style: normal; display: inline-block; line-height: 1; }
.glyphicon-menu-up::before, .glyphicon-chevron-up::before { content: '\\25B2'; }
.glyphicon-menu-down::before, .glyphicon-chevron-down::before { content: '\\25BC'; }
.glyphicon-menu-left::before, .glyphicon-chevron-left::before { content: '\\25C0'; }
.glyphicon-menu-right::before, .glyphicon-chevron-right::before { content: '\\25B6'; }
.glyphicon-play::before { content: '\\25B6'; }
.glyphicon-pause::before { content: '\\23F8'; }
.glyphicon-stop::before { content: '\\23F9'; }
.glyphicon-off::before { content: '\\23FB'; }
.glyphicon-plus::before { content: '+'; }
.glyphicon-minus::before { content: '\\2212'; }
.glyphicon-ok::before { content: '\\2713'; }
.glyphicon-remove::before { content: '\\2715'; }
.glyphicon-cog::before { content: '\\2699'; }
.glyphicon-home::before { content: '\\2302'; }
.glyphicon-refresh::before { content: '\\21BB'; }
.glyphicon-arrow-up::before { content: '\\2191'; }
.glyphicon-arrow-down::before { content: '\\2193'; }
`
