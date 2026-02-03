<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

type BackendVersion = {
  name?: string
  version?: string
  buildTime?: string
}

const apiBase = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000'

const frontendBuildInfo = computed(() => {
  const info = import.meta.env.VITE_BUILD_INFO ?? import.meta.env.VITE_BUILD_TIME ?? ''
  return info || '未提供'
})
const frontendMode = import.meta.env.MODE ?? 'unknown'

const backendVersion = ref<BackendVersion>({})
const backendError = ref('')

async function loadBackendVersion() {
  try {
    const response = await fetch(`${apiBase}/api/version`)
    if (!response.ok) {
      throw new Error(`加载失败: ${response.status}`)
    }
    const data = (await response.json()) as BackendVersion
    backendVersion.value = data ?? {}
    backendError.value = ''
  } catch (error) {
    backendError.value = error instanceof Error ? error.message : '加载失败'
    backendVersion.value = {}
  }
}

onMounted(() => {
  void loadBackendVersion()
})
</script>

<template>
  <section class="about-page">
    <section class="intro-block">
      <div class="eyebrow">关于</div>
      <h1>关于 Vtix</h1>
    </section>

    <section class="about-block intro-card">
      <div class="section-head">
        <h2>为什么会有 vtix？</h2>
      </div>
      <p>因为刚开学就有开学考，给了一堆 pdf 文件，背诵及其不方便。我就自己写了一个练习的网站，逐步更新，到现在就成了 vtix。</p>
    </section>
    <section class="about-block">
      <div class="section-head">
        <h2>联系与贡献</h2>
        <p>欢迎反馈建议、贡献题目或参与开发。</p>
      </div>

      <div class="people-grid">
        <article class="people-card primary">
          <div class="people-avatar">Y</div>
          <div class="people-main">
            <div class="people-name">yemaster</div>
            <div class="people-role">主要维护者</div>
          </div>
          <div class="people-meta">
            <span>Github · @yemaster</span>
            <span>Mail · me@yemaster.cn</span>
            <span>QQ · 1440169768</span>
          </div>
        </article>

        <article class="people-card">
          <div class="people-avatar muted">I</div>
          <div class="people-main">
            <div class="people-name">Isaaczhr</div>
            <div class="people-role">贡献者</div>
          </div>
          <div class="people-meta">
            <span>Github · @Isaaczhr</span>
          </div>
        </article>

        <article class="people-card">
          <div class="people-avatar muted">E</div>
          <div class="people-main">
            <div class="people-name">Eric-ZhehanZ</div>
            <div class="people-role">贡献者</div>
          </div>
          <div class="people-meta">
            <span>Github · @Eric-ZhehanZ</span>
          </div>
        </article>
      </div>
    </section>

    <section class="about-block">
      <div class="section-head">
        <h2>版本与更新</h2>
        <p>系统版本信息与更新记录。</p>
      </div>
      <div class="version-grid">
        <div class="build-card">
          <div class="build-title">系统信息</div>
          <div class="build-item">
            <span>前端构建</span>
            <span class="build-value">{{ frontendBuildInfo }}</span>
          </div>
          <div class="build-item">
            <span>运行模式</span>
            <span class="build-value">{{ frontendMode }}</span>
          </div>
          <div class="build-item">
            <span>后端服务</span>
            <span class="build-value">{{ backendVersion.name || 'unknown' }}</span>
          </div>
          <div class="build-item">
            <span>后端版本</span>
            <span class="build-value">{{ backendVersion.version || 'unknown' }}</span>
          </div>
          <div v-if="backendVersion.buildTime" class="build-item">
            <span>构建时间</span>
            <span class="build-value">{{ backendVersion.buildTime }}</span>
          </div>
          <div v-if="backendError" class="build-note">无法获取后端版本：{{ backendError }}</div>
        </div>

        <div class="changelog-list">
          <article class="changelog-item">
            <div class="changelog-date">2026-01-30 更新</div>
            <ul>
              <li>新增上传 xlsx 文件导入题库</li>
              <li>新增用户空间、用户信息编辑</li>
              <li>新增题库管理、用户管理</li>
            </ul>
          </article>
          <article class="changelog-item">
            <div class="changelog-date">2026-01-29 更新</div>
            <ul>
              <li>新增题库上传、题库编辑</li>
              <li>新增云端同步做题记录</li>
              <li>新增错题管理</li>
            </ul>
          </article>
          <article class="changelog-item">
            <div class="changelog-date">2026-01-26 更新</div>
            <ul>
              <li style="color: #db2828">vtix-ng 版本启动，采用 PrimeVue + Elysia.js 完全重写</li>
              <li>UI 更新</li>
            </ul>
          </article>
          <div class="changelog-note">以下是旧版本更新日志</div>
          <article class="changelog-item">
            <div class="changelog-date">2025-05-21 更新</div>
            <ul>
              <li>新增 2025 近代史纲要</li>
              <li>新增题目解析</li>
            </ul>
          </article>
          <article class="changelog-item">
            <div class="changelog-date">2024-12-23 更新</div>
            <ul>
              <li>修复了导入存档无效的问题</li>
              <li>修复了存档删除后没用的问题</li>
            </ul>
          </article>
          <article class="changelog-item">
            <div class="changelog-date">2024-12-19 更新</div>
            <ul>
              <li>(@Zhehan-Z) 增加了存档的频率，放置存档丢失 Commit 3a30aaf</li>
            </ul>
          </article>
          <article class="changelog-item">
            <div class="changelog-date">2024-06-18 更新</div>
            <ul>
              <li>不同答题练习的存档分开储存，方便错题练习后重新回到相应答题中</li>
              <li>优化了部分界面</li>
            </ul>
          </article>
          <article class="changelog-item">
            <div class="changelog-date">2024-06-17 更新</div>
            <ul>
              <li>错题支持导出和导入 json 文件</li>
              <li>优化了性能</li>
              <li>优化了部分界面</li>
            </ul>
          </article>
          <article class="changelog-item">
            <div class="changelog-date">2023-12-28 更新</div>
            <ul>
              <li>我也不知道更新了什么</li>
            </ul>
          </article>
          <article class="changelog-item">
            <div class="changelog-date">2023-12-26 更新</div>
            <ul>
              <li>我也不知道更新了什么</li>
            </ul>
          </article>
          <article class="changelog-item">
            <div class="changelog-date">2023-12-21</div>
            <ul>
              <li>上线</li>
            </ul>
          </article>
          <article class="changelog-item">
            <div class="changelog-date">2023-05-21 更新</div>
            <ul>
              <li>全新界面，采用 Vue 3 和 Naive UI</li>
            </ul>
          </article>
        </div>
      </div>
    </section>
  </section>
</template>

<style scoped>
.about-page {
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.intro-block h1 {
  margin: 8px 0 6px;
  font-size: 30px;
  color: #0f172a;
}

.intro-block p {
  margin: 0;
  color: #6b7280;
}

.eyebrow {
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #9aa2b2;
}

.intro-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.intro-text {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: 760px;
}

.intro-tags {
  display: grid;
  gap: 6px;
  font-size: 12px;
  color: #64748b;
}

.about-block {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 18px;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.about-block.intro-card {
  background: #f8fafc;
  border-color: #dbeafe;
  position: relative;
  padding-left: 22px;
}

.about-block.intro-card p {
  margin: 0;
  color: #334155;
  font-size: 14px;
  line-height: 1.8;
}

.version-grid {
  display: grid;
  grid-template-columns: minmax(0, 320px) minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}

.build-card {
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  padding: 16px;
  background: #f8fafc;
  display: grid;
  gap: 10px;
}

.build-title {
  font-weight: 700;
  color: #0f172a;
  font-size: 15px;
}

.build-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: #475569;
  font-size: 13px;
}

.build-value {
  color: #0f172a;
  font-weight: 600;
}

.build-note {
  color: #b91c1c;
  font-size: 12px;
}

.section-head h2 {
  margin: 0;
  font-size: 18px;
  color: #0f172a;
}

.section-head p {
  margin: 6px 0 0;
  color: #64748b;
  font-size: 13px;
}

.people-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 14px;
}

.people-card {
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  padding: 16px;
  background: #ffffff;
  display: grid;
  gap: 10px;
}

.people-card.primary {
  border: 1px solid #dbeafe;
  background: linear-gradient(135deg, #eff6ff 0%, #ffffff 80%);
}

.people-avatar {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  background: #0f172a;
  color: #ffffff;
  font-weight: 700;
  display: grid;
  place-items: center;
}

.people-avatar.muted {
  background: #e2e8f0;
  color: #475569;
}

.people-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.people-name {
  font-weight: 700;
  color: #0f172a;
  font-size: 16px;
}

.people-role {
  font-size: 12px;
  color: #64748b;
}

.people-meta {
  display: grid;
  gap: 6px;
  font-size: 13px;
  color: #475569;
}

.changelog-list {
  display: grid;
  gap: 12px;
}

.changelog-item {
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  padding: 12px 14px;
  background: #ffffff;
}

.changelog-date {
  font-weight: 700;
  color: #0f172a;
  font-size: 13px;
  margin-bottom: 6px;
}

.changelog-item ul {
  margin: 0;
  padding-left: 18px;
  color: #475569;
  font-size: 13px;
  display: grid;
  gap: 6px;
}

.changelog-note {
  font-size: 12px;
  color: #94a3b8;
  margin: 4px 0 2px;
}

@media (max-width: 900px) {
  .version-grid {
    grid-template-columns: 1fr;
  }
}
</style>
