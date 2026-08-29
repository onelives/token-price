#!/usr/bin/env node
// 读取 data/prices.json + template.html → 生成 index.html（数据驱动，结构不变）
import { MODELS, linksFor, ORIGIN_LABEL } from './config.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const prices = JSON.parse(readFileSync(join(ROOT, 'data', 'prices.json'), 'utf-8'));
let template = readFileSync(join(ROOT, 'template.html'), 'utf-8');

const n = (v) => String(v);
function fmtNum(x) {
  return String(Math.round(x * 100) / 100);
}

// ===== 1) DATA 数组 =====
function genData() {
  const items = MODELS.map((m) => {
    const b = prices.models[m.id]?.bailian ?? {};
    const o = prices.models[m.id]?.origin ?? null;
    const { linkBailian, linkOrigin } = linksFor(m);
    const bi = b.batchIn == null ? 'null' : n(b.batchIn);
    const bo = b.batchOut == null ? 'null' : n(b.batchOut);
    const L = [];
    L.push(`    {`);
    L.push(`      id: '${m.id}', label: '${m.label}', vendor: '${m.vendor}',`);
    L.push(`      bailian: { inP: ${n(b.in)}, outP: ${n(b.out)}, cacheIn: ${n(b.cacheIn)}, batchIn: ${bi}, batchOut: ${bo} },`);
    if (m.snapAvg) {
      L.push(`      snapAvg: { name: '${m.snapAvg.name}', inP: ${n(m.snapAvg.inP)}, outP: ${n(m.snapAvg.outP)} },`);
    }
    if (o) {
      const off = o.offPeak
        ? `, offPeak: { inP: ${n(o.offPeak.in)}, outP: ${n(o.offPeak.out)}, cacheIn: ${n(o.offPeak.cacheIn)} }`
        : '';
      L.push(`      origin: { inP: ${n(o.in)}, outP: ${n(o.out)}, cacheIn: ${n(o.cacheIn)}${off} },`);
      L.push(`      linkBailian: '${linkBailian}',`);
      L.push(`      linkOrigin: '${linkOrigin}'`);
    } else {
      L.push(`      origin: null, originNote: '${m.originNote}',`);
      L.push(`      linkBailian: '${linkBailian}', linkOrigin: null`);
    }
    L.push(`    }`);
    return L.join('\n');
  });
  return '[\n' + items.join(',\n') + '\n  ]';
}

// ===== 2) 三源总表 tbody =====
function discountChip(cacheIn, inP) {
  const d = (cacheIn / inP) * 10; // 折数
  if (d >= 1) return `缓存${fmtNum(d)}折`;
  return `缓存约${fmtNum(Math.round(d * 10) / 10)}折`;
}

function genSummaryRows() {
  return MODELS.map((m) => {
    const b = prices.models[m.id].bailian;
    const o = prices.models[m.id].origin;
    const { linkBailian, linkOrigin } = linksFor(m);
    const lowest = `<td class="num">${n(b.cacheIn)} <span class="chip hot">${discountChip(b.cacheIn, b.in)}</span></td>`;
    let originCell, originCache, links;
    if (o) {
      originCell = `${n(o.in)} / ${n(o.out)}`;
      if (o.offPeak) originCell += ` <span class="dim">（高峰；闲 ${n(o.offPeak.in)}/${n(o.offPeak.out)}）</span>`;
      originCache = n(o.cacheIn);
      links = `<a href="${linkBailian}">百炼</a> · <a href="${linkOrigin}">${ORIGIN_LABEL[m.origin]}</a>`;
    } else {
      originCell = `${n(b.in)} / ${n(b.out)} <span class="dim">（原厂=百炼）</span>`;
      originCache = n(b.cacheIn);
      links = `<a href="${linkBailian}">百炼文档</a>`;
    }
    return `<tr><td>${m.id}</td><td class="num">${n(b.in)} / ${n(b.out)}</td>${lowest}<td class="num">${originCell}</td><td class="num">${originCache}</td><td>${links}</td></tr>`;
  }).join('\n');
}

// ===== 3) 「重要」规则（原厂 vs 百炼基数差异，计算得出）=====
function ratioPhrase(r) {
  if (Math.abs(r - 1) < 0.005) return '同价';
  if (r >= 2) return `高 ${fmtNum(r)} 倍`;
  const d = Math.abs(r - 1) * 100;
  return (r > 1 ? '高 ' : '低 ') + fmtNum(d) + '%';
}
function genImportantRule() {
  const parts = MODELS.filter((m) => m.origin).map((m) => {
    const b = prices.models[m.id].bailian;
    const o = prices.models[m.id].origin;
    const inPh = ratioPhrase(o.in / b.in);
    const outPh = ratioPhrase(o.out / b.out);
    if (inPh === '同价' && outPh === '同价') {
      return `${m.label} 两边同价（${fmtNum(o.in)}/${fmtNum(o.out)}）`;
    }
    return `${m.label} 原厂高峰 ${fmtNum(o.in)}/${fmtNum(o.out)} vs 百炼 ${fmtNum(b.in)}/${fmtNum(b.out)}：输入${inPh}、输出${outPh}`;
  });
  return `<b>原厂 vs 百炼基数差异</b>——${parts.join('；')}。千问系列原厂即阿里云百炼。DeepSeek 原厂为闲/忙分档，此处取高峰时段，闲时半价。`;
}

// ===== 4) 组装 =====
template = template.replace('__META_DATE__', prices.updatedAt);
template = template.replace('__DATA__', genData());
template = template.replace('__REF_SUMMARY_ROWS__', genSummaryRows());
template = template.replace('__REF_RULE_IMPORTANT__', genImportantRule());

// 校验占位符全部被替换
for (const tok of ['__META_DATE__', '__DATA__', '__REF_SUMMARY_ROWS__', '__REF_RULE_IMPORTANT__']) {
  if (template.includes(tok)) throw new Error(`占位符未替换：${tok}`);
}

writeFileSync(join(ROOT, 'index.html'), template);
console.log('index.html 已生成（更新于 ' + prices.updatedAt + '）');
