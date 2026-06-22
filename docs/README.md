# vtix-ng

## 什么是 vtix-ng?

vtix-ng 是 vtix 的下一代版本。因为学校开学有校规校纪等考试，另外很多政治课也有机考，vtix 的出现受到了同学们的广泛好评。

但是，因为没有提前的规划，vtix 的代码以及一些功能设计上仍有很多的不足，所以现在有了 vtix-ng。

**欢迎更多小伙伴加入开发！！！**

- Website: [https://ti.u5tc.cn](https://ti.u5tc.cn)
- blog: [https://blog.yemaster.cn](https://blog.yemaster.cn)

## Features

- 支持多种题目类型：单选题、多选题、判断题、填空题
- 丰富练习方式：顺序练习，乱序练习，自定义练习，错题练习，模拟测试
- 导入导出错题记录
- 题库广场，上传自己的题库
- 题库大乱斗，和其他用户 1v1 匹配对战
- 做题信息多端互通
- AI 题目解析，做题时一键生成解析（接入学校大模型平台，支持用户自定义服务商）
- 站内消息，接收题库审核结果等通知

## 常见题库导入代码

### 中国近现代史纲要 题目导入

选择文件导入解析 - 上传 xlsx 文件 - 输入如下代码 - 解析并覆盖题目 - 保存

```javascript
// row 为当前行数据
// useHeaderRow = true 时，row 为对象；否则为数组
// 返回 null/undefined 表示跳过该行

const source = row['目录'];
const problem = row['大题题干'];
const typeDict = {
     "单选题": 1,
     "多选题": 2,
     "填空题": 3,
     "判断题": 4,
}
const type = typeDict[row['题目类型']];
const difficulty = row['难易度'];
let title = `${problem}
来源:${source}`;
if (difficulty) { title += `,难度:${difficulty}`; }
const hint = row['答案解析'] ?? '';
let answer;
if (type === 1 || type === 4) { answer = "ABCDEFG".indexOf(row['正确答案']); }
else if (type === 2) { answer = []; for (const a of row['正确答案']) { answer.push("ABCDEFG".indexOf(a)); } }
else { answer = row['正确答案']; }

return {
  title,
  type,
  choices: [row['选项A'], row['选项B'], row['选项C'], row['选项D']].filter(Boolean),
  answer,
  hint
}
```

## 文档

- [部署文档](./DEPLOYMENT.md) — 环境要求、后端/前端部署、Nginx 反代、环境变量
- [后端 API 文档](./backend-api.md) — 全部 HTTP 接口与 Socket.IO 事件协议
- [人工测试清单](./manual-test-checklist.md) — 核心功能的人工测试项
