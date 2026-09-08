import http from 'k6/http'
import { check, sleep } from 'k6'

// Manual smoke: k6 run load-tests/smoke-test.js
//   TOKEN=$(...) BASE_URL=http://localhost:5171 k6 run load-tests/smoke-test.js
// BASE_URL defaults to the local API (dotnet run on :5171, or the compose
// `api` service published at 5171:8080). TOKEN is a JWT from
// POST /api/auth/register (see Done/PHASE-1 record for the curl shape).
// NOT wired to CI: it needs a live stack plus a seeded user, neither of
// which CI provisions today. Wire it there before trusting these thresholds.

export const options = {
  vus: 5,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01']
  }
}

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5171'

export default function () {
  const responses = http.batch([
    ['GET', `${BASE_URL}/health`, null, { tags: { name: 'health' } }],
    [
      'GET',
      `${BASE_URL}/api/organization`,
      null,
      {
        tags: { name: 'list-orgs' },
        headers: { Authorization: `Bearer ${__ENV.TOKEN || ''}` }
      }
    ]
  ])

  check(responses[0], {
    'health status is 200': (r) => r.status === 200,
    'health body is json': (r) => r.headers['Content-Type']?.includes('application/json')
  })

  check(responses[1], {
    // 200 with TOKEN set, 401 anonymous — both prove the API answers.
    // Anything else (404/500/000) means routing or boot is broken.
    'orgs answer 200 authed or 401 anon': (r) => r.status === 200 || r.status === 401
  })

  sleep(1)
}
