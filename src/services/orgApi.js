import { api } from './api'

export function listOrganizations() {
  return api('/organization')
}

export function getOrganization(id) {
  return api(`/organization/${id}`)
}

export function createOrganization(name, slug) {
  const qs = `?name=${encodeURIComponent(name)}&slug=${encodeURIComponent(slug)}`
  return api('/organization' + qs, { method: 'POST' })
}

export function updateOrganization(id, name, slug) {
  const qs = `?name=${encodeURIComponent(name)}&slug=${encodeURIComponent(slug)}`
  return api(`/organization/${id}` + qs, { method: 'PUT' })
}

export function deleteOrganization(id) {
  return api(`/organization/${id}`, { method: 'DELETE' })
}

export function inviteMember(orgId, userId, role = 1) {
  return api(`/organization/${orgId}/invite`, {
    method: 'POST',
    body: { userId, role }
  })
}

export function removeMember(orgId, userId) {
  return api(`/organization/${orgId}/members/${userId}`, { method: 'DELETE' })
}
