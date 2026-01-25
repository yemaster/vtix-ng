<script setup lang="ts">
const stats = [
    { title: '题库总量', value: '12', detail: '覆盖近三年题库' },
    { title: '题目总数', value: '3,280', detail: '持续更新中' },
    { title: '推荐题库', value: '3', detail: '重点优先练习' }
]

const timeline = [
    { name: '2025 思想道德与法治', date: '推荐 · 717 题', status: '最新', code: '2025sxdd' },
    { name: '2024 近代史纲要', date: '政治类 · 题库', status: '已整理', code: '2024jdsgy' },
    { name: '2023 校规校纪', date: '入学类 · 题库', status: '可练习', code: '2023xgxj' }
]
</script>

<template>
  <section class="page">
    <div class="hero-card">
      <div class="eyebrow">VTIX / 题库学习面板</div>
      <h1>聚合题库与练习进度，一站式备考</h1>
      <p>
        统一管理题库、练习与错题复盘，快速定位薄弱点，提升答题效率。
      </p>
      <div class="hero-actions">
        <RouterLink class="primary" :to="{ name: 'question-bank' }">进入题库</RouterLink>
        <RouterLink class="ghost" :to="{ name: 'question-bank' }">开始练习</RouterLink>
      </div>
      <div class="hero-meta">
        <div>
          <div class="meta-label">今日练习</div>
          <div class="meta-value">86</div>
        </div>
        <div>
          <div class="meta-label">已掌握题目</div>
          <div class="meta-value">1,204</div>
        </div>
        <div>
          <div class="meta-label">正确率提升</div>
          <div class="meta-value positive">+6.8%</div>
        </div>
      </div>
    </div>

    <div class="grid">
      <div v-for="stat in stats" :key="stat.title" class="stat-card">
        <div class="stat-label">{{ stat.title }}</div>
        <div class="stat-value">{{ stat.value }}</div>
        <div class="stat-detail">{{ stat.detail }}</div>
      </div>
    </div>

    <div class="panel-row">
      <div class="panel">
        <div class="panel-head">
          <div>
            <div class="panel-eyebrow">即时概览</div>
            <h2>题型占比</h2>
          </div>
          <span class="pill">实时同步</span>
        </div>
        <div class="flow">
          <div class="flow-item">
            <div class="flow-label">单选题</div>
            <div class="flow-value">52%</div>
          </div>
          <div class="flow-item">
            <div class="flow-label">多选题</div>
            <div class="flow-value">26%</div>
          </div>
          <div class="flow-item">
            <div class="flow-label">判断 / 填空</div>
            <div class="flow-value">22%</div>
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <div>
            <div class="panel-eyebrow">练习安排</div>
            <h2>推荐题库</h2>
          </div>
          <span class="pill neutral">重点练习</span>
        </div>
        <ul class="timeline">
          <li v-for="item in timeline" :key="item.name" class="timeline-item">
            <RouterLink class="timeline-link" :to="`/t/${item.code}`">
              <div>
                <div class="timeline-name">{{ item.name }}</div>
                <div class="timeline-date">{{ item.date }}</div>
              </div>
              <span class="pill subtle">{{ item.status }}</span>
            </RouterLink>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.hero-card {
  background: linear-gradient(135deg, #f7f8fa 0%, #ffffff 40%, #f4f5f7 100%);
  border: 1px solid #e4e7ec;
  border-radius: 16px;
  padding: 28px;
  box-shadow: 0 20px 40px rgba(15, 23, 42, 0.08);
}

.eyebrow {
  font-size: 12px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #6f7785;
  margin-bottom: 8px;
}

h1 {
  margin: 0 0 10px;
  color: #151820;
  font-size: 32px;
  letter-spacing: -0.02em;
}

p {
  margin: 0 0 18px;
  color: #525a66;
  max-width: 720px;
}

.hero-actions {
  display: flex;
  gap: 10px;
  margin-bottom: 18px;
}

.hero-actions a {
  border: none;
  border-radius: 12px;
  font-weight: 700;
  letter-spacing: 0.01em;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
  padding: 12px 18px;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.hero-actions .primary {
  background: #1f2937;
  color: #ffffff;
  box-shadow: 0 10px 25px rgba(31, 41, 55, 0.2);
}

.hero-actions .primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 16px 32px rgba(31, 41, 55, 0.24);
}

.hero-actions .ghost {
  background: #eef1f5;
  color: #1f2937;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08) inset;
}

.hero-actions .ghost:hover {
  background: #e2e6ec;
}

.hero-meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 8px;
}

.meta-label {
  font-size: 12px;
  color: #7b8494;
  letter-spacing: 0.02em;
}

.meta-value {
  font-weight: 800;
  color: #151820;
  font-size: 20px;
  margin-top: 4px;
}

.meta-value.positive {
  color: #0f9b6c;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

.stat-card {
  background: #ffffff;
  border: 1px solid #e4e7ec;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 16px 30px rgba(15, 23, 42, 0.06);
}

.stat-label {
  color: #7b8494;
  font-size: 13px;
}

.stat-value {
  font-size: 28px;
  color: #151820;
  font-weight: 800;
  margin: 6px 0;
}

.stat-detail {
  color: #6b7280;
  font-size: 12px;
}

.panel-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 12px;
}

.panel {
  background: #ffffff;
  border: 1px solid #e4e7ec;
  border-radius: 12px;
  padding: 18px;
  box-shadow: 0 18px 28px rgba(15, 23, 42, 0.06);
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.panel-eyebrow {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #9aa2b2;
  margin-bottom: 4px;
}

.panel h2 {
  margin: 0;
  color: #161b22;
  font-size: 20px;
}

.pill {
  background: #111827;
  color: #ffffff;
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 12px;
  box-shadow: 0 8px 24px rgba(17, 24, 39, 0.15);
}

.pill.neutral {
  background: #e5e7eb;
  color: #1f2937;
  box-shadow: none;
}

.pill.subtle {
  background: #eef2f7;
  color: #4b5563;
  box-shadow: none;
}

.flow {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.flow-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #f7f8fa;
  border: 1px dashed #e4e7ec;
  border-radius: 10px;
  padding: 12px;
}

.flow-label {
  color: #4b5563;
  font-weight: 600;
}

.flow-value {
  color: #111827;
  font-weight: 800;
}

.timeline {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.timeline-item {
  padding: 12px;
  border-radius: 10px;
  background: #f7f8fa;
  border: 1px dashed #e4e7ec;
}

.timeline-link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  text-decoration: none;
  color: inherit;
}

.timeline-name {
  color: #111827;
  font-weight: 700;
}

.timeline-date {
  color: #6b7280;
  font-size: 13px;
}

@media (max-width: 768px) {
  .hero-meta {
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  }

  .panel-head {
    align-items: flex-start;
  }
}
</style>
