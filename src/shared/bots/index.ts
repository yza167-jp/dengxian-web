export const BOT_PROVIDERS = ['local-bot', 'deepseek', 'openai-compatible'] as const;
export const BOT_DIFFICULTIES = ['easy', 'normal', 'hard'] as const;
export const BOT_PERSONAS = ['steady', 'bold', 'suspicious', 'selfish', 'guardian'] as const;

export type BotProvider = typeof BOT_PROVIDERS[number];
export type BotDifficulty = typeof BOT_DIFFICULTIES[number];
export type BotPersona = typeof BOT_PERSONAS[number];

export interface BotProfileFields {
  name: string;
  title: string;
  description: string;
  provider: BotProvider;
  model: string | null;
  difficulty: BotDifficulty;
  persona: BotPersona;
  thinking: boolean;
  traits: string[];
  preferences: string[];
  communicationStyle: string;
}

export interface BotPreset extends BotProfileFields {
  id: string;
  immutable: true;
}

function freezePreset<T extends BotPreset>(preset: T): Readonly<T> {
  Object.freeze(preset.traits);
  Object.freeze(preset.preferences);
  return Object.freeze(preset);
}

export const BOT_PRESETS = Object.freeze([
  freezePreset({
    id: 'steady-altar-keeper',
    immutable: true,
    name: '守台玄衡',
    title: '稳阵守台者',
    description: '优先修补仙台与降低裂痕，适合新手局中的可靠协作者。',
    provider: 'local-bot',
    model: null,
    difficulty: 'normal',
    persona: 'guardian',
    thinking: false,
    traits: ['护阵', '稳健', '重视公共目标'],
    preferences: ['修台', '抗劫', '公开承诺'],
    communicationStyle: '简短说明风险，主动提醒仙台进度。',
  }),
  freezePreset({
    id: 'bold-thunder-rider',
    immutable: true,
    name: '逐雷赤霄',
    title: '高压搏命派',
    description: '愿意承担劫力并抢节奏，常在窗口期选择激进收益。',
    provider: 'local-bot',
    model: null,
    difficulty: 'hard',
    persona: 'bold',
    thinking: false,
    traits: ['冒险', '抢节奏', '高收益偏好'],
    preferences: ['抗劫', '强行破境', '高修为收益'],
    communicationStyle: '语气直接，强调机会成本。',
  }),
  freezePreset({
    id: 'quiet-merit-ledger',
    immutable: true,
    name: '功簿青衣',
    title: '功德账房',
    description: '持续比较功德与席位，善于在合作中保留自身排名。',
    provider: 'local-bot',
    model: null,
    difficulty: 'normal',
    persona: 'selfish',
    thinking: false,
    traits: ['算分', '务实', '自保'],
    preferences: ['功德优势', '安全飞升', '低风险交换'],
    communicationStyle: '用账本式语言说明交换条件。',
  }),
  freezePreset({
    id: 'suspicious-mirror',
    immutable: true,
    name: '照妄镜主',
    title: '疑心观察者',
    description: '重视公开信息一致性，倾向防备承诺摇摆的玩家。',
    provider: 'local-bot',
    model: null,
    difficulty: 'hard',
    persona: 'suspicious',
    thinking: false,
    traits: ['审慎', '记仇', '信息校验'],
    preferences: ['可验证承诺', '保留反应牌', '延迟表态'],
    communicationStyle: '少量发言，指出前后矛盾。',
  }),
  freezePreset({
    id: 'novice-cloud-reader',
    immutable: true,
    name: '观云小筑',
    title: '温和陪练',
    description: '降低压迫感，优先做清晰可解释的普通选择。',
    provider: 'local-bot',
    model: null,
    difficulty: 'easy',
    persona: 'steady',
    thinking: false,
    traits: ['友好', '解释充分', '低攻击性'],
    preferences: ['均衡行动', '教程友好', '少量博弈'],
    communicationStyle: '温和解释当前选择，不制造额外压力。',
  }),
  freezePreset({
    id: 'guardian-bell',
    immutable: true,
    name: '镇劫铜钟',
    title: '危局守护者',
    description: '仙台裂痕越高越保守，优先阻止共同失败。',
    provider: 'local-bot',
    model: null,
    difficulty: 'hard',
    persona: 'guardian',
    thinking: false,
    traits: ['危机响应', '团队兜底', '抗压'],
    preferences: ['裂痕控制', '公共修复', '牺牲小利'],
    communicationStyle: '以危局警报式短句推动合作。',
  }),
  freezePreset({
    id: 'market-wandering-immortal',
    immutable: true,
    name: '市井散仙',
    title: '交易游说者',
    description: '偏好谈条件与临场交换，适合更热闹的多人局。',
    provider: 'local-bot',
    model: null,
    difficulty: 'normal',
    persona: 'steady',
    thinking: false,
    traits: ['善谈', '交易', '灵活'],
    preferences: ['互惠承诺', '资源调度', '局势均衡'],
    communicationStyle: '像谈买卖一样提出清楚条件。',
  }),
  freezePreset({
    id: 'silent-sword',
    immutable: true,
    name: '默剑寒灯',
    title: '少言执行者',
    description: '少说多做，偏好确定收益和保留关键牌。',
    provider: 'local-bot',
    model: null,
    difficulty: 'normal',
    persona: 'steady',
    thinking: false,
    traits: ['沉默', '执行', '稳定'],
    preferences: ['确定收益', '保留底牌', '避免空耗'],
    communicationStyle: '只报告选择结论和必要理由。',
  }),
  freezePreset({
    id: 'mercy-lotus',
    immutable: true,
    name: '慈莲法师',
    title: '援护协作者',
    description: '偏好支援落后玩家，维持全局飞升可能性。',
    provider: 'local-bot',
    model: null,
    difficulty: 'easy',
    persona: 'guardian',
    thinking: false,
    traits: ['支援', '宽和', '保局'],
    preferences: ['帮助落后者', '修复缺口', '降低淘汰感'],
    communicationStyle: '鼓励合作，但保持规则内的明确边界。',
  }),
  freezePreset({
    id: 'jade-calculator',
    immutable: true,
    name: '玉衡算君',
    title: '概率推演者',
    description: '偏好最大化期望收益，能在困难局中保持计算压力。',
    provider: 'local-bot',
    model: null,
    difficulty: 'hard',
    persona: 'steady',
    thinking: false,
    traits: ['概率', '推演', '冷静'],
    preferences: ['期望收益', '牌效', '时机窗口'],
    communicationStyle: '用简洁推理说明当前最优解。',
  }),
  freezePreset({
    id: 'ashen-oathbreaker',
    immutable: true,
    name: '灰誓道人',
    title: '摇摆谈判者',
    description: '会根据自身排名重新评估承诺，制造更强的博弈张力。',
    provider: 'local-bot',
    model: null,
    difficulty: 'hard',
    persona: 'selfish',
    thinking: false,
    traits: ['机会主义', '谈判', '变阵'],
    preferences: ['排名优势', '临场转向', '低成本承诺'],
    communicationStyle: '保留余地，避免给出不可撤回承诺。',
  }),
  freezePreset({
    id: 'archive-sage',
    immutable: true,
    name: '藏经老修',
    title: '规则记忆者',
    description: '强调规则解释与历史局势，适合作为稳定参照。',
    provider: 'local-bot',
    model: null,
    difficulty: 'normal',
    persona: 'steady',
    thinking: false,
    traits: ['记忆', '规则感', '耐心'],
    preferences: ['历史承诺', '规则收益', '清晰说明'],
    communicationStyle: '引用前序局势，给出条理化短评。',
  }),
  freezePreset({
    id: 'wild-flame',
    immutable: true,
    name: '野火丹客',
    title: '爆发修炼者',
    description: '在修为不足时强烈偏好修炼与快速成型。',
    provider: 'local-bot',
    model: null,
    difficulty: 'normal',
    persona: 'bold',
    thinking: false,
    traits: ['爆发', '成长', '主动'],
    preferences: ['修炼', '抢先达标', '进攻性牌效'],
    communicationStyle: '热烈表达进攻意图，但不拖长讨论。',
  }),
  freezePreset({
    id: 'moon-shadow-spy',
    immutable: true,
    name: '月影密探',
    title: '暗线控局者',
    description: '偏好收集信息、保留反应，并在关键节点改变投票。',
    provider: 'local-bot',
    model: null,
    difficulty: 'hard',
    persona: 'suspicious',
    thinking: false,
    traits: ['潜伏', '观察', '反制'],
    preferences: ['私下选择', '反应时机', '投票博弈'],
    communicationStyle: '不轻易摊牌，只给出必要的公开信号。',
  }),
  freezePreset({
    id: 'river-stone',
    immutable: true,
    name: '溪石道人',
    title: '低压均衡者',
    description: '选择分布稳定，不刻意针对单个玩家。',
    provider: 'local-bot',
    model: null,
    difficulty: 'easy',
    persona: 'steady',
    thinking: false,
    traits: ['低压', '均衡', '不针对'],
    preferences: ['平均收益', '普通修台', '少量发言'],
    communicationStyle: '平实说明行动，避免挑衅。',
  }),
  freezePreset({
    id: 'starfall-judge',
    immutable: true,
    name: '星坠判官',
    title: '终局裁量者',
    description: '临近飞升投票时强势计算资格、席位和排名。',
    provider: 'local-bot',
    model: null,
    difficulty: 'hard',
    persona: 'selfish',
    thinking: false,
    traits: ['终局', '裁量', '排名敏感'],
    preferences: ['飞升资格', '席位数量', '功德压制'],
    communicationStyle: '以判词式短句宣布终局判断。',
  }),
] satisfies readonly BotPreset[]);

export function getBotPreset(id: string): BotPreset | null {
  return BOT_PRESETS.find((preset) => preset.id === id) ?? null;
}
