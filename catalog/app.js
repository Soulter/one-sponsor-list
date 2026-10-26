const list = document.querySelector('#list')
const message = document.querySelector('#message')
const editor = document.querySelector('#editor')
const form = document.querySelector('#form')
const add = document.querySelector('#add')
const previewLocale = document.querySelector('#preview-locale')
let catalog = null
let locales = {}
let editingId = null
let busy = false

function render() {
  list.replaceChildren()
  document.querySelector(
    '#count'
  ).textContent = `${catalog.sponsors.length} 家赞助商 · ${catalog.sponsors.filter(item => !item.hidden).length} 家显示 · ${catalog.sponsors.filter(item => item.hidden).length} 家已隐藏`
  document.querySelector('#updated').textContent = `最近发布：${new Date(
    catalog.updated_at
  ).toLocaleString()}`
  for (const [index, sponsor] of catalog.sponsors.entries()) {
    const translation = sponsor.i18n?.[previewLocale.value]
    const displayTitle = translation?.title || sponsor.title
    const row = document.createElement('article')
    row.className = 'sponsor'
    row.classList.toggle('is-hidden', sponsor.hidden === true)
    const logo = document.createElement('img')
    logo.className = 'sponsor-logo'
    logo.src = sponsor.logo
    logo.alt = ''
    logo.referrerPolicy = 'no-referrer'
    const copy = document.createElement('div')
    copy.className = 'sponsor-copy'
    const title = document.createElement('h2')
    title.className = 'sponsor-title'
    title.textContent = displayTitle
    if (sponsor.hidden) {
      const status = document.createElement('span')
      status.className = 'sponsor-status'
      status.textContent = '已隐藏'
      title.append(status)
    }
    const subtitle = document.createElement('p')
    subtitle.className = 'sponsor-subtitle'
    subtitle.textContent = translation?.subtitle || sponsor.subtitle
    const endpoint = document.createElement('p')
    endpoint.className = 'sponsor-endpoint'
    endpoint.textContent = `${sponsor.template} · ${sponsor.api_base}`
    copy.append(title, subtitle, endpoint)
    const actions = document.createElement('div')
    actions.className = 'sponsor-actions'
    for (const [label, action] of [
      ['上移', 'up'],
      ['下移', 'down'],
      [sponsor.hidden ? '恢复显示' : '暂时隐藏', 'visibility'],
      ['编辑', 'edit'],
      ['删除', 'delete']
    ]) {
      const button = document.createElement('button')
      button.textContent = label
      button.className = action
      button.setAttribute('aria-label', `${label} ${displayTitle}`)
      if (action === 'visibility') {
        button.title = sponsor.hidden
          ? '恢复在公开目录和 AstrBot 中展示，保留原有顺序。'
          : '暂时停止在公开目录和 AstrBot 中展示，保留资料和已有用户配置。'
      }
      button.disabled =
        busy ||
        (action === 'up' && index === 0) ||
        (action === 'down' && index === catalog.sponsors.length - 1)
      button.addEventListener('click', async () => {
        if (action === 'edit') return openEditor(sponsor)
        if (action === 'visibility') {
          await publish(catalog.sponsors.map(item =>
            item.id === sponsor.id ? { ...item, hidden: !item.hidden } : item
          ))
        } else if (action === 'delete') {
          if (
            !confirm(`删除赞助商「${sponsor.title}」？已有用户配置不会被删除。`)
          )
            return
          await publish(
            catalog.sponsors.filter((item) => item.id !== sponsor.id)
          )
        } else {
          const entries = catalog.sponsors.map((item) => ({ ...item }))
          const target = index + (action === 'up' ? -1 : 1)
          ;[entries[index], entries[target]] = [entries[target], entries[index]]
          await publish(entries.map((item, order) => ({ ...item, order })))
        }
      })
      actions.append(button)
    }
    row.append(logo, copy, actions)
    list.append(row)
  }
  if (!catalog.sponsors.length) {
    const empty = document.createElement('div')
    empty.className = 'empty'
    empty.textContent = '还没有赞助商。点击“添加赞助商”创建第一条。'
    list.append(empty)
  }
  add.disabled = busy
}

function openEditor(sponsor = null) {
  editingId = sponsor?.id ?? null
  form.reset()
  document.querySelector('#editor-title').textContent = sponsor
    ? '编辑赞助商'
    : '添加赞助商'
  document.querySelector('#form-error').textContent = ''
  for (const key of [
    'id',
    'title',
    'subtitle',
    'logo',
    'api_base',
    'website_url',
    'help_url',
    'template',
    'order'
  ]) {
    form.elements.namedItem(key).value =
      sponsor?.[key] ??
      (key === 'order'
        ? Math.max(-1, ...catalog.sponsors.map((item) => item.order)) + 1
        : key === 'template'
        ? 'OpenAI Compatible'
        : '')
  }
  form.elements.namedItem('id').readOnly = Boolean(sponsor)
  for (const locale of Object.keys(locales)) {
    for (const key of ['title', 'subtitle']) {
      form.elements.namedItem(`i18n.${locale}.${key}`).value =
        sponsor?.i18n?.[locale]?.[key] || ''
    }
  }
  document.querySelector('.translations').open = Boolean(sponsor?.i18n)
  editor.showModal()
  form.elements.namedItem(sponsor ? 'title' : 'id').focus()
}

/**
 * Publish the edited list and retain the current form on failure.
 *
 * Args:
 *   sponsors: Complete next sponsor list.
 * Returns:
 *   Whether the server accepted the publication.
 */
async function publish(sponsors) {
  if (busy) return false
  busy = true
  document.querySelector('#save').disabled = true
  document.querySelector('#cancel').disabled = true
  document.querySelector('#close').disabled = true
  message.textContent = ''
  message.className = ''
  render()
  try {
    const response = await fetch('/webui/api/sponsors', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...catalog, sponsors })
    })
    if (response.redirected || [401, 403].includes(response.status))
      throw new Error('登录已失效，请刷新页面重新登录。')
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || '保存失败，请稍后重试。')
    catalog = data.catalog
    message.textContent =
      '已发布。公开 JSON 边缘缓存最多 30 分钟，客户端缓存最多 6 小时。'
    return true
  } catch (error) {
    const text = error instanceof Error ? error.message : '保存失败。'
    message.textContent = text
    message.className = 'error'
    document.querySelector('#form-error').textContent = text
    return false
  } finally {
    busy = false
    document.querySelector('#save').disabled = false
    document.querySelector('#cancel').disabled = false
    document.querySelector('#close').disabled = false
    render()
  }
}

add.addEventListener('click', () => openEditor())
previewLocale.addEventListener('change', () => {
  if (catalog) render()
})
document.querySelector('#close').addEventListener('click', () => editor.close())
document
  .querySelector('#cancel')
  .addEventListener('click', () => editor.close())
editor.addEventListener('cancel', (event) => {
  if (busy) event.preventDefault()
})
form.addEventListener('submit', async (event) => {
  event.preventDefault()
  document.querySelector('#form-error').textContent = ''
  const data = new FormData(form)
  const entry = Object.fromEntries(
    [...data].filter(([key]) => !key.startsWith('i18n.'))
  )
  entry.i18n = {}
  for (const locale of Object.keys(locales)) {
    const translation = {}
    for (const key of ['title', 'subtitle']) {
      const value = String(data.get(`i18n.${locale}.${key}`) || '').trim()
      if (value) translation[key] = value
    }
    if (Object.keys(translation).length) entry.i18n[locale] = translation
  }
  entry.order = Number(entry.order)
  entry.hidden = catalog.sponsors.find(item => item.id === editingId)?.hidden ?? false
  const entries = catalog.sponsors.map((item) =>
    item.id === editingId ? entry : item
  )
  if (!editingId) entries.push(entry)
  if (await publish(entries)) editor.close()
})

try {
  const response = await fetch('/webui/api/sponsors', {
    credentials: 'same-origin',
    cache: 'no-store'
  })
  if (response.redirected || [401, 403].includes(response.status))
    throw new Error('登录已失效，请刷新页面重新登录。')
  if (!response.ok) throw new Error('目录加载失败，请刷新重试。')
  const data = await response.json()
  catalog = data.catalog
  locales = data.locales
  const translationFields = document.querySelector('#translation-fields')
  for (const [locale, name] of Object.entries(locales)) {
    const option = document.createElement('option')
    option.value = locale
    option.textContent = name
    previewLocale.append(option)
    const fieldset = document.createElement('fieldset')
    const legend = document.createElement('legend')
    legend.textContent = name
    fieldset.append(legend)
    for (const [key, labelText, maxLength] of [
      ['title', '名称', 80],
      ['subtitle', '副标题', null]
    ]) {
      const label = document.createElement('label')
      label.textContent = `${name} · ${labelText}`
      const input = document.createElement('input')
      input.name = `i18n.${locale}.${key}`
      if (maxLength !== null) input.maxLength = maxLength
      input.lang = locale
      input.placeholder = '留空使用默认文案'
      label.append(input)
      fieldset.append(label)
    }
    translationFields.append(fieldset)
  }
  const select = form.elements.namedItem('template')
  for (const template of data.templates) {
    const option = document.createElement('option')
    option.value = template
    option.textContent = template
    select.append(option)
  }
  render()
} catch (error) {
  message.textContent =
    error instanceof Error ? error.message : '目录加载失败。'
  message.className = 'error'
  document.querySelector('#count').textContent = '加载失败'
}
