import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/authStore'

const routes = [
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/LoginView.vue')
  },
  {
    path: '/workspace',
    name: 'workspace',
    component: () => import('../views/WorkspaceView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/org/manage',
    name: 'org-manage',
    component: () => import('../views/ManageOrganizationView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/editor/:projectId',
    name: 'editor',
    component: () => import('../views/EditorView.vue'),
    meta: { requiresAuth: true }
  },
  {
    // The root and anything unknown go to the workspace; the guard below
    // sends a signed-out visitor on to the login page. Sending everyone to
    // /login first bounced a signed-in writer who opened the bare URL.
    path: '/:pathMatch(.*)*',
    redirect: '/workspace'
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to, from, next) => {
  const auth = useAuthStore()
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return next('/login')
  }
  // A signed-in writer has no use for the login page.
  if (to.name === 'login' && auth.isAuthenticated) {
    return next('/workspace')
  }
  next()
})

export default router
