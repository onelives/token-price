// 模型元数据 + 官方链接（价格数据在 data/prices.json，由 fetch.mjs 抓取维护）
export const MODELS = [
  {
    id: 'qwen3.8-max', label: '千问 3.8 Max', vendor: '阿里云（原厂=百炼）',
    slug: 'qwen3-8-max', origin: null,
    originNote: '千问系列原厂即阿里云百炼，原厂价与百炼一致',
  },
  {
    id: 'qwen3.7-max', label: '千问 3.7 Max', vendor: '阿里云（原厂=百炼）',
    slug: 'qwen3-7-max', origin: null,
    originNote: '千问系列原厂即阿里云百炼，原厂价与百炼一致',
  },
  {
    id: 'qwen3.7-plus', label: '千问 3.7 Plus', vendor: '阿里云（原厂=百炼）',
    slug: 'qwen3-7-plus', origin: null,
    originNote: '千问系列原厂即阿里云百炼，原厂价与百炼一致',
  },
  {
    id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro', vendor: 'DeepSeek 官方 API',
    slug: 'deepseek-v4-pro', origin: 'deepseek',
    snapAvg: { name: '快照版 pro-0813 闲忙均价', inP: 6.75, outP: 20.25 },
  },
  {
    id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash', vendor: 'DeepSeek 官方 API',
    slug: 'deepseek-v4-flash', origin: 'deepseek',
    snapAvg: { name: '快照版 flash-0731 闲忙均价', inP: 2.25, outP: 6.75 },
  },
  {
    id: 'glm-5.2', label: 'GLM-5.2', vendor: '智谱 BigModel',
    slug: 'glm-5-2', origin: 'bigmodel',
  },
];

export const LINKS = {
  bailian: (slug) => `https://help.aliyun.com/zh/model-studio/${slug}`,
  deepseek: 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing',
  bigmodel: 'https://open.bigmodel.cn/pricing',
  billing: 'https://help.aliyun.com/zh/model-studio/billing-for-model-studio',
};

// 原厂列链接文案
export const ORIGIN_LABEL = {
  deepseek: 'DeepSeek原厂',
  bigmodel: '智谱原厂',
};

export function linksFor(m) {
  return {
    linkBailian: LINKS.bailian(m.slug),
    linkOrigin: m.origin ? LINKS[m.origin] : null,
  };
}
