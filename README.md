# token-price · 百炼三向价格对比

「我方折扣 × 百炼官网 × 模型原厂」三方 API 价格同屏对比页，由 **GitHub Actions 每天定时抓取官方价格**，自动更新并发布到 GitHub Pages，防止价格信息滞后。

在线地址：<https://onelives.github.io/token-price/>

## 覆盖模型

| 模型 | 百炼 | 原厂 |
|---|---|---|
| qwen3.8-max / 3.7-max / 3.7-plus | ✅ 每日自动 | 原厂即百炼（无独立价） |
| deepseek-v4-pro / v4-flash | ✅ 每日自动 | ✅ DeepSeek 官方（高峰/闲时） |
| glm-5.2 | ✅ 每日自动 | ⚠️ 智谱（SPA 需鉴权，暂手动核验） |

## 如何工作

```
GitHub Actions（每天 09:17 北京时间，cron '17 1 * * *'）
  ├─ scripts/fetch.mjs   抓百炼 + DeepSeek 官方页 → data/prices.json（仅价格变化时写入）
  ├─ scripts/build.mjs   读 prices.json + template.html → 生成 index.html
  ├─ scripts/test.js     端到端测试（jsdom 加载真实页面）
  └─ 有变化则 commit + push → GitHub Pages 自动重新部署
```

- **只提交真实变化**：价格没变就不 commit，避免每天产生空提交。
- **单源失败不阻塞**：百炼 / DeepSeek 独立抓取，某源失败保留上次值并在日志标注。

## 数据源（均为官方页面）

- 百炼模型文档：`https://help.aliyun.com/zh/model-studio/{slug}`
- DeepSeek 定价：`https://api-docs.deepseek.com/zh-cn/quick_start/pricing`
- 智谱定价：`https://open.bigmodel.cn/pricing`
- 百炼计费总则：`https://help.aliyun.com/zh/model-studio/billing-for-model-studio`

价格单位统一为**元/百万 token**（页内可切「亿 token」= ×100）。DeepSeek 原厂为闲/忙分档，对比取**高峰时段**作标准价（保守口径），闲时半价在卡片与总表中注明。qwen3.7-plus 为长度分档计价，取基础档（输入 ≤256k）。

## 我方折扣

页面左栏填入折扣（`8` = 8 折，支持小数），我方价 = 百炼标准价 × 折数 ÷ 10，金额与差额自动计算。折数只存在浏览器 localStorage（本机，不上传），自动化不触碰这一列。

## 本地开发

```bash
npm install          # 安装 jsdom（仅测试用）
node scripts/fetch.mjs   # 抓价 → data/prices.json
node scripts/build.mjs   # 生成 index.html
node scripts/test.js     # 端到端测试
```

## 已知限制（v1）

- **智谱原厂**：`open.bigmodel.cn/pricing` 是 Vue SPA、接口需鉴权，v1 暂不自动抓取，GLM-5.2 原厂价人工核验（当前与百炼同价 8/28）。后续可加 Playwright 无头浏览器方案。
- **快照版（-0731/-0813）闲忙时**：百炼快照版模型页未纳入自动抓取，参考表中该部分为静态值。
- 各源若改版导致解析失败，`fetch.mjs` 会保留旧值并在运行日志标注，需人工跟进。
