// 端到端测试：加载生成的 index.html，核对单表渲染、价格超链接、计费与折扣计算。
// 基准价从 data/prices.json 读取，价格更新后测试依然有效。
const { JSDOM } = require(require.resolve('jsdom', { paths: [process.cwd(), __dirname, '/tmp/bltest'] }));
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const htmlPath = process.argv[2] || path.join(ROOT, 'index.html');
const html = fs.readFileSync(htmlPath, 'utf-8');
const prices = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'prices.json'), 'utf-8'));

const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true });
const { window } = dom;
const { document } = window;

let pass = 0, fail = 0;
function check(desc, actual, expected) {
  const ok = actual === expected;
  ok ? pass++ : fail++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + desc + (ok ? '' : `  → 实际「${actual}」期望「${expected}」`));
}

// 与页面 fmtMoney 一致（百万单位 factor=1）
function fmt(v) { return String(Math.round(v * 100) / 100); }
function fmtMoney(v, factor) {
  const s = Math.round(v * factor * 100) / 100;
  if (Math.abs(s) >= 1000) return s.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
  return String(s);
}

const IDS = Object.keys(prices.models); // 与速览表行序一致
const SLUG = {
  'qwen3.8-max': 'qwen3-8-max', 'qwen3.7-max': 'qwen3-7-max', 'qwen3.7-plus': 'qwen3-7-plus',
  'deepseek-v4-pro': 'deepseek-v4-pro', 'deepseek-v4-flash': 'deepseek-v4-flash', 'glm-5.2': 'glm-5-2',
};
const BAILIAN = (id) => 'https://help.aliyun.com/zh/model-studio/' + SLUG[id];
const ORIGIN_BY_ID = {
  'deepseek-v4-pro': 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing',
  'deepseek-v4-flash': 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing',
  'glm-5.2': 'https://open.bigmodel.cn/pricing',
};

function setRate(modelId, rate) {
  const el = document.getElementById('rate-' + modelId);
  el.value = String(rate);
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
}
// 速览表行单元格：[模型, 折扣, 我方, 百炼, 原厂]
function ovRow(i) {
  const rows = document.querySelectorAll('#overview .ov-tbl tbody tr');
  return Array.from(rows[i].querySelectorAll('td'));
}
function ovText(i, from) { return ovRow(i).slice(2).map((td) => td.textContent.trim())[from - 2]; }
function ovHref(i, from) {
  const a = ovRow(i)[from].querySelector('a');
  return a ? a.getAttribute('href') : null;
}
function ovTarget(i, from) {
  const a = ovRow(i)[from].querySelector('a');
  return a ? a.getAttribute('target') : null;
}
function myCell(i) { return ovText(i, 2); }

console.log('\n【1】页面结构：单表速览，无卡片，折扣默认 0');
{
  check('速览表共 ' + IDS.length + ' 行', document.querySelectorAll('#overview .ov-tbl tbody tr').length, IDS.length);
  check('无模型卡片', document.querySelectorAll('.card').length, 0);
  check('有单位切换', !!document.getElementById('btn-m') && !!document.getElementById('btn-y'), true);
  check('折扣输入默认 0', document.getElementById('rate-qwen3.8-max').value, '0');
  check('qwen3.8-max 我方列默认 0 折', myCell(0), '0 / 0');
}

console.log('\n【2】速览表百炼/原厂列与 prices.json 一致');
{
  IDS.forEach((id, i) => {
    const b = prices.models[id].bailian;
    const o = prices.models[id].origin;
    const ogIn = o ? o.in : b.in;
    const ogOut = o ? o.out : b.out;
    check(id + ' 百炼列', ovText(i, 3), fmt(b.in) + ' / ' + fmt(b.out));
    const ogExpected = o
      ? fmt(ogIn) + ' / ' + fmt(ogOut)
      : fmt(ogIn) + ' / ' + fmt(ogOut) + ' (=百炼)';
    check(id + ' 原厂列', ovText(i, 4), ogExpected);
  });
}

console.log('\n【3】价格超链接：百炼/原厂列指向官方页，我方价无链接');
{
  IDS.forEach((id, i) => {
    setRate(id, 8); // 我方价需折扣计算后才显示（该列无链接）
    const expectedBailian = BAILIAN(id);
    check(id + ' 百炼价链接→百炼', ovHref(i, 3), expectedBailian);
    const expectedOrigin = ORIGIN_BY_ID[id] || BAILIAN(id);
    check(id + ' 原厂价链接→' + (ORIGIN_BY_ID[id] || '百炼(=原厂)'), ovHref(i, 4), expectedOrigin);
    check(id + ' 链接新窗口打开', ovTarget(i, 3), '_blank');
    check(id + ' 我方价列无链接', ovRow(i)[2].querySelector('a') === null, true);
  });
}

console.log('\n【4】折扣计算：填 8 折，我方 = 百炼标准价 × 0.8');
{
  IDS.forEach((id, i) => {
    const b = prices.models[id].bailian;
    setRate(id, 8);
    check(id + ' 我方价 ' + fmt(b.in * 0.8) + '/' + fmt(b.out * 0.8), myCell(i), fmt(b.in * 0.8) + ' / ' + fmt(b.out * 0.8));
  });
}

console.log('\n【5】计费模拟：多档折扣（deepseek-v4-pro，百炼 12/24）');
{
  const b = prices.models['deepseek-v4-pro'].bailian;
  const i = IDS.indexOf('deepseek-v4-pro');
  const cases = [
    [10, '原价（10 折）', fmt(b.in) + ' / ' + fmt(b.out)],
    [6.5, '6.5 折', fmt(b.in * 0.65) + ' / ' + fmt(b.out * 0.65)],
    [0.5, '0.5 折', fmt(b.in * 0.05) + ' / ' + fmt(b.out * 0.05)],
    [0, '0 折', '0 / 0'],
    [15, '超过 10（15 折按公式）', fmt(b.in * 1.5) + ' / ' + fmt(b.out * 1.5)],
  ];
  for (const [rate, label, expected] of cases) {
    setRate('deepseek-v4-pro', rate);
    check('折扣 ' + rate + '（' + label + '）', myCell(i), expected);
  }
}

console.log('\n【6】计费模拟：空值与非法输入按默认 0 处理');
{
  const i = IDS.indexOf('deepseek-v4-pro');
  const el = document.getElementById('rate-deepseek-v4-pro');
  el.value = '';
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
  check('清空 → 0 折', myCell(i), '0 / 0');
  el.value = 'abc';
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
  check('非法输入 abc → 0 折', myCell(i), '0 / 0');
}

console.log('\n【7】计费显示：切到亿 token（×100）');
{
  document.getElementById('btn-y').dispatchEvent(new window.Event('click'));
  const b = prices.models['deepseek-v4-pro'].bailian;
  check('deepseek-v4-pro 百炼输出 亿', ovText(IDS.indexOf('deepseek-v4-pro'), 3).split(' / ')[1], fmtMoney(b.out, 100));
}

console.log('\n【8】切回百万 token（还原）');
{
  document.getElementById('btn-m').dispatchEvent(new window.Event('click'));
  const b = prices.models['deepseek-v4-pro'].bailian;
  setRate('deepseek-v4-pro', 8);
  check('deepseek-v4-pro 我方输入还原 百万', myCell(IDS.indexOf('deepseek-v4-pro')).split(' / ')[0], fmt(b.in * 0.8));
}

console.log('\n【9】清空折扣收尾');
{
  setRate('glm-5.2', '');
  check('glm-5.2 回到默认 0 折', myCell(IDS.indexOf('glm-5.2')), '0 / 0');
}

console.log(`\n===== 结果：${pass} 通过 / ${fail} 失败 =====`);
process.exit(fail ? 1 : 0);
