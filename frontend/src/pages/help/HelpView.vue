<template>
  <section class="help-page">
    <section class="intro-block">
      <div class="eyebrow">帮助中心</div>
      <h1>如何使用 Vtix 答题自测</h1>
    </section>

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
              <div class="qa-a">A：会。做题过程中会定期保存，离开页面也会自动保存最近记录。登录之后，还可以在云端同步。</div>
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
              <div class="qa-q">Q：我还有其他的问题 / 有 bug 需要反馈！</div>
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

.intro-block h1 {
  margin: 8px 0 6px;
  font-size: 30px;
  color: var(--vtix-text-strong);
}

.intro-block p {
  margin: 0;
  color: var(--vtix-text-muted);
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
  color: var(--vtix-text-subtle);
}

.intro-meta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--vtix-text-muted);
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
  background: var(--vtix-surface);
  border: 1px solid var(--vtix-border);
  box-shadow: 0 10px 20px var(--vtix-shadow-soft);
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
  color: var(--vtix-text-strong);
  margin-bottom: 4px;
}

.quick-card p {
  margin: 0;
  font-size: 13px;
  color: var(--vtix-text-muted);
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
  color: var(--vtix-text-strong);
}

.section-head p {
  margin: 0;
  font-size: 13px;
  color: var(--vtix-text-muted);
}

.guide-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
}

.guide-card {
  background: var(--vtix-surface);
  border: 1px solid var(--vtix-border);
  border-radius: 16px;
  padding: 16px 16px 14px;
  box-shadow: 0 12px 22px var(--vtix-shadow-soft);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.card-title {
  font-weight: 700;
  color: var(--vtix-text-strong);
}

.guide-card p {
  margin: 0;
  color: var(--vtix-text-muted);
  font-size: 13px;
  line-height: 1.6;
}

.card-steps {
  font-size: 12px;
  color: var(--vtix-text-muted);
  background: var(--vtix-surface-2);
  border: 1px solid var(--vtix-border-strong);
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
  background: var(--vtix-surface);
  border: 1px solid var(--vtix-border);
  border-radius: 14px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.qa-q {
  font-weight: 700;
  color: var(--vtix-text-strong);
  font-size: 14px;
}

.qa-a {
  color: var(--vtix-text-muted);
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
  background: var(--vtix-surface);
  border: 1px solid var(--vtix-border);
  border-radius: 16px;
  padding: 14px 14px 16px;
  box-shadow: 0 10px 20px var(--vtix-shadow-soft);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.panel-title {
  font-weight: 700;
  color: var(--vtix-text-strong);
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
  color: var(--vtix-text-muted);
}

.shortcut-key {
  font-weight: 700;
  color: var(--vtix-text-strong);
  background: var(--vtix-surface-3);
  border-radius: 10px;
  padding: 4px 8px;
  border: 1px solid var(--vtix-border-strong);
  min-width: 72px;
  text-align: center;
}

.panel-list {
  margin: 0;
  padding-left: 16px;
  color: var(--vtix-text-muted);
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
  color: var(--vtix-text-strong);
  font-size: 13px;
  line-height: 1.6;
}

@media (max-width: 900px) {
  .content-grid {
    grid-template-columns: 1fr;
  }

  .side-panel {
    position: static;
  }
}
</style>
