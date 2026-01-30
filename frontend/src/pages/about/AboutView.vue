<template>
  <section class="about-page">
    <header class="page-head">
      <div>
        <div class="eyebrow">关于</div>
        <h1>关于我们</h1>
        <p>这部分还懒得写</p>
      </div>
    </header>

    <section class="about-block">
      <div class="section-head">
        <h2>开发者</h2>
        <p>如果你也想参与本项目的开发（无论有没有基础，有兴趣即可），或者单纯是提意见，也可以是贡献题目，请联系 yemaster！</p>
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
        <h2>更新日志</h2>
        <p>版本记录与功能更新会在这里持续补充。</p>
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
        <h3>以下是旧版本更新日志</h3>
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
    </section>
  </section>
</template>

<style scoped>
.about-page {
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.page-head h1 {
  margin: 8px 0 6px;
  font-size: 30px;
  color: #0f172a;
}

.page-head p {
  margin: 0;
  color: #6b7280;
}

.eyebrow {
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #9aa2b2;
}

.about-block {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 18px;
  padding: 18px;
  box-shadow: 0 14px 26px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 16px;
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
  box-shadow: 0 10px 20px rgba(15, 23, 42, 0.05);
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
</style>
