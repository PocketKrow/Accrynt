/** Immutable for this page lifetime. Changing workspace requires full navigation. */
export const isDemo = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('demo') === '1'
export const databaseName = isDemo ? 'accrynt-demo-v1' : 'accrynt-local-v1'
export function workspaceUrl(demo: boolean) {
  const url = new URL(window.location.href)
  if (demo) url.searchParams.set('demo', '1')
  else url.searchParams.delete('demo')
  url.hash = '#/'
  return url.href
}
