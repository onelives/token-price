// 端到端测试：加载生成的 index.html，核对渲染与 data/prices.json 一致，验证计算逻辑。
// 基准价不再硬编码，而是从 prices.json 读取——价格更新后测试依然有效。
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

function setRate(modelId, rate) {
  const el = document.getElementById('rate-' + modelId);
  el.value = String(rate);
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
}
function getCmp3(modelId) {
  const rows = document.getElementById('card-' + modelId).querySelectorAll('.cmp3 tbody tr');
  const vals = (r) => Array.from(r.querySelectorAll('td')).slice(1).map((td) => td.textContent.trim());
  return { input: vals(rows[0]), output: vals(rows[1]) };
}
function getDiffText(modelId) {
  return document.getElementById('card-' + modelId).querySelector('.cmp3-diff').textContent;
}

console.log('\n【1】初始状态：我方列待填');
{
  check('qwen3.8-max 我方列待填', getCmp3('qwen3.8-max').input[0], '待填');
}

console.log('\n【2】全模型百炼/原厂列与 prices.json 一致');
{
  for (const id of Object.keys(prices.models)) {
    const b = prices.models[id].bailian;
    const o = prices.models[id].origin;
    const ogIn = o ? o.in : b.in;
    const ogOut = o ? o.out : b.out;
    const c = getCmp3(id);
    check(id + ' 百炼列 ' + fmt(b.in) + '/' + fmt(b.out), c.input[1] + '/' + c.output[1], fmt(b.in) + '/' + fmt(b.out));
    check(id + ' 原厂列 ' + fmt(ogIn) + '/' + fmt(ogOut), c.input[2] + '/' + c.output[2], fmt(ogIn) + '/' + fmt(ogOut));
  }
}

console.log('\n【3】折扣计算：每模型填 8 折，我方 = 百炼 × 0.8');
{
  for (const id of Object.keys(prices.models)) {
    const b = prices.models[id].bailian;
    setRate(id, 8);
    const c = getCmp3(id);
    check(id + ' 我方输入 ' + fmt(b.in * 0.8), c.input[0], fmt(b.in * 0.8));
    check(id + ' 我方输出 ' + fmt(b.out * 0.8), c.output[0], fmt(b.out * 0.8));
  }
}

console.log('\n【4】差额方向（qwen3.8-max 8 折：较百炼省 20%）');
{
  const b = prices.models['qwen3.8-max'].bailian;
  const d = getDiffText('qwen3.8-max');
  check('较百炼省 ' + fmt(b.in * 0.2) + ' 元', d.includes('较百炼省 ' + fmt(b.in * 0.2) + ' 元'), true);
}

console.log('\n【5】切到亿 token（×100）');
{
  document.getElementById('btn-y').dispatchEvent(new window.Event('click'));
  const b = prices.models['deepseek-v4-pro'].bailian;
  check('deepseek-v4-pro 百炼输出 亿', getCmp3('deepseek-v4-pro').output[1], fmtMoney(b.out, 100));
}

console.log('\n【6】切回百万 token（还原）');
{
  document.getElementById('btn-m').dispatchEvent(new window.Event('click'));
  const b = prices.models['qwen3.8-max'].bailian;
  check('qwen3.8-max 我方输入还原', getCmp3('qwen3.8-max').input[0], fmt(b.in * 0.8));
}

console.log('\n【7】清空折扣');
{
  const el = document.getElementById('rate-glm-5.2');
  el.value = '';
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
  check('glm-5.2 我方列回到待填', getCmp3('glm-5.2').input[0], '待填');
}

console.log(`\n===== 结果：${pass} 通过 / ${fail} 失败 =====`);
process.exit(fail ? 1 : 0);
