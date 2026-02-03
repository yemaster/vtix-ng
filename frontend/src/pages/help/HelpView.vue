<script setup lang="ts">
import Tag from 'primevue/tag'
</script>

<template>
  <section class="help-page">
    <header class="page-head">
      <div class="page-intro">
        <div class="eyebrow">帮助中心</div>
        <h1>如何使用 Vtix 答题自测</h1>
      </div>
      <div class="head-tags">
        <Tag value="快速上手" rounded />
        <Tag value="练习记录" severity="info" rounded />
        <Tag value="错题管理" severity="warning" rounded />
      </div>
    </header>

    <section class="quick-row">
      <article class="quick-card">
        <div class="quick-index">01</div>
        <div>
          <div class="quick-title">选择题库</div>
          <p>题库页支持标签与关键词筛选，快速找到目标内容。</p>
        </div>
      </article>
      <article class="quick-card">
        <div class="quick-index">02</div>
        <div>
          <div class="quick-title">开始练习</div>
          <p>顺序、乱序、错题回顾与模拟考试自由切换。</p>
        </div>
      </article>
      <article class="quick-card">
        <div class="quick-index">03</div>
        <div>
          <div class="quick-title">复盘管理</div>
          <p>错题自动沉淀，记录导出/导入与云端同步。</p>
        </div>
      </article>
    </section>

    <section class="content-grid">
      <div class="guide-section">
        <div class="section-head">
          <h2>核心功能</h2>
          <p>覆盖从题库选择到数据复盘的完整路径。</p>
        </div>
        <section class="guide-grid">
          <article class="guide-card">
            <div class="card-title">浏览题库</div>
            <p>进入“题库”页面查看公开题库，可使用标签与关键词快速筛选。</p>
            <div class="card-steps">
              <span>题库列表 → 选择题库 → 点击进入做题</span>
            </div>
          </article>

          <article class="guide-card">
            <div class="card-title">开始练习</div>
            <p>做题页面支持顺序、乱序、自定义、错题回顾与模拟考试模式。</p>
            <div class="card-steps">
              <span>快捷键：Q/W/E/R 选择 · Enter 提交 · ←/→ 切题</span>
            </div>
          </article>

          <article class="guide-card">
            <div class="card-title">模拟考试</div>
            <p>模拟考试按大题顺序出题，交卷后自动评分并展示得分。</p>
            <div class="card-steps">
              <span>切换模拟考试 → 作答 → 交卷 → 查看得分</span>
            </div>
          </article>

          <article class="guide-card">
            <div class="card-title">做题记录</div>
            <p>记录页面可查看历史练习，支持导入/导出与云端同步。</p>
            <div class="card-steps">
              <span>记录页面 → 导出/导入 → 同步云端</span>
            </div>
          </article>

          <article class="guide-card">
            <div class="card-title">错题管理</div>
            <p>错题会自动保存，支持按题库/题型筛选与批量删除。</p>
            <div class="card-steps">
              <span>错题管理 → 筛选 → 练习/删除</span>
            </div>
          </article>

          <article class="guide-card">
            <div class="card-title">创建题库</div>
            <p>创建题库后可在管理页面继续编辑与维护题目。</p>
            <div class="card-steps">
              <span>新建题库 → 编辑题目 → 发布/保存</span>
            </div>
          </article>
        </section>

        <section class="qa-section">
          <div class="section-head">
            <h2>常见问题 Q&A</h2>
            <p>快速解决练习与记录相关的疑问。</p>
          </div>
          <div class="qa-list">
            <article class="qa-item">
              <div class="qa-q">Q：我如何继续之前的练习？</div>
              <div class="qa-a">A：进入题库后，会自动继续最近的一次练习。也可以进入题库的练习记录页面（电脑端点击导航条中的做题记录，手机端点击底部的记录），可以选择练习继续。也可以在做题记录管理页面进入。</div>
            </article>
            <article class="qa-item">
              <div class="qa-q">Q：练习记录会自动保存吗？</div>
              <div class="qa-a">A：会。做题过程中会定期保存，离开页面也会自动保存最近记录。</div>
            </article>
            <article class="qa-item">
              <div class="qa-q">Q：错题如何再次练习？</div>
              <div class="qa-a">A：在“错题管理”中按题库筛选，进入错题回顾模式即可重做。</div>
            </article>
            <article class="qa-item">
              <div class="qa-q">Q：如何同步到云端？</div>
              <div class="qa-a">A：登录后在记录页面点击“同步”，即可将本地记录上传并合并云端数据。</div>
            </article>
            <article class="qa-item">
              <div class="qa-q">Q：可以导入历史练习记录吗？</div>
              <div class="qa-a">A：可以。在记录页面选择“导入”，上传之前导出的记录文件即可。</div>
            </article>
            <article class="qa-item">
              <div class="qa-q">Q：我还有其他的问题。</div>
              <div class="qa-a">A：联系 yemaster，在关于页面查看联系方法。</div>
            </article>
          </div>
        </section>
      </div>

      <aside class="side-panel">
        <div class="panel">
          <div class="panel-title">快捷键速查</div>
          <div class="shortcut-grid">
            <div class="shortcut-item">
              <span class="shortcut-key">Q/W/E/R</span>
              <span class="shortcut-text">选择选项</span>
            </div>
            <div class="shortcut-item">
              <span class="shortcut-key">Enter</span>
              <span class="shortcut-text">提交答案</span>
            </div>
            <div class="shortcut-item">
              <span class="shortcut-key">← / →</span>
              <span class="shortcut-text">切换题目</span>
            </div>
            <div class="shortcut-item">
              <span class="shortcut-key">Esc</span>
              <span class="shortcut-text">退出浮层</span>
            </div>
          </div>
        </div>

        <div class="panel">
          <div class="panel-title">数据管理</div>
          <ul class="panel-list">
            <li>记录页支持导入/导出与备份文件下载。</li>
            <li>错题管理支持批量删除与分题库筛选。</li>
            <li>云端同步开启后，跨设备可继续练习。</li>
          </ul>
        </div>

        <div class="panel highlight">
          <div class="panel-title">小贴士</div>
          <p>建议每次练习后查看“错题管理”，标注重点题并快速回顾。</p>
        </div>
      </aside>
    </section>
  </section>
</template>

<style scoped>
.help-page {
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding: 20px 22px;
  border-radius: 18px;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  position: relative;
  overflow: hidden;
}

.page-head::after {
  content: none;
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

.page-intro {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.eyebrow {
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #9aa2b2;
}

.intro-meta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #64748b;
  margin-top: 4px;
}

.meta-dot {
  color: var(--vtix-primary-200);
}

.head-tags {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.quick-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
}

.quick-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  border-radius: 16px;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  box-shadow: 0 10px 20px rgba(15, 23, 42, 0.06);
}

.quick-index {
  font-weight: 700;
  font-size: 14px;
  color: var(--vtix-primary-700);
  background: var(--vtix-primary-100);
  border-radius: 10px;
  padding: 4px 8px;
}

.quick-title {
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 4px;
}

.quick-card p {
  margin: 0;
  font-size: 13px;
  color: #64748b;
  line-height: 1.5;
}

.content-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 18px;
  align-items: start;
}

.section-head {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
}

.section-head h2 {
  margin: 0;
  font-size: 18px;
  color: #0f172a;
}

.section-head p {
  margin: 0;
  font-size: 13px;
  color: #6b7280;
}

.guide-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
}

.guide-card {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  padding: 16px 16px 14px;
  box-shadow: 0 12px 22px rgba(15, 23, 42, 0.06);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.card-title {
  font-weight: 700;
  color: #0f172a;
}

.guide-card p {
  margin: 0;
  color: #6b7280;
  font-size: 13px;
  line-height: 1.6;
}

.card-steps {
  font-size: 12px;
  color: #475569;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 8px 10px;
}

.qa-section {
  margin-top: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.qa-list {
  display: grid;
  gap: 12px;
}

.qa-item {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.qa-q {
  font-weight: 700;
  color: #0f172a;
  font-size: 14px;
}

.qa-a {
  color: #64748b;
  font-size: 13px;
  line-height: 1.6;
}

.side-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  position: sticky;
  top: 96px;
}

.panel {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  padding: 14px 14px 16px;
  box-shadow: 0 10px 20px rgba(15, 23, 42, 0.05);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.panel-title {
  font-weight: 700;
  color: #0f172a;
  font-size: 14px;
}

.shortcut-grid {
  display: grid;
  gap: 10px;
}

.shortcut-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 12px;
  color: #64748b;
}

.shortcut-key {
  font-weight: 700;
  color: #1e293b;
  background: #f1f5f9;
  border-radius: 10px;
  padding: 4px 8px;
  border: 1px solid #e2e8f0;
  min-width: 72px;
  text-align: center;
}

.panel-list {
  margin: 0;
  padding-left: 16px;
  color: #64748b;
  font-size: 12px;
  display: grid;
  gap: 6px;
}

.panel.highlight {
  background: linear-gradient(135deg, var(--vtix-primary-50) 0%, var(--vtix-primary-100) 100%);
  border-color: var(--vtix-primary-200);
}

.panel.highlight p {
  margin: 0;
  color: #0f172a;
  font-size: 13px;
  line-height: 1.6;
}

@media (max-width: 900px) {
  .page-head {
    flex-direction: column;
  }

  .content-grid {
    grid-template-columns: 1fr;
  }

  .side-panel {
    position: static;
  }
}
</style>
