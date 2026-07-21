import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 5,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';

export default function () {
  const responses = http.batch([
    ['GET', `${BASE_URL}/health`, null, { tags: { name: 'health' } }],
    ['GET', `${BASE_URL}/api/scene?page=1&pageSize=10`, null, {
      tags: { name: 'list-scenes' },
      headers: { Authorization: `Bearer ${__ENV.TOKEN || ''}` },
    }],
  ]);

  check(responses[0], {
    'health status is 200': (r) => r.status === 200,
    'health body is json': (r) => r.headers['Content-Type']?.includes('application/json'),
  });

  sleep(1);
}
