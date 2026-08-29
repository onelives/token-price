#!/usr/bin/env node
// 抓取百炼 + DeepSeek 官方价格 → 写入 data/prices.json（仅当价格变化时更新）
// 智谱原厂为 SPA（需鉴权），v1 暂不自动抓取，保留上次人工核验值。
import { MODELS, LINKS } from './config.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PRICES_PATH = join(ROOT, 'data', 'prices.json');

const UA = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

async function fetchText(url) {
  let lastErr;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: UA, redirect: 'follow' });
      if (r.ok) return await r.text();
      lastErr = new Error(`HTTP ${r.status}`);
    } catch (e) { lastErr = e; }
    await new Promise((res) => setTimeout(res, 1000 * (i + 1)));
  }
  throw lastErr;
}

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '|')
    .replace(/\|+/g, '|')
    .replace(/\s+/g, ' ');
}

// 百炼：静态 HTML，定位「模型价格」→ 华北2（北京）段，提取各计费项价格
function parseBailian(html) {
  const i = html.indexOf('模型价格');
  if (i < 0) throw new Error('未找到「模型价格」');
  const text = stripTags(html.slice(i, i + 20000));
  const cut = text.indexOf('新加坡');
  const beijing = cut > 0 ? text.slice(0, cut) : text;
  const get = (label) => {
    const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = beijing.match(new RegExp(esc + '\\|([\\d.]+)'));
    return m ? Number(m[1]) : null;
  };
  const inP = get('输入');
  const outP = get('输出');
  const cacheIn = get('输入（缓存命中）');
  const batchIn = get('输入（Batch File）');
  const batchOut = get('输出（Batch File）');
  if (inP == null || outP == null || cacheIn == null) {
    throw new Error(`百炼解析不完整：in=${inP} out=${outP} cache=${cacheIn}`);
  }
  return { in: inP, out: outP, cacheIn, batchIn, batchOut };
}

// DeepSeek 原厂：静态 HTML 表格，三列 = [flash, pro, flash-vision-exp]
function parseDeepSeek(html) {
  const region = html.match(/<td rowspan="6">价格([\s\S]*?)<td colspan="3">并发限制/);
  if (!region) throw new Error('DeepSeek 价格表未找到');
  const r = region[1];
  function metric(key) {
    const idx = r.indexOf(key);
    if (idx < 0) throw new Error('未找到 metric: ' + key);
    const seg = r.slice(idx);
    const off = seg.match(/空闲时段<\/td><td>([\d.]+)元<\/td><td>([\d.]+)元/);
    const peak = seg.match(/高峰时段<\/td><td>([\d.]+)元<\/td><td>([\d.]+)元/);
    if (!off || !peak) throw new Error('metric 解析失败: ' + key);
    return { off: [Number(off[1]), Number(off[2])], peak: [Number(peak[1]), Number(peak[2])] };
  }
  const cache = metric('（缓存命中）');
  const input = metric('（缓存未命中）');
  const output = metric('百万tokens输出');
  return {
    'deepseek-v4-flash': {
      in: input.peak[0], out: output.peak[0], cacheIn: cache.peak[0],
      offPeak: { in: input.off[0], out: output.off[0], cacheIn: cache.off[0] },
    },
    'deepseek-v4-pro': {
      in: input.peak[1], out: output.peak[1], cacheIn: cache.peak[1],
      offPeak: { in: input.off[1], out: output.off[1], cacheIn: cache.off[1] },
    },
  };
}

function canonical(obj) {
  if (Array.isArray(obj)) return obj.map(canonical);
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const k of Object.keys(obj).sort()) out[k] = canonical(obj[k]);
    return out;
  }
  return obj;
}

function readPrices() {
  try {
    return JSON.parse(readFileSync(PRICES_PATH, 'utf-8'));
  } catch {
    return { models: {}, status: {} };
  }
}

async function main() {
  const prev = readPrices();
  const models = {};

  // 1) 百炼（6 模型）
  let bailianStatus = 'ok';
  for (const m of MODELS) {
    models[m.id] = { bailian: null, origin: null };
    try {
      models[m.id].bailian = parseBailian(await fetchText(LINKS.bailian(m.slug)));
    } catch (e) {
      models[m.id].bailian = prev.models?.[m.id]?.bailian ?? null;
      bailianStatus = 'partial';
      console.error(`[百炼] ${m.id} 抓取失败：${e.message}`);
    }
  }

  // 2) DeepSeek 原厂（覆盖 v4-pro / v4-flash 的 origin）
  let dsStatus = 'ok';
  try {
    const ds = parseDeepSeek(await fetchText(LINKS.deepseek));
    for (const id of ['deepseek-v4-pro', 'deepseek-v4-flash']) {
      models[id].origin = ds[id];
    }
  } catch (e) {
    dsStatus = 'stale';
    for (const id of ['deepseek-v4-pro', 'deepseek-v4-flash']) {
      models[id].origin = prev.models?.[id]?.origin ?? null;
    }
    console.error(`[DeepSeek] 抓取失败：${e.message}`);
  }

  // 3) 智谱原厂：v1 手动，保留上次值
  models['glm-5.2'].origin = prev.models?.['glm-5.2']?.origin ?? null;

  // 仅当价格真正变化时写入（避免每天产生无意义 diff/提交）
  const changed = JSON.stringify(canonical(models)) !== JSON.stringify(canonical(prev.models));
  if (!changed) {
    console.log('价格无变化，跳过写入');
    return;
  }

  writeFileSync(PRICES_PATH, JSON.stringify({
    updatedAt: today(),
    status: { bailian: bailianStatus, deepseek: dsStatus, bigmodel: 'manual' },
    models,
  }, null, 2) + '\n');
  console.log(`价格已更新（${today()}）：bailian=${bailianStatus} deepseek=${dsStatus}`);
}

main().catch((e) => {
  console.error('fetch 失败：', e);
  process.exit(1);
});
