import http from 'k6/http';
import { sleep, check } from 'k6';
import { Trend } from 'k6/metrics';

// 自定义指标：记录各接口响应时间
const categoryTrend = new Trend('api_problem_sets_categories');
const listTrend = new Trend('api_problem_sets_list');
const detailTrend = new Trend('api_problem_sets_detail');
const syncTrend = new Trend('api_records_sync_item');

// 测试配置：模拟5000并发（vus=虚拟用户数，duration=测试持续时间）
export const options = {
  vus: 5000,        // 并发数（虚拟用户数）
  duration: '30s',   // 测试持续时间（可改为1m/5m）
  // 可选：逐步加压（避免瞬间打满服务器）
  // stages: [
  //   { duration: '10s', target: 1000 },  // 10秒内升到1000并发
  //   { duration: '20s', target: 3000 },  // 20秒内升到3000并发
  //   { duration: '30s', target: 5000 },  // 30秒内升到5000并发
  //   { duration: '30s', target: 5000 },  // 稳定5000并发运行30秒
  //   { duration: '20s', target: 0 },     // 20秒内降到0并发
  // ],
};

// 全局请求头（包含Cookie）
const headers = {
  'Content-Type': 'application/json',
  'Cookie': 'vtix_session=40c8cd22-bec9-4f8d-8ca7-95edfd1380df',
};

// POST请求的JSON数据
const syncPostData = JSON.stringify({
  "since": 38,
  "recordId": "mm23i1o4-h8ofpxje",
  "delta": {
    "id": "mm23i1o4-h8ofpxje",
    "updatedAt": 1772027717134,
    "baseUpdatedAt": 1772027642000,
    "progress": {
      "currentProblemId": 54,
      "timeSpentSeconds": 15,
      "answerPatches": [[48,[1]],[49,[3]],[50,[0]],[51,[1]],[52,[0]],[53,[1]]]
    },
    "problemStatePatches": [[48,1],[49,1],[50,1],[51,1],[52,1],[53,1]]
  }
});

const target = "http://ti-raw.u5tc.cn";

// 核心测试逻辑：每个虚拟用户循环执行接口请求
export default function() {
  // 1. GET /api/problem-sets/categories
  const res1 = http.get(`${target}/api/problem-sets/categories`, { headers: headers });
  categoryTrend.add(res1.timings.duration);
  check(res1, {
    'categories接口状态码200': (r) => r.status === 200,
  });
  sleep(0.1); // 每个接口间短暂休眠，模拟真实用户操作

  // 2. GET /api/problem-sets?page=1&pageSize=10
  const res2 = http.get(`${target}/api/problem-sets?page=1&pageSize=10`, { headers: headers });
  listTrend.add(res2.timings.duration);
  check(res2, {
    'list接口状态码200': (r) => r.status === 200,
  });
  sleep(0.1);

  // 3. GET /api/problem-sets/2023xgxj
  const res3 = http.get(`${target}/api/problem-sets/2023xgxj`, { headers: headers });
  detailTrend.add(res3.timings.duration);
  check(res3, {
    'detail接口状态码200': (r) => r.status === 200,
  });
  sleep(0.1);

  // 4. POST /api/records/sync-item
  const res4 = http.post(`${target}/api/records/sync-item`, syncPostData, { headers: headers });
  syncTrend.add(res4.timings.duration);
  check(res4, {
    'sync接口状态码200/201': (r) => r.status === 200 || r.status === 201,
  });
  sleep(0.1);
}