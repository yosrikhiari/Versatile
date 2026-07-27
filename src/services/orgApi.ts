import { api } from './api'

export function listOrganizations() {
  return api('/organization')
}

export function getOrganization(id: string) {
  return api(`/organization/${id}`)
}

export function createOrganization(name: string, slug: string) {
  const qs = `?name=${encodeURIComponent(name)}&slug=${encodeURIComponent(slug)}`
  return api('/organization' + qs, { method: 'POST' })
}

export function updateOrganization(id: string, name: string, slug: string) {
  const qs = `?name=${encodeURIComponent(name)}&slug=${encodeURIComponent(slug)}`
  return api(`/organization/${id}` + qs, { method: 'PUT' })
}

export function deleteOrganization(id: string) {
  return api(`/organization/${id}`, { method: 'DELETE' })
}

export function inviteMember(orgId: string, userId: string, role: number = 1) {
  return api(`/organization/${orgId}/invite`, {
    method: 'POST',
    body: { userId, role }
  })
}

export function removeMember(orgId: string, userId: string) {
  return api(`/organization/${orgId}/members/${userId}`, { method: 'DELETE' })
}
