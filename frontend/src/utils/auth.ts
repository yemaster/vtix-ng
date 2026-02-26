import type { Router } from 'vue-router'

export function pushLoginRequired(router: Router, redirectPath?: string) {
  const currentPath = redirectPath ?? router.currentRoute.value.fullPath ?? '/'
  const safeRedirect =
    typeof currentPath === 'string' && currentPath.startsWith('/') ? currentPath : '/'
  return router.push({
    name: 'login',
    query: {
      redirect: safeRedirect,
      authRequired: '1'
    }
  })
}
