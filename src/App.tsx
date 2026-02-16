import { useState, useEffect, useCallback } from 'react'
import './App.css'

const EDGE_FN = 'https://aquysbccogwqloydoymz.supabase.co/functions/v1/sonoglyph-generate'
const MANDARIN_FN = 'https://aquysbccogwqloydoymz.supabase.co/functions/v1/mandarin-decompose'

const MODES = ['Cinematic', 'Ethereal', 'Industrial', 'Organic', 'Geometric'] as const
type Mode = typeof MODES[number]
type Tab = 'encode' | 'review' | 'mandarin' | 'mandarin-review'

interface PhoneticMap { sound: string; object: string; role: string }
interface SonoglyphResult {
  word: string
  mode: Mode
  definition: string
  phonetic_mapping: PhoneticMap[]
  functional_extraction: string[]
  scene_description: string
  render_prompt: string
}

interface MandarinResult {
  character: string
  pinyin: string
  definition: string
  character_type: { category: string; category_pinyin: string; explanation: string }
  radical_tree: string
  radicals: Array<{ component: string; pinyin: string; meaning: string; symbolism: string; visual_description: string }>
  mnemonics: Array<{ type: string; bridge: string; explanation: string }>
  etymology: string
  scene_description: string
  render_prompt: string
}

interface HistoryEntry { word: string; mode: Mode; result: SonoglyphResult; timestamp: number }

// SM-2 Spaced Repetition
interface SM2Card {
  word: string
  ef: number
  interval: number
  reps: number
  nextReview: number
  result: SonoglyphResult
}

interface MandarinSM2Card {
  word: string
  character: string
  pinyin: string
  ef: number
  interval: number
  reps: number
  nextReview: number
  result: MandarinResult
  source?: string
}

type MandarinFilter = 'all' | 'em-lose-yourself' | 'general' | 'random'

// Helper to create a minimal MandarinResult for preloaded cards
function mkResult(char: string, py: string, def: string): MandarinResult {
  return {
    character: char, pinyin: py, definition: def,
    character_type: { category: 'vocab', category_pinyin: 'ci2 hui4', explanation: 'Vocabulary from Eminem - Lose Yourself' },
    radical_tree: char,
    radicals: [{ component: char, pinyin: py, meaning: def, symbolism: '', visual_description: '' }],
    mnemonics: [{ type: 'song_context', bridge: `${char} (${py}) = ${def}`, explanation: 'From Eminem - Lose Yourself' }],
    etymology: `${char} means "${def}" in Mandarin.`,
    scene_description: `The word ${char} (${py}) meaning "${def}" as used in Eminem's Lose Yourself.`,
    render_prompt: `Visual representation of the concept "${def}", dramatic cinematic lighting, hip-hop aesthetic`
  }
}

// Preloaded Mandarin vocabulary from Eminem - "Lose Yourself" (comprehensive word list)
const LOSE_YOURSELF_CARDS: MandarinSM2Card[] = [
  // --- INTRO ---
  { word: 'look', character: '看', pinyin: 'kan4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('看', 'kan4', 'to look') },
  { word: 'if', character: '如果', pinyin: 'ru2 guo3', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('如果', 'ru2 guo3', 'if') },
  { word: 'you', character: '你', pinyin: 'ni3', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('你', 'ni3', 'you') },
  { word: 'had', character: '有', pinyin: 'you3', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('有', 'you3', 'to have; had') },
  { word: 'one', character: '一', pinyin: 'yi1', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('一', 'yi1', 'one') },
  { word: 'shot', character: '一次机会', pinyin: 'yi1 ci4 ji1 hui4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('一次机会', 'yi1 ci4 ji1 hui4', 'one shot/chance') },
  { word: 'or', character: '或者', pinyin: 'huo4 zhe3', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('或者', 'huo4 zhe3', 'or') },
  { word: 'opportunity', character: '机会', pinyin: 'ji1 hui4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('机会', 'ji1 hui4', 'opportunity') },
  { word: 'to', character: '去', pinyin: 'qu4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('去', 'qu4', 'to (direction)') },
  { word: 'seize', character: '抓住', pinyin: 'zhua1 zhu4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('抓住', 'zhua1 zhu4', 'to seize; to capture') },
  { word: 'everything', character: '一切', pinyin: 'yi1 qie4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('一切', 'yi1 qie4', 'everything') },
  { word: 'ever', character: '曾经', pinyin: 'ceng2 jing1', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('曾经', 'ceng2 jing1', 'ever') },
  { word: 'wanted', character: '想要', pinyin: 'xiang3 yao4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('想要', 'xiang3 yao4', 'wanted') },
  { word: 'in', character: '在', pinyin: 'zai4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('在', 'zai4', 'in; at') },
  { word: 'moment', character: '时刻', pinyin: 'shi2 ke4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('时刻', 'shi2 ke4', 'moment') },
  { word: 'would', character: '会', pinyin: 'hui4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('会', 'hui4', 'would') },
  { word: 'capture', character: '捕捉', pinyin: 'bu3 zhuo1', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('捕捉', 'bu3 zhuo1', 'to capture') },
  { word: 'it', character: '它', pinyin: 'ta1', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('它', 'ta1', 'it') },
  { word: 'just', character: '只是', pinyin: 'zhi3 shi4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('只是', 'zhi3 shi4', 'just') },
  { word: 'let', character: '让', pinyin: 'rang4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('让', 'rang4', 'to let') },
  { word: 'slip', character: '溜走', pinyin: 'liu1 zou3', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('溜走', 'liu1 zou3', 'to slip away') },
  { word: 'yo', character: '嘿', pinyin: 'hei1', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('嘿', 'hei1', 'yo; hey') },

  // --- VERSE 1 ---
  { word: 'his', character: '他的', pinyin: 'ta1 de', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('他的', 'ta1 de', 'his') },
  { word: 'palms', character: '手掌', pinyin: 'shou3 zhang3', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('手掌', 'shou3 zhang3', 'palms') },
  { word: 'are', character: '是', pinyin: 'shi4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('是', 'shi4', 'are') },
  { word: 'sweaty', character: '出汗的', pinyin: 'chu1 han4 de', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('出汗的', 'chu1 han4 de', 'sweaty') },
  { word: 'knees', character: '膝盖', pinyin: 'xi1 gai4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('膝盖', 'xi1 gai4', 'knees') },
  { word: 'weak', character: '虚弱', pinyin: 'xu1 ruo4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('虚弱', 'xu1 ruo4', 'weak') },
  { word: 'arms', character: '手臂', pinyin: 'shou3 bi4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('手臂', 'shou3 bi4', 'arms') },
  { word: 'heavy', character: '沉重', pinyin: 'chen2 zhong4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('沉重', 'chen2 zhong4', 'heavy') },
  { word: "there's", character: '有', pinyin: 'you3', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('有', 'you3', "there is/there's") },
  { word: 'vomit', character: '呕吐物', pinyin: 'ou3 tu4 wu4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('呕吐物', 'ou3 tu4 wu4', 'vomit') },
  { word: 'on', character: '在...上', pinyin: 'zai4...shang4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('在...上', 'zai4...shang4', 'on') },
  { word: 'sweater', character: '毛衣', pinyin: 'mao2 yi1', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('毛衣', 'mao2 yi1', 'sweater') },
  { word: 'already', character: '已经', pinyin: 'yi3 jing1', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('已经', 'yi3 jing1', 'already') },
  { word: "mom's", character: '妈妈的', pinyin: 'ma1 ma de', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('妈妈的', 'ma1 ma de', "mom's") },
  { word: 'spaghetti', character: '意大利面', pinyin: 'yi4 da4 li4 mian4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('意大利面', 'yi4 da4 li4 mian4', 'spaghetti') },
  { word: "he's", character: '他', pinyin: 'ta1', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('他', 'ta1', "he is/he's") },
  { word: 'nervous', character: '紧张', pinyin: 'jin3 zhang1', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('紧张', 'jin3 zhang1', 'nervous') },
  { word: 'but', character: '但是', pinyin: 'dan4 shi4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('但是', 'dan4 shi4', 'but') },
  { word: 'surface', character: '表面', pinyin: 'biao3 mian4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('表面', 'biao3 mian4', 'surface') },
  { word: 'calm', character: '冷静', pinyin: 'leng3 jing4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('冷静', 'leng3 jing4', 'calm') },
  { word: 'and', character: '和', pinyin: 'he2', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('和', 'he2', 'and') },
  { word: 'ready', character: '准备好', pinyin: 'zhun3 bei4 hao3', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('准备好', 'zhun3 bei4 hao3', 'ready') },
  { word: 'drop', character: '投下', pinyin: 'tou2 xia4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('投下', 'tou2 xia4', 'to drop') },
  { word: 'bombs', character: '炸弹', pinyin: 'zha4 dan4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('炸弹', 'zha4 dan4', 'bombs') },
  { word: 'he', character: '他', pinyin: 'ta1', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('他', 'ta1', 'he') },
  { word: 'keeps', character: '继续', pinyin: 'ji4 xu4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('继续', 'ji4 xu4', 'keeps (on)') },
  { word: 'forgetting', character: '忘记', pinyin: 'wang4 ji4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('忘记', 'wang4 ji4', 'forgetting') },
  { word: 'what', character: '什么', pinyin: 'shen2 me', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('什么', 'shen2 me', 'what') },
  { word: 'wrote', character: '写', pinyin: 'xie3', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('写', 'xie3', 'wrote') },
  { word: 'down', character: '下来', pinyin: 'xia4 lai2', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('下来', 'xia4 lai2', 'down') },
  { word: 'the', character: '这个', pinyin: 'zhe4 ge', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('这个', 'zhe4 ge', 'the') },
  { word: 'whole', character: '整个', pinyin: 'zheng3 ge4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('整个', 'zheng3 ge4', 'whole') },
  { word: 'crowd', character: '人群', pinyin: 'ren2 qun2', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('人群', 'ren2 qun2', 'crowd') },
  { word: 'goes', character: '变得', pinyin: 'bian4 de', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('变得', 'bian4 de', 'goes (becomes)') },
  { word: 'so', character: '如此', pinyin: 'ru2 ci3', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('如此', 'ru2 ci3', 'so') },
  { word: 'loud', character: '大声', pinyin: 'da4 sheng1', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('大声', 'da4 sheng1', 'loud') },
  { word: 'opens', character: '打开', pinyin: 'da3 kai1', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('打开', 'da3 kai1', 'opens') },
  { word: 'mouth', character: '嘴', pinyin: 'zui3', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('嘴', 'zui3', 'mouth') },
  { word: 'words', character: '词', pinyin: 'ci2', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('词', 'ci2', 'words') },
  { word: "won't", character: '不会', pinyin: 'bu4 hui4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('不会', 'bu4 hui4', "won't") },
  { word: 'come', character: '出来', pinyin: 'chu1 lai2', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('出来', 'chu1 lai2', 'to come') },
  { word: 'out', character: '出', pinyin: 'chu1', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('出', 'chu1', 'out') },
  { word: 'choking', character: '窒息', pinyin: 'zhi4 xi1', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('窒息', 'zhi4 xi1', 'choking') },
  { word: 'how', character: '如何', pinyin: 'ru2 he2', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('如何', 'ru2 he2', 'how') },
  { word: "everybody's", character: '每个人的', pinyin: 'mei3 ge4 ren2 de', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('每个人的', 'mei3 ge4 ren2 de', "everybody's") },
  { word: 'joking', character: '开玩笑', pinyin: 'kai1 wan2 xiao4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('开玩笑', 'kai1 wan2 xiao4', 'joking') },
  { word: 'now', character: '现在', pinyin: 'xian4 zai4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('现在', 'xian4 zai4', 'now') },
  { word: "clock's", character: '时钟的', pinyin: 'shi2 zhong1 de', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('时钟的', 'shi2 zhong1 de', "clock's") },
  { word: 'run', character: '跑', pinyin: 'pao3', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('跑', 'pao3', 'to run') },
  { word: "time's", character: '时间', pinyin: 'shi2 jian1', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('时间', 'shi2 jian1', "time's") },
  { word: 'up', character: '完', pinyin: 'wan2', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('完', 'wan2', 'up (finished)') },
  { word: 'over', character: '结束', pinyin: 'jie2 shu4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('结束', 'jie2 shu4', 'over') },
  { word: 'blaow', character: '砰', pinyin: 'peng1', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('砰', 'peng1', 'blaow (sound effect)') },
  { word: 'snap', character: '回到', pinyin: 'hui2 dao4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('回到', 'hui2 dao4', 'snap back') },
  { word: 'back', character: '回', pinyin: 'hui2', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('回', 'hui2', 'back') },
  { word: 'reality', character: '现实', pinyin: 'xian4 shi2', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('现实', 'xian4 shi2', 'reality') },
  { word: 'ope', character: '哦', pinyin: 'o1', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('哦', 'o1', 'oh/ope') },
  { word: 'there', character: '那里', pinyin: 'na4 li3', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('那里', 'na4 li3', 'there') },
  { word: 'gravity', character: '重力', pinyin: 'zhong4 li4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('重力', 'zhong4 li4', 'gravity') },
  { word: 'rabbit', character: '兔子', pinyin: 'tu4 zi', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('兔子', 'tu4 zi', 'rabbit') },
  { word: 'choked', character: '噎住', pinyin: 'ye1 zhu4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('噎住', 'ye1 zhu4', 'choked') },
  { word: 'mad', character: '愤怒', pinyin: 'fen4 nu4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('愤怒', 'fen4 nu4', 'mad; angry') },
  { word: "won't", character: '不会', pinyin: 'bu4 hui4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('不会', 'bu4 hui4', "won't") },
  { word: 'give', character: '放弃', pinyin: 'fang4 qi4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('放弃', 'fang4 qi4', 'to give up') },
  { word: 'that', character: '那个', pinyin: 'na4 ge', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('那个', 'na4 ge', 'that') },
  { word: 'easy', character: '容易', pinyin: 'rong2 yi4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('容易', 'rong2 yi4', 'easy') },
  { word: 'no', character: '不', pinyin: 'bu4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('不', 'bu4', 'no') },
  { word: 'have', character: '拥有', pinyin: 'yong1 you3', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('拥有', 'yong1 you3', 'to have') },
  { word: 'knows', character: '知道', pinyin: 'zhi1 dao4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('知道', 'zhi1 dao4', 'knows') },
  { word: "back's", character: '背部的', pinyin: 'bei4 bu4 de', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('背部的', 'bei4 bu4 de', "back's (body part)") },
  { word: 'these', character: '这些', pinyin: 'zhe4 xie1', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('这些', 'zhe4 xie1', 'these') },
  { word: 'ropes', character: '绳索', pinyin: 'sheng2 suo3', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('绳索', 'sheng2 suo3', 'ropes') },
  { word: "doesn't", character: '不', pinyin: 'bu4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('不', 'bu4', "doesn't") },
  { word: 'matter', character: '重要', pinyin: 'zhong4 yao4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('重要', 'zhong4 yao4', 'to matter') },
  { word: 'dope', character: '毒品', pinyin: 'du2 pin3', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('毒品', 'du2 pin3', 'dope') },
  { word: "hope's", character: '希望', pinyin: 'xi1 wang4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('希望', 'xi1 wang4', "hope's") },
  { word: 'broke', character: '破碎', pinyin: 'po4 sui4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('破碎', 'po4 sui4', 'broke') },
  { word: 'stagnant', character: '停滞', pinyin: 'ting2 zhi4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('停滞', 'ting2 zhi4', 'stagnant') },
  { word: 'go', character: '走', pinyin: 'zou3', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('走', 'zou3', 'to go') },
  { word: 'mobile', character: '移动的', pinyin: 'yi2 dong4 de', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('移动的', 'yi2 dong4 de', 'mobile') },
  { word: 'home', character: '家', pinyin: 'jia1', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('家', 'jia1', 'home') },
  { word: 'close', character: '接近', pinyin: 'jie1 jin4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('接近', 'jie1 jin4', 'close') },
  { word: 'numb', character: '麻木', pinyin: 'ma2 mu4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('麻木', 'ma2 mu4', 'numb') },
  { word: 'all', character: '所有', pinyin: 'suo3 you3', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('所有', 'suo3 you3', 'all') },
  { word: 'this', character: '这', pinyin: 'zhe4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('这', 'zhe4', 'this') },
  { word: 'want', character: '想要', pinyin: 'xiang3 yao4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('想要', 'xiang3 yao4', 'to want') },
  { word: 'when', character: '当', pinyin: 'dang1', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('当', 'dang1', 'when') },
  { word: 'not', character: '不', pinyin: 'bu4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('不', 'bu4', 'not') },
  { word: 'who', character: '谁', pinyin: 'shui2', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('谁', 'shui2', 'who') },
  { word: 'into', character: '进入', pinyin: 'jin4 ru4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('进入', 'jin4 ru4', 'into') },
  { word: 'him', character: '他', pinyin: 'ta1', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('他', 'ta1', 'him') },
  { word: 'of', character: '的', pinyin: 'de', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('的', 'de', 'of') },
  { word: 'rhapsody', character: '狂想曲', pinyin: 'kuang2 xiang3 qu3', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('狂想曲', 'kuang2 xiang3 qu3', 'rhapsody') },
  { word: 'oh', character: '哦', pinyin: 'o2', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('哦', 'o2', 'oh') },
  { word: 'again', character: '再次', pinyin: 'zai4 ci4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('再次', 'zai4 ci4', 'again') },
  { word: 'here', character: '这里', pinyin: 'zhe4 li3', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('这里', 'zhe4 li3', 'here') },
  { word: 'be', character: '是', pinyin: 'shi4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('是', 'shi4', 'to be') },
  { word: 'got', character: '得到', pinyin: 'de2 dao4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('得到', 'de2 dao4', 'got') },
  { word: "it's", character: '这是', pinyin: 'zhe4 shi4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('这是', 'zhe4 shi4', "it's; it is") },
  { word: 'a', character: '一个', pinyin: 'yi1 ge4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('一个', 'yi1 ge4', 'a (article)') },
  { word: 'with', character: '用', pinyin: 'yong4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('用', 'yong4', 'with') },
  { word: 'at', character: '在', pinyin: 'zai4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('在', 'zai4', 'at') },
  { word: 'is', character: '是', pinyin: 'shi4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('是', 'shi4', 'is') },
  { word: 'told', character: '告诉', pinyin: 'gao4 su4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('告诉', 'gao4 su4', 'told (V1)') },
  { word: 'my', character: '我的', pinyin: 'wo3 de', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('我的', 'wo3 de', 'my') },
  { word: "I'm", character: '我是', pinyin: 'wo3 shi4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('我是', 'wo3 shi4', "I'm; I am") },
  { word: "I'ma", character: '我要', pinyin: 'wo3 yao4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('我要', 'wo3 yao4', "I'ma; I'm going to") },
  { word: 'some', character: '一些', pinyin: 'yi1 xie1', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('一些', 'yi1 xie1', 'some') },
  { word: 'than', character: '比', pinyin: 'bi3', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('比', 'bi3', 'than') },
  { word: 'where', character: '哪里', pinyin: 'na3 li3', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('哪里', 'na3 li3', 'where') },
  { word: 'were', character: '是', pinyin: 'shi4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('是', 'shi4', 'were') },
  { word: 'them', character: '他们', pinyin: 'ta1 men2', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('他们', 'ta1 men2', 'them') },
  { word: 'their', character: '他们的', pinyin: 'ta1 men de', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('他们的', 'ta1 men de', 'their') },
  { word: 'himself', character: '他自己', pinyin: 'ta1 zi4 ji3', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('他自己', 'ta1 zi4 ji3', 'himself') },

  // --- CHORUS ---
  { word: 'better', character: '最好', pinyin: 'zui4 hao3', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('最好', 'zui4 hao3', 'better; best') },
  { word: 'lose', character: '失去', pinyin: 'shi1 qu4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('失去', 'shi1 qu4', 'to lose') },
  { word: 'yourself', character: '你自己', pinyin: 'ni3 zi4 ji3', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('你自己', 'ni3 zi4 ji3', 'yourself') },
  { word: 'music', character: '音乐', pinyin: 'yin1 yue4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('音乐', 'yin1 yue4', 'music') },
  { word: 'own', character: '拥有', pinyin: 'yong1 you3', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('拥有', 'yong1 you3', 'to own') },
  { word: 'never', character: '永远不', pinyin: 'yong3 yuan3 bu4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('永远不', 'yong3 yuan3 bu4', 'never') },
  { word: 'let-go', character: '放手', pinyin: 'fang4 shou3', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('放手', 'fang4 shou3', 'to let go') },
  { word: 'only', character: '只有', pinyin: 'zhi3 you3', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('只有', 'zhi3 you3', 'only') },
  { word: 'get', character: '得到', pinyin: 'de2 dao4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('得到', 'de2 dao4', 'to get') },
  { word: 'chance', character: '机会', pinyin: 'ji1 hui4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('机会', 'ji1 hui4', 'chance') },
  { word: "don't", character: '不要', pinyin: 'bu2 yao4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('不要', 'bu2 yao4', "don't") },
  { word: 'miss', character: '错过', pinyin: 'cuo4 guo4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('错过', 'cuo4 guo4', 'to miss') },
  { word: 'blow', character: '机会', pinyin: 'ji1 hui4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('机会', 'ji1 hui4', 'blow (opportunity)') },
  { word: 'once', character: '一次', pinyin: 'yi1 ci4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('一次', 'yi1 ci4', 'once') },
  { word: 'lifetime', character: '一生', pinyin: 'yi1 sheng1', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('一生', 'yi1 sheng1', 'lifetime') },

  // --- VERSE 2 ---
  { word: "soul's", character: '灵魂的', pinyin: 'ling2 hun2 de', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('灵魂的', 'ling2 hun2 de', "soul's") },
  { word: 'escaping', character: '逃脱', pinyin: 'tao2 tuo1', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('逃脱', 'tao2 tuo1', 'escaping') },
  { word: 'through', character: '通过', pinyin: 'tong1 guo4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('通过', 'tong1 guo4', 'through') },
  { word: 'hole', character: '洞', pinyin: 'dong4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('洞', 'dong4', 'hole') },
  { word: 'gaping', character: '裂开的', pinyin: 'lie4 kai1 de', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('裂开的', 'lie4 kai1 de', 'gaping') },
  { word: 'world', character: '世界', pinyin: 'shi4 jie4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('世界', 'shi4 jie4', 'world') },
  { word: 'mine', character: '我的', pinyin: 'wo3 de', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('我的', 'wo3 de', 'mine') },
  { word: 'for', character: '为了', pinyin: 'wei4 le', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('为了', 'wei4 le', 'for') },
  { word: 'taking', character: '拿取', pinyin: 'na2 qu3', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('拿取', 'na2 qu3', 'taking') },
  { word: 'make', character: '制造', pinyin: 'zhi4 zao4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('制造', 'zhi4 zao4', 'to make') },
  { word: 'me', character: '我', pinyin: 'wo3', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('我', 'wo3', 'me') },
  { word: 'king', character: '国王', pinyin: 'guo2 wang2', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('国王', 'guo2 wang2', 'king') },
  { word: 'as', character: '当', pinyin: 'dang1', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('当', 'dang1', 'as') },
  { word: 'we', character: '我们', pinyin: 'wo3 men2', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('我们', 'wo3 men2', 'we') },
  { word: 'move', character: '移动', pinyin: 'yi2 dong4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('移动', 'yi2 dong4', 'to move') },
  { word: 'toward', character: '朝向', pinyin: 'chao2 xiang4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('朝向', 'chao2 xiang4', 'toward') },
  { word: 'new', character: '新的', pinyin: 'xin1 de', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('新的', 'xin1 de', 'new') },
  { word: 'world', character: '世界', pinyin: 'shi4 jie4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('世界', 'shi4 jie4', 'world') },
  { word: 'order', character: '秩序', pinyin: 'zhi4 xu4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('秩序', 'zhi4 xu4', 'order') },
  { word: 'normal', character: '正常', pinyin: 'zheng4 chang2', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('正常', 'zheng4 chang2', 'normal') },
  { word: 'life', character: '生活', pinyin: 'sheng1 huo2', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('生活', 'sheng1 huo2', 'life') },
  { word: 'boring', character: '无聊', pinyin: 'wu2 liao2', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('无聊', 'wu2 liao2', 'boring') },
  { word: 'superstar', character: '超级巨星', pinyin: 'chao1 ji2 ju4 xing1', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('超级巨星', 'chao1 ji2 ju4 xing1', 'superstar') },
  { word: 'closer', character: '更接近', pinyin: 'geng4 jie1 jin4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('更接近', 'geng4 jie1 jin4', 'closer') },
  { word: 'grows', character: '成长', pinyin: 'cheng2 zhang3', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('成长', 'cheng2 zhang3', 'grows') },
  { word: 'blow-up', character: '爆炸', pinyin: 'bao4 zha4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('爆炸', 'bao4 zha4', 'to blow up') },
  { word: 'poster', character: '海报', pinyin: 'hai3 bao4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('海报', 'hai3 bao4', 'poster') },
  { word: 'slammed', character: '贴上', pinyin: 'tie1 shang4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('贴上', 'tie1 shang4', 'slammed/posted') },
  { word: 'bedroom', character: '卧室', pinyin: 'wo4 shi4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('卧室', 'wo4 shi4', 'bedroom') },
  { word: "door's", character: '门的', pinyin: 'men2 de', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('门的', 'men2 de', "door's") },
  { word: 'laptop', character: '笔记本', pinyin: 'bi3 ji4 ben3', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('笔记本', 'bi3 ji4 ben3', 'laptop') },
  { word: 'only', character: '唯一', pinyin: 'wei2 yi1', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('唯一', 'wei2 yi1', 'only') },
  { word: 'outlet', character: '出口', pinyin: 'chu1 kou3', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('出口', 'chu1 kou3', 'outlet') },
  { word: 'lonely', character: '孤独', pinyin: 'gu1 du2', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('孤独', 'gu1 du2', 'lonely') },
  { word: 'coast', character: '海岸', pinyin: 'hai3 an4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('海岸', 'hai3 an4', 'coast') },
  { word: 'consider', character: '考虑', pinyin: 'kao3 lv4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('考虑', 'kao3 lv4', 'to consider') },
  { word: 'forfeit', character: '丧失', pinyin: 'sang4 shi1', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('丧失', 'sang4 shi1', 'to forfeit') },
  { word: 'other', character: '其他', pinyin: 'qi2 ta1', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('其他', 'qi2 ta1', 'other') },
  { word: 'formula', character: '公式', pinyin: 'gong1 shi4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('公式', 'gong1 shi4', 'formula') },
  { word: 'normal', character: '正常', pinyin: 'zheng4 chang2', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('正常', 'zheng4 chang2', 'normal') },
  { word: 'life', character: '生活', pinyin: 'sheng1 huo2', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('生活', 'sheng1 huo2', 'life') },
  { word: "monotony's", character: '单调的', pinyin: 'dan1 diao4 de', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('单调的', 'dan1 diao4 de', "monotony's") },
  { word: 'gotten', character: '得到', pinyin: 'de2 dao4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('得到', 'de2 dao4', 'gotten') },
  { word: 'rotten', character: '腐烂', pinyin: 'fu3 lan4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('腐烂', 'fu3 lan4', 'rotten') },
  { word: 'bottom', character: '底部', pinyin: 'di3 bu4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('底部', 'di3 bu4', 'bottom') },
  { word: 'forgotten', character: '被遗忘', pinyin: 'bei4 yi2 wang4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('被遗忘', 'bei4 yi2 wang4', 'forgotten') },
  { word: 'gotten', character: '变得', pinyin: 'bian4 de', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('变得', 'bian4 de', 'gotten') },
  { word: 'they', character: '他们', pinyin: 'ta1 men2', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('他们', 'ta1 men2', 'they') },
  { word: 'say', character: '说', pinyin: 'shuo1', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('说', 'shuo1', 'to say') },
  { word: 'music', character: '音乐', pinyin: 'yin1 yue4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('音乐', 'yin1 yue4', 'music') },
  { word: 'box', character: '盒子', pinyin: 'he2 zi', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('盒子', 'he2 zi', 'box') },
  { word: 'forgotten', character: '被遗忘', pinyin: 'bei4 yi2 wang4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('被遗忘', 'bei4 yi2 wang4', 'forgotten') },
  { word: 'about', character: '关于', pinyin: 'guan1 yu2', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('关于', 'guan1 yu2', 'about') },
  { word: 'streets', character: '街道', pinyin: 'jie1 dao4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('街道', 'jie1 dao4', 'streets') },
  { word: 'from', character: '从', pinyin: 'cong2', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('从', 'cong2', 'from') },
  { word: 'came', character: '来', pinyin: 'lai2', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('来', 'lai2', 'came') },
  { word: 'people', character: '人们', pinyin: 'ren2 men2', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('人们', 'ren2 men2', 'people') },
  { word: 'think', character: '认为', pinyin: 'ren4 wei2', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('认为', 'ren4 wei2', 'to think') },
  { word: 'really', character: '真的', pinyin: 'zhen1 de', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('真的', 'zhen1 de', 'really') },
  { word: 'grown', character: '成长', pinyin: 'cheng2 zhang3', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('成长', 'cheng2 zhang3', 'grown') },
  { word: 'I', character: '我', pinyin: 'wo3', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('我', 'wo3', 'I') },
  { word: "haven't", character: '没有', pinyin: 'mei2 you3', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('没有', 'mei2 you3', "haven't") },
  { word: 'since', character: '自从', pinyin: 'zi4 cong2', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('自从', 'zi4 cong2', 'since') },
  { word: "bottom's", character: '底部的', pinyin: 'di3 bu4 de', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('底部的', 'di3 bu4 de', "bottom's") },
  { word: 'paying', character: '付出', pinyin: 'fu4 chu1', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('付出', 'fu4 chu1', 'paying') },
  { word: 'dues', character: '代价', pinyin: 'dai4 jia4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('代价', 'dai4 jia4', 'dues') },
  { word: 'dues', character: '代价', pinyin: 'dai4 jia4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('代价', 'dai4 jia4', 'dues') },
  { word: 'still', character: '仍然', pinyin: 'reng2 ran2', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('仍然', 'reng2 ran2', 'still') },
  { word: 'owe', character: '欠', pinyin: 'qian4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('欠', 'qian4', 'to owe') },
  { word: 'grew', character: '成长', pinyin: 'cheng2 zhang3', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('成长', 'cheng2 zhang3', 'grew') },
  { word: 'pain', character: '痛苦', pinyin: 'tong4 ku3', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('痛苦', 'tong4 ku3', 'pain') },
  { word: 'inside', character: '内心', pinyin: 'nei4 xin1', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('内心', 'nei4 xin1', 'inside') },
  { word: 'amplified', character: '放大', pinyin: 'fang4 da4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('放大', 'fang4 da4', 'amplified') },
  { word: 'by', character: '被', pinyin: 'bei4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('被', 'bei4', 'by') },
  { word: 'fact', character: '事实', pinyin: 'shi4 shi2', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('事实', 'shi4 shi2', 'fact') },
  { word: "can't", character: '不能', pinyin: 'bu4 neng2', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('不能', 'bu4 neng2', "can't") },
  { word: 'right', character: '正确', pinyin: 'zheng4 que4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('正确', 'zheng4 que4', 'right') },
  { word: 'type', character: '类型', pinyin: 'lei4 xing2', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('类型', 'lei4 xing2', 'type') },
  { word: 'provide', character: '提供', pinyin: 'ti2 gong1', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('提供', 'ti2 gong1', 'to provide') },
  { word: 'lifestyle', character: '生活方式', pinyin: 'sheng1 huo2 fang1 shi4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('生活方式', 'sheng1 huo2 fang1 shi4', 'lifestyle') },
  { word: 'family', character: '家庭', pinyin: 'jia1 ting2', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('家庭', 'jia1 ting2', 'family') },
  { word: 'trapped', character: '困住', pinyin: 'kun4 zhu4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('困住', 'kun4 zhu4', 'trapped') },
  { word: 'catch', character: '抓住', pinyin: 'zhua1 zhu4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('抓住', 'zhua1 zhu4', 'to catch') },
  { word: 'going', character: '继续', pinyin: 'ji4 xu4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('继续', 'ji4 xu4', 'going') },
  { word: 'snatch', character: '抢夺', pinyin: 'qiang3 duo2', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('抢夺', 'qiang3 duo2', 'to snatch') },
  { word: 'baby', character: '宝宝', pinyin: 'bao3 bao3', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('宝宝', 'bao3 bao3', 'baby') },
  { word: 'mama', character: '妈妈', pinyin: 'ma1 ma', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('妈妈', 'ma1 ma', 'mama') },
  { word: 'drama', character: '戏剧', pinyin: 'xi4 ju4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('戏剧', 'xi4 ju4', 'drama') },
  { word: 'screaming', character: '尖叫', pinyin: 'jian1 jiao4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('尖叫', 'jian1 jiao4', 'screaming') },
  { word: 'too', character: '太', pinyin: 'tai4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('太', 'tai4', 'too') },
  { word: 'much', character: '多', pinyin: 'duo1', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('多', 'duo1', 'much') },
  { word: 'watch', character: '看', pinyin: 'kan4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('看', 'kan4', 'to watch') },
  { word: 'television', character: '电视', pinyin: 'dian4 shi4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('电视', 'dian4 shi4', 'television') },
  { word: 'road', character: '路', pinyin: 'lu4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('路', 'lu4', 'road') },
  { word: 'writing', character: '写作', pinyin: 'xie3 zuo4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('写作', 'xie3 zuo4', 'writing') },
  { word: 'probably', character: '可能', pinyin: 'ke3 neng2', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('可能', 'ke3 neng2', 'probably') },
  { word: 'crack', character: '裂缝', pinyin: 'lie4 feng4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('裂缝', 'lie4 feng4', 'crack') },
  { word: 'almost', character: '几乎', pinyin: 'ji1 hu1', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('几乎', 'ji1 hu1', 'almost') },

  // --- VERSE 3 ---
  { word: 'more', character: '更多', pinyin: 'geng4 duo1', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('更多', 'geng4 duo1', 'more') },
  { word: 'games', character: '游戏', pinyin: 'you2 xi4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('游戏', 'you2 xi4', 'games') },
  { word: 'change', character: '改变', pinyin: 'gai3 bian4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('改变', 'gai3 bian4', 'to change') },
  { word: 'call', character: '称呼', pinyin: 'cheng1 hu1', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('称呼', 'cheng1 hu1', 'to call') },
  { word: 'rage', character: '愤怒', pinyin: 'fen4 nu4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('愤怒', 'fen4 nu4', 'rage') },
  { word: 'tear', character: '撕掉', pinyin: 'si1 diao4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('撕掉', 'si1 diao4', 'to tear') },
  { word: 'roof', character: '屋顶', pinyin: 'wu1 ding3', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('屋顶', 'wu1 ding3', 'roof') },
  { word: 'off', character: '掉', pinyin: 'diao4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('掉', 'diao4', 'off') },
  { word: 'like', character: '像', pinyin: 'xiang4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('像', 'xiang4', 'like') },
  { word: 'two', character: '两个', pinyin: 'liang3 ge4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('两个', 'liang3 ge4', 'two') },
  { word: 'dogs', character: '狗', pinyin: 'gou3', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('狗', 'gou3', 'dogs') },
  { word: 'caged', character: '关在笼子里', pinyin: 'guan1 zai4 long2 zi li3', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('关在笼子里', 'guan1 zai4 long2 zi li3', 'caged') },
  { word: 'was', character: '是', pinyin: 'shi4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('是', 'shi4', 'was') },
  { word: 'playing', character: '玩', pinyin: 'wan2', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('玩', 'wan2', 'playing') },
  { word: 'beginning', character: '开始', pinyin: 'kai1 shi3', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('开始', 'kai1 shi3', 'beginning') },
  { word: 'mood', character: '心情', pinyin: 'xin1 qing2', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('心情', 'xin1 qing2', 'mood') },
  { word: 'changed', character: '改变', pinyin: 'gai3 bian4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('改变', 'gai3 bian4', 'changed') },
  { word: 'chewed', character: '咀嚼', pinyin: 'ju3 jue2', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('咀嚼', 'ju3 jue2', 'chewed') },
  { word: 'spit', character: '吐出', pinyin: 'tu3 chu1', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('吐出', 'tu3 chu1', 'to spit') },
  { word: 'booed', character: '嘘声', pinyin: 'xu1 sheng1', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('嘘声', 'xu1 sheng1', 'booed') },
  { word: 'stage', character: '舞台', pinyin: 'wu3 tai2', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('舞台', 'wu3 tai2', 'stage') },
  { word: 'take', character: '拿', pinyin: 'na2', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('拿', 'na2', 'to take') },
  { word: 'captivate', character: '迷住', pinyin: 'mi2 zhu4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('迷住', 'mi2 zhu4', 'to captivate') },
  { word: 'race', character: '比赛', pinyin: 'bi3 sai4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('比赛', 'bi3 sai4', 'race') },
  { word: "that's", character: '那是', pinyin: 'na4 shi4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('那是', 'na4 shi4', "that's") },
  { word: 'pay', character: '支付', pinyin: 'zhi1 fu4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('支付', 'zhi1 fu4', 'to pay') },
  { word: 'hang', character: '挂', pinyin: 'gua4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('挂', 'gua4', 'to hang') },
  { word: 'clothesline', character: '晾衣绳', pinyin: 'liang4 yi1 sheng2', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('晾衣绳', 'liang4 yi1 sheng2', 'clothesline') },
  { word: 'bedsheet', character: '床单', pinyin: 'chuang2 dan1', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('床单', 'chuang2 dan1', 'bedsheet') },
  { word: 'strong', character: '强壮', pinyin: 'qiang2 zhuang4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('强壮', 'qiang2 zhuang4', 'strong') },
  { word: 'enough', character: '足够', pinyin: 'zu2 gou4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('足够', 'zu2 gou4', 'enough') },
  { word: 'long', character: '长', pinyin: 'chang2', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('长', 'chang2', 'long') },
  { word: 'wrong', character: '错', pinyin: 'cuo4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('错', 'cuo4', 'wrong') },
  { word: 'attention', character: '注意', pinyin: 'zhu4 yi4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('注意', 'zhu4 yi4', 'attention') },
  { word: 'then', character: '然后', pinyin: 'ran2 hou4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('然后', 'ran2 hou4', 'then') },
  { word: 'even', character: '甚至', pinyin: 'shen4 zhi4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('甚至', 'shen4 zhi4', 'even') },
  { word: 'believe', character: '相信', pinyin: 'xiang1 xin4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('相信', 'xiang1 xin4', 'to believe') },
  { word: 'making', character: '制作', pinyin: 'zhi4 zuo4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('制作', 'zhi4 zuo4', 'making') },
  { word: 'leaving', character: '离开', pinyin: 'li2 kai1', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('离开', 'li2 kai1', 'leaving') },
  { word: 'waste', character: '浪费', pinyin: 'lang4 fei4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('浪费', 'lang4 fei4', 'to waste') },
  { word: 'make', character: '制造', pinyin: 'zhi4 zao4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('制造', 'zhi4 zao4', 'to make') },
  { word: 'escape', character: '逃脱', pinyin: 'tao2 tuo1', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('逃脱', 'tao2 tuo1', 'to escape') },
  { word: 'ladder', character: '梯子', pinyin: 'ti1 zi', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('梯子', 'ti1 zi', 'ladder') },
  { word: 'last', character: '最后', pinyin: 'zui4 hou4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('最后', 'zui4 hou4', 'last') },
  { word: 'fast', character: '快速', pinyin: 'kuai4 su4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('快速', 'kuai4 su4', 'fast') },
  { word: 'gotta', character: '必须', pinyin: 'bi4 xu1', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('必须', 'bi4 xu1', 'gotta (have to)') },
  { word: 'formulate', character: '制定', pinyin: 'zhi4 ding4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('制定', 'zhi4 ding4', 'to formulate') },
  { word: 'plot', character: '计划', pinyin: 'ji4 hua4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('计划', 'ji4 hua4', 'plot') },
  { word: 'end', character: '结束', pinyin: 'jie2 shu4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('结束', 'jie2 shu4', 'to end') },
  { word: 'before', character: '在...之前', pinyin: 'zai4...zhi1 qian2', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('在...之前', 'zai4...zhi1 qian2', 'before') },
  { word: 'gets', character: '得到', pinyin: 'de2 dao4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('得到', 'de2 dao4', 'gets') },
  { word: 'overdue', character: '过期', pinyin: 'guo4 qi1', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('过期', 'guo4 qi1', 'overdue') },
  { word: 'because', character: '因为', pinyin: 'yin1 wei4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('因为', 'yin1 wei4', 'because') },
  { word: 'alone', character: '独自', pinyin: 'du2 zi4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('独自', 'du2 zi4', 'alone') },
  { word: 'daughter', character: '女儿', pinyin: 'nv3 er2', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('女儿', 'nv3 er2', 'daughter') },
  { word: 'growing', character: '成长', pinyin: 'cheng2 zhang3', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('成长', 'cheng2 zhang3', 'growing') },
  { word: 'getting', character: '变得', pinyin: 'bian4 de', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('变得', 'bian4 de', 'getting') },
  { word: 'older', character: '更老', pinyin: 'geng4 lao3', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('更老', 'geng4 lao3', 'older') },
  { word: 'blow', character: '吹', pinyin: 'chui1', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('吹', 'chui1', 'to blow') },
  { word: 'shoulder', character: '肩膀', pinyin: 'jian1 bang3', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('肩膀', 'jian1 bang3', 'shoulder') },
  { word: 'colder', character: '更冷', pinyin: 'geng4 leng3', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('更冷', 'geng4 leng3', 'colder') },
  { word: 'gets', character: '变得', pinyin: 'bian4 de', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('变得', 'bian4 de', 'gets') },
  { word: 'farther', character: '更远', pinyin: 'geng4 yuan3', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('更远', 'geng4 yuan3', 'farther') },
  { word: 'goal', character: '目标', pinyin: 'mu4 biao1', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('目标', 'mu4 biao1', 'goal') },
  { word: "water's", character: '水的', pinyin: 'shui3 de', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('水的', 'shui3 de', "water's") },
  { word: 'only', character: '只', pinyin: 'zhi3', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('只', 'zhi3', 'only') },
  { word: 'grows', character: '成长', pinyin: 'cheng2 zhang3', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('成长', 'cheng2 zhang3', 'grows') },
  { word: 'hotter', character: '更热', pinyin: 'geng4 re4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('更热', 'geng4 re4', 'hotter') },
  { word: 'try', character: '尝试', pinyin: 'chang2 shi4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('尝试', 'chang2 shi4', 'to try') },
  { word: 'hold', character: '抓住', pinyin: 'zhua1 zhu4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('抓住', 'zhua1 zhu4', 'to hold') },
  { word: 'longer', character: '更久', pinyin: 'geng4 jiu3', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('更久', 'geng4 jiu3', 'longer') },
  { word: 'coast', character: '海岸', pinyin: 'hai3 an4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('海岸', 'hai3 an4', 'coast') },
  { word: 'over', character: '结束', pinyin: 'jie2 shu4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('结束', 'jie2 shu4', 'over') },
  { word: 'sold', character: '卖掉', pinyin: 'mai4 diao4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('卖掉', 'mai4 diao4', 'sold') },
  { word: 'been', character: '已经', pinyin: 'yi3 jing1', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('已经', 'yi3 jing1', 'been') },
  { word: 'told', character: '告诉', pinyin: 'gao4 su4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('告诉', 'gao4 su4', 'told') },
  { word: 'can', character: '能', pinyin: 'neng2', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('能', 'neng2', 'can') },
  { word: 'anything', character: '任何事', pinyin: 'ren4 he2 shi4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('任何事', 'ren4 he2 shi4', 'anything') },
  { word: 'set', character: '设定', pinyin: 'she4 ding4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('设定', 'she4 ding4', 'to set') },
  { word: 'mind', character: '心', pinyin: 'xin1', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('心', 'xin1', 'mind') },
  { word: 'man', character: '人', pinyin: 'ren2', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('人', 'ren2', 'man') },
  { word: "ain't", character: '不是', pinyin: 'bu2 shi4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('不是', 'bu2 shi4', "ain't; is not") },
  { word: 'fight', character: '战斗', pinyin: 'zhan4 dou4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('战斗', 'zhan4 dou4', 'to fight') },
  { word: 'night', character: '夜晚', pinyin: 'ye4 wan3', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('夜晚', 'ye4 wan3', 'night') },
  { word: 'put', character: '放', pinyin: 'fang4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('放', 'fang4', 'to put') },
  { word: 'plan', character: '计划', pinyin: 'ji4 hua4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('计划', 'ji4 hua4', 'plan') },
  { word: 'success', character: '成功', pinyin: 'cheng2 gong1', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('成功', 'cheng2 gong1', 'success') },

  // --- OUTRO ---
  { word: 'do', character: '做', pinyin: 'zuo4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('做', 'zuo4', 'to do') },
  { word: 'anything', character: '任何事', pinyin: 'ren4 he2 shi4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('任何事', 'ren4 he2 shi4', 'anything') },
  { word: 'set', character: '设定', pinyin: 'she4 ding4', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('设定', 'she4 ding4', 'to set') },
  { word: 'your', character: '你的', pinyin: 'ni3 de', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('你的', 'ni3 de', 'your') },
  { word: 'mind', character: '心', pinyin: 'xin1', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('心', 'xin1', 'mind') },
  { word: 'man', character: '人', pinyin: 'ren2', ef: 2.5, interval: 0, reps: 0, nextReview: 0, source: 'em-lose-yourself', result: mkResult('人', 'ren2', 'man') },
]

function sm2<T extends { ef: number; interval: number; reps: number; nextReview: number }>(card: T, quality: number): T {
  let { ef, interval, reps } = card
  if (quality < 3) {
    reps = 0; interval = 1
  } else {
    if (reps === 0) interval = 1
    else if (reps === 1) interval = 6
    else interval = Math.round(interval * ef)
    reps++
  }
  ef = Math.max(1.3, ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)))
  return { ...card, ef, interval, reps, nextReview: Date.now() + interval * 86400000 }
}

function loadCards(): SM2Card[] {
  try { return JSON.parse(localStorage.getItem('sonoglyph_cards') || '[]') }
  catch { return [] }
}
function saveCards(c: SM2Card[]) { localStorage.setItem('sonoglyph_cards', JSON.stringify(c)) }

function loadMandarinCards(): MandarinSM2Card[] {
  try { return JSON.parse(localStorage.getItem('sonoglyph_mandarin_cards') || '[]') }
  catch { return [] }
}
function saveMandarinCards(c: MandarinSM2Card[]) { localStorage.setItem('sonoglyph_mandarin_cards', JSON.stringify(c)) }

const REFINE_OPTIONS = [
  { label: 'Stronger phonetic clarity', instruction: 'Strengthen the phonetic clarity: make each sound-to-object mapping more immediately recognizable and aurally obvious. Keep the same scene world.' },
  { label: 'Deeper semantic structure', instruction: 'Deepen the semantic structure: make the functional behaviors more precisely mirror the concept\'s real-world mechanics. Keep the same scene world.' },
  { label: 'Different aesthetic mode', instruction: 'Shift the aesthetic mode to a contrasting style while preserving all phonetic mappings and semantic functions. Reimagine the scene in the new aesthetic.' },
  { label: 'More recursive symbolism', instruction: 'Add recursive symbolism: make the objects and their interactions self-referentially encode the concept at multiple scales. The scene should contain the concept within the concept.' },
  { label: 'Greater emotional tone', instruction: 'Amplify the emotional resonance: make the scene evoke a visceral feeling that mirrors what it feels like to experience or understand this concept. Keep all phonetic and semantic elements.' },
]

function loadHistory(): HistoryEntry[] {
  try { return JSON.parse(localStorage.getItem('sonoglyph_history') || '[]') }
  catch { return [] }
}
function saveHistory(h: HistoryEntry[]) {
  localStorage.setItem('sonoglyph_history', JSON.stringify(h.slice(0, 50)))
}

export default function App() {
  const [word, setWord] = useState('')
  const [mode, setMode] = useState<Mode>('Cinematic')
  const [result, setResult] = useState<SonoglyphResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory)
  const [tab, setTab] = useState<Tab>('encode')
  const [cards, setCards] = useState<SM2Card[]>(loadCards)
  const [reviewCard, setReviewCard] = useState<SM2Card | null>(null)
  const [showAnswer, setShowAnswer] = useState(false)

  // Image generation
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageLoading, setImageLoading] = useState(false)
  const [imageError, setImageError] = useState('')

  // Shuffle/Rewrite state
  const [rewriteIdx, setRewriteIdx] = useState<number | null>(null)
  const [rewriteText, setRewriteText] = useState('')

  // Mandarin state
  const [mandarinInput, setMandarinInput] = useState('')
  const [mandarinResult, setMandarinResult] = useState<MandarinResult | null>(null)
  const [mandarinFilter, setMandarinFilter] = useState<MandarinFilter>('all')
  const [mandarinCards, setMandarinCards] = useState<MandarinSM2Card[]>(loadMandarinCards)
  const [mandarinReviewCard, setMandarinReviewCard] = useState<MandarinSM2Card | null>(null)
  const [mandarinImageUrl, setMandarinImageUrl] = useState<string | null>(null)
  const [mandarinImageLoading, setMandarinImageLoading] = useState(false)
  const [mandarinImageError, setMandarinImageError] = useState('')
  const [showMandarinAnswer, setShowMandarinAnswer] = useState(false)
  const [showHints, setShowHints] = useState(false)
  const [practiceAll, setPracticeAll] = useState(false)
  const [mandarinPracticeAll, setMandarinPracticeAll] = useState(false)

  // Review mode: user types answer
  const [reviewAnswer, setReviewAnswer] = useState('')
  const [mandarinReviewAnswer, setMandarinReviewAnswer] = useState('')
  const [reviewImageUrl, setReviewImageUrl] = useState<string | null>(null)
  const [reviewImageLoading, setReviewImageLoading] = useState(false)
  const [reviewImageError, setReviewImageError] = useState('')
  const [mandarinReviewImageUrl, setMandarinReviewImageUrl] = useState<string | null>(null)
  const [mandarinReviewImageLoading, setMandarinReviewImageLoading] = useState(false)
  const [mandarinReviewImageError, setMandarinReviewImageError] = useState('')

  useEffect(() => { saveHistory(history) }, [history])
  useEffect(() => { saveCards(cards) }, [cards])
  useEffect(() => { saveMandarinCards(mandarinCards) }, [mandarinCards])

  // Seed preloaded "Lose Yourself" cards on first load (only adds missing ones)
  useEffect(() => {
    setMandarinCards(prev => {
      const existing = new Set(prev.map(c => c.character))
      const newCards = LOSE_YOURSELF_CARDS.filter(c => !existing.has(c.character))
      if (newCards.length === 0) return prev
      return [...prev, ...newCards.map(c => ({ ...c, nextReview: Date.now() + 86400000 }))]
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const dueCards = cards.filter(c => c.nextReview <= Date.now())
  const dueMandarinCards = mandarinCards.filter(c => c.nextReview <= Date.now())

  // Filter mandarin cards based on selected filter
  const filterMandarinCards = (cardList: MandarinSM2Card[]) => {
    switch (mandarinFilter) {
      case 'em-lose-yourself':
        return cardList.filter(c => c.source === 'em-lose-yourself')
      case 'general':
        return cardList.filter(c => !c.source && c.character.length > 0)
      case 'random':
        return cardList.filter(c => c.source === 'random')
      case 'all':
      default:
        return cardList
    }
  }

  // Clear image when result changes (and revoke old blob URLs to free memory)
  useEffect(() => {
    if (imageUrl) URL.revokeObjectURL(imageUrl)
    setImageUrl(null)
    setImageError('')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result])
  useEffect(() => {
    if (mandarinImageUrl) URL.revokeObjectURL(mandarinImageUrl)
    setMandarinImageUrl(null)
    setMandarinImageError('')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mandarinResult])

  const shuffleArray = <T,>(arr: T[]): T[] => {
    const shuffled = [...arr]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled
  }

  const [practiceQueue, setPracticeQueue] = useState<SM2Card[]>([])
  const [mandarinPracticeQueue, setMandarinPracticeQueue] = useState<MandarinSM2Card[]>([])

  const startReview = (practice?: boolean) => {
    const isPractice = practice ?? practiceAll
    if (isPractice) {
      const shuffled = shuffleArray(cards)
      setPracticeQueue(shuffled.slice(1))
      setReviewCard(shuffled.length ? shuffled[0] : null)
    } else {
      const due = cards.filter(c => c.nextReview <= Date.now())
      setReviewCard(due.length ? due[0] : null)
    }
    setShowAnswer(false)
    setReviewAnswer('')
    setReviewImageUrl(null)
    setReviewImageError('')
  }

  const rateCard = (quality: number) => {
    if (!reviewCard) return
    if (!practiceAll) {
      const updated = sm2(reviewCard, quality)
      setCards(prev => prev.map(c => c.word === updated.word ? updated : c))
    }
    setShowAnswer(false)
    setReviewAnswer('')
    setReviewImageUrl(null)
    setReviewImageError('')
    if (practiceAll) {
      const next = practiceQueue[0] || null
      setPracticeQueue(prev => prev.slice(1))
      setReviewCard(next)
    } else {
      const remaining = cards.filter(c => c.nextReview <= Date.now() && c.word !== reviewCard.word)
      setReviewCard(remaining.length ? remaining[0] : null)
    }
  }

  const startMandarinReview = (practice?: boolean, filter?: MandarinFilter) => {
    const isPractice = practice ?? mandarinPracticeAll
    const activeFilter = filter ?? mandarinFilter
    const filtered = mandarinCards.filter(c => {
      if (activeFilter === 'em-lose-yourself') return c.source === 'em-lose-yourself'
      if (activeFilter === 'general') return !c.source
      if (activeFilter === 'random') return c.source === 'random'
      return true
    })
    if (isPractice) {
      const shuffled = shuffleArray(filtered)
      setMandarinPracticeQueue(shuffled.slice(1))
      setMandarinReviewCard(shuffled.length ? shuffled[0] : null)
    } else {
      const due = filtered.filter(c => c.nextReview <= Date.now())
      setMandarinReviewCard(due.length ? due[0] : null)
    }
    setShowMandarinAnswer(false)
    setShowHints(false)
    setMandarinReviewAnswer('')
    setMandarinReviewImageUrl(null)
    setMandarinReviewImageError('')
  }

  const rateMandarinCard = (quality: number) => {
    if (!mandarinReviewCard) return
    if (!mandarinPracticeAll) {
      const updated = sm2(mandarinReviewCard, quality)
      setMandarinCards(prev => prev.map(c => c.character === updated.character ? updated : c))
    }
    setShowMandarinAnswer(false)
    setShowHints(false)
    setMandarinReviewAnswer('')
    setMandarinReviewImageUrl(null)
    setMandarinReviewImageError('')
    if (mandarinPracticeAll) {
      const next = mandarinPracticeQueue[0] || null
      setMandarinPracticeQueue(prev => prev.slice(1))
      setMandarinReviewCard(next)
    } else {
      const remaining = mandarinCards.filter(c => {
        if (c.character === mandarinReviewCard.character) return false
        if (c.nextReview > Date.now()) return false
        if (mandarinFilter === 'em-lose-yourself') return c.source === 'em-lose-yourself'
        if (mandarinFilter === 'general') return !c.source
        if (mandarinFilter === 'random') return c.source === 'random'
        return true
      })
      setMandarinReviewCard(remaining.length ? remaining[0] : null)
    }
  }

  // Generate image via Puter.js (primary) with Pollinations fallback
  const generateImage = async (prompt: string, target: 'english' | 'mandarin') => {
    const loadSetter = target === 'english' ? setImageLoading : setMandarinImageLoading
    const urlSetter = target === 'english' ? setImageUrl : setMandarinImageUrl
    const errSetter = target === 'english' ? setImageError : setMandarinImageError

    loadSetter(true)
    urlSetter(null)
    errSetter('')

    const truncated = prompt.length > 500 ? prompt.slice(0, 500) : prompt

    // --- Provider 1: Puter.js (free, no API key, loaded via script tag) ---
    if (typeof puter !== 'undefined' && puter.ai?.txt2img) {
      try {
        const imgEl = await puter.ai.txt2img(truncated, { model: 'dall-e-3' })
        // puter.ai.txt2img returns an HTMLImageElement; extract its src as a data URL or blob
        const src = imgEl.src
        if (src) {
          urlSetter(src)
          loadSetter(false)
          return
        }
      } catch {
        // Puter.js failed; fall through to Pollinations fallback
      }
    }

    // --- Provider 2: Pollinations.ai fallback (may be down) ---
    const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(truncated)}?width=1024&height=1024&model=flux&nologo=true`
    const maxRetries = 2
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const res = await fetch(pollinationsUrl)
        if (res.ok && res.headers.get('content-type')?.startsWith('image')) {
          const blob = await res.blob()
          const blobUrl = URL.createObjectURL(blob)
          urlSetter(blobUrl)
          loadSetter(false)
          return
        }
        if (attempt < maxRetries - 1) {
          await new Promise(r => setTimeout(r, 2000 * (attempt + 1)))
        }
      } catch {
        if (attempt < maxRetries - 1) {
          await new Promise(r => setTimeout(r, 2000 * (attempt + 1)))
        }
      }
    }

    // All providers exhausted
    loadSetter(false)
    errSetter('Image generation failed. Both Puter.js and Pollinations.ai were unavailable -- please try again in a moment.')
  }

  // Generate image specifically for review cards
  const generateReviewImage = useCallback(async (prompt: string, target: 'english' | 'mandarin') => {
    const loadSetter = target === 'english' ? setReviewImageLoading : setMandarinReviewImageLoading
    const urlSetter = target === 'english' ? setReviewImageUrl : setMandarinReviewImageUrl
    const errSetter = target === 'english' ? setReviewImageError : setMandarinReviewImageError

    loadSetter(true)
    urlSetter(null)
    errSetter('')

    const truncated = prompt.length > 500 ? prompt.slice(0, 500) : prompt

    // --- Provider 1: Puter.js ---
    if (typeof puter !== 'undefined' && puter.ai?.txt2img) {
      try {
        const imgEl = await puter.ai.txt2img(truncated, { model: 'dall-e-3' })
        const src = imgEl.src
        if (src) {
          urlSetter(src)
          loadSetter(false)
          return
        }
      } catch {
        // fall through
      }
    }

    // --- Provider 2: Pollinations.ai fallback ---
    const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(truncated)}?width=1024&height=1024&model=flux&nologo=true`
    const maxRetries = 2
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const res = await fetch(pollinationsUrl)
        if (res.ok && res.headers.get('content-type')?.startsWith('image')) {
          const blob = await res.blob()
          const blobUrl = URL.createObjectURL(blob)
          urlSetter(blobUrl)
          loadSetter(false)
          return
        }
        if (attempt < maxRetries - 1) {
          await new Promise(r => setTimeout(r, 2000 * (attempt + 1)))
        }
      } catch {
        if (attempt < maxRetries - 1) {
          await new Promise(r => setTimeout(r, 2000 * (attempt + 1)))
        }
      }
    }

    loadSetter(false)
    errSetter('Image generation failed. Both Puter.js and Pollinations.ai were unavailable -- please try again.')
  }, [])

  // Auto-generate image when review card changes
  useEffect(() => {
    if (reviewCard && tab === 'review') {
      generateReviewImage(reviewCard.result.render_prompt, 'english')
    }
    return () => {
      if (reviewImageUrl) URL.revokeObjectURL(reviewImageUrl)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewCard, tab])

  useEffect(() => {
    if (mandarinReviewCard && tab === 'mandarin-review') {
      generateReviewImage(mandarinReviewCard.result.render_prompt, 'mandarin')
    }
    return () => {
      if (mandarinReviewImageUrl) URL.revokeObjectURL(mandarinReviewImageUrl)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mandarinReviewCard, tab])

  const generate = useCallback(async (refineInstruction?: string) => {
    const target = word.trim()
    if (!target && !refineInstruction) return
    setLoading(true)
    setError('')

    try {
      const body: Record<string, unknown> = {
        word: result?.word || target,
        mode,
      }
      if (refineInstruction && result) {
        body.refine = refineInstruction
        body.previous = result
      }

      const res = await fetch(EDGE_FN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `HTTP ${res.status}`)
      }

      const data: SonoglyphResult = await res.json()
      setResult(data)

      if (!refineInstruction) {
        setHistory(prev => {
          const filtered = prev.filter(h => h.word.toLowerCase() !== data.word.toLowerCase())
          return [{ word: data.word, mode, result: data, timestamp: Date.now() }, ...filtered]
        })
        setCards(prev => {
          if (prev.some(c => c.word.toLowerCase() === data.word.toLowerCase())) return prev
          return [...prev, { word: data.word, ef: 2.5, interval: 1, reps: 0, nextReview: Date.now() + 86400000, result: data }]
        })
      } else {
        setHistory(prev =>
          prev.map(h => h.word.toLowerCase() === data.word.toLowerCase()
            ? { ...h, result: data, timestamp: Date.now() } : h)
        )
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }, [word, mode, result])

  // Shuffle a single phonetic mapping
  const shuffleMapping = async (idx: number) => {
    if (!result) return
    const pm = result.phonetic_mapping[idx]
    const instruction = `Regenerate ONLY the phonetic mapping for the sound '${pm.sound}'. Find a different object that still sounds like '${pm.sound}' and serves the same semantic role. Keep everything else unchanged.`
    await generate(instruction)
  }

  // Rewrite a single phonetic mapping with custom text
  const rewriteMapping = async (idx: number) => {
    if (!result || !rewriteText.trim()) return
    const pm = result.phonetic_mapping[idx]
    const instruction = `For the phonetic mapping of '${pm.sound}': ${rewriteText.trim()}. Adjust the scene accordingly but keep all other mappings unchanged.`
    setRewriteIdx(null)
    setRewriteText('')
    await generate(instruction)
  }

  // Mandarin generate
  const generateMandarin = async () => {
    const char = mandarinInput.trim()
    if (!char) return
    setLoading(true)
    setError('')

    try {
      const res = await fetch(MANDARIN_FN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ character: char, mode }),
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `HTTP ${res.status}`)
      }

      const data: MandarinResult = await res.json()
      setMandarinResult(data)

      // Add to mandarin SM-2 queue
      setMandarinCards(prev => {
        if (prev.some(c => c.character === data.character)) return prev
        return [...prev, {
          word: data.character,
          character: data.character,
          pinyin: data.pinyin,
          ef: 2.5, interval: 1, reps: 0,
          nextReview: Date.now() + 86400000,
          result: data,
        }]
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (word.trim()) generate()
  }

  const handleMandarinSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (mandarinInput.trim()) generateMandarin()
  }

  const loadFromHistory = (entry: HistoryEntry) => {
    setWord(entry.word)
    setResult(entry.result)
    setError('')
    setTab('encode')
  }

  return (
    <div className="app">
      {/* Sidebar */}
      <aside className="sidebar">
        <h2>History</h2>
        {history.length === 0 && (
          <p style={{ color: 'var(--text-dim)', fontSize: 13, padding: '0 8px' }}>
            No words encoded yet
          </p>
        )}
        {history.map((entry) => (
          <button
            key={entry.word}
            className={`history-item ${result?.word === entry.word ? 'active' : ''}`}
            onClick={() => loadFromHistory(entry)}
          >
            {entry.word}
          </button>
        ))}
        {history.length > 0 && (
          <button className="clear-btn" onClick={() => { setHistory([]); setResult(null) }}>
            Clear history
          </button>
        )}
      </aside>

      {/* Main content */}
      <main className="main">
        <div className="logo-section">
          <h1>Sono<span>glyph</span></h1>
          <p>Structural mnemonic encoding through phonetic scene construction</p>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
          <button
            className={`refine-btn ${tab === 'encode' ? 'active' : ''}`}
            style={tab === 'encode' ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : {}}
            onClick={() => setTab('encode')}
          >Encode</button>
          <button
            className={`refine-btn ${tab === 'review' ? 'active' : ''}`}
            style={tab === 'review' ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : {}}
            onClick={() => { setTab('review'); startReview() }}
          >
            Review{dueCards.length > 0 ? ` (${dueCards.length})` : ''}
          </button>
          <button
            className={`refine-btn ${tab === 'mandarin' ? 'active' : ''}`}
            style={tab === 'mandarin' ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : {}}
            onClick={() => setTab('mandarin')}
          >Mandarin</button>
          <button
            className={`refine-btn ${tab === 'mandarin-review' ? 'active' : ''}`}
            style={tab === 'mandarin-review' ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : {}}
            onClick={() => { setTab('mandarin-review'); startMandarinReview() }}
          >
            Mandarin Review{dueMandarinCards.length > 0 ? ` (${dueMandarinCards.length})` : ''}
          </button>
        </div>

        {/* ===== REVIEW TAB ===== */}
        {tab === 'review' && (
          <div>
            {cards.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <button
                  className="refine-btn"
                  style={practiceAll ? {
                    borderColor: '#f59e0b', color: '#f59e0b', background: 'rgba(245, 158, 11, 0.1)'
                  } : {}}
                  onClick={() => {
                    const next = !practiceAll
                    setPracticeAll(next)
                    startReview(next)
                  }}
                >
                  {practiceAll ? 'Practice All: ON' : 'Practice All: OFF'}
                </button>
                {practiceAll && (
                  <span style={{ fontSize: 12, color: '#f59e0b', fontWeight: 500 }}>
                    Practice mode -- ratings won't affect schedule
                  </span>
                )}
              </div>
            )}
            {!reviewCard ? (
              <div className="card" style={{ opacity: 1, textAlign: 'center', padding: 40 }}>
                <p style={{ color: 'var(--text-dim)', fontSize: 16 }}>
                  {cards.length === 0 ? 'No cards yet -- encode some words first!' : practiceAll ? 'No cards available.' : 'All caught up! No cards due for review.'}
                </p>
              </div>
            ) : (
              <div className="card" style={{ opacity: 1 }}>
                <div className="card-label">What word does this image represent?</div>

                {/* Show the mnemonic image */}
                {reviewImageLoading && (
                  <div className="loading" style={{ marginBottom: 16 }}>
                    <div className="dots"><span /><span /><span /></div>
                    <span>Generating mnemonic image...</span>
                  </div>
                )}
                {reviewImageError && (
                  <div className="error" style={{ marginBottom: 12 }}>{reviewImageError}</div>
                )}
                {reviewImageUrl && (
                  <div className="generated-image-container" style={{ marginBottom: 20 }}>
                    <img
                      src={reviewImageUrl}
                      alt="Mnemonic scene -- what word does this represent?"
                      className="generated-image"
                    />
                  </div>
                )}

                {!showAnswer ? (
                  <div>
                    <form onSubmit={(e) => { e.preventDefault(); if (reviewAnswer.trim()) setShowAnswer(true) }} style={{ display: 'flex', gap: 8 }}>
                      <input
                        type="text"
                        placeholder="Type the word..."
                        value={reviewAnswer}
                        onChange={e => setReviewAnswer(e.target.value)}
                        style={{
                          flex: 1, padding: '10px 14px', fontSize: 16,
                          background: 'var(--bg)', border: '1px solid var(--border)',
                          borderRadius: 8, color: 'var(--text)',
                        }}
                        autoFocus
                      />
                      <button className="generate-btn" type="submit" disabled={!reviewAnswer.trim()}>
                        Check
                      </button>
                    </form>
                  </div>
                ) : (
                  <>
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 16 }}>
                      <p style={{ fontSize: 14, color: 'var(--text-dim)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Your answer</p>
                      <p style={{
                        fontSize: 20, fontWeight: 600, marginBottom: 16,
                        color: reviewAnswer.trim().toLowerCase() === reviewCard.word.toLowerCase() ? '#22c55e' : '#ef4444',
                      }}>
                        {reviewAnswer}
                        {reviewAnswer.trim().toLowerCase() === reviewCard.word.toLowerCase() ? ' -- Correct!' : ' -- Incorrect'}
                      </p>
                      <p style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>{reviewCard.word}</p>
                      <p style={{ fontSize: 14, color: 'var(--text-dim)' }}>{reviewCard.result.definition}</p>
                      <p className="scene-text" style={{ marginTop: 12, fontSize: 13 }}>{reviewCard.result.scene_description}</p>
                    </div>
                    <div style={{ marginTop: 20 }}>
                      <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Rate yourself</p>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {[1, 2, 3, 4, 5].map(q => (
                          <button key={q} className="refine-btn" onClick={() => rateCard(q)}
                            style={{ flex: 1, textAlign: 'center' }}>
                            {q === 1 ? 'Again' : q === 2 ? 'Hard' : q === 3 ? 'OK' : q === 4 ? 'Good' : q === 5 ? 'Easy' : ''}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
            {cards.length > 0 && (
              <div style={{ marginTop: 24, fontSize: 13, color: 'var(--text-dim)' }}>
                {cards.length} card{cards.length !== 1 ? 's' : ''} total -- {dueCards.length} due now
              </div>
            )}
          </div>
        )}

        {/* ===== MANDARIN REVIEW TAB ===== */}
        {tab === 'mandarin-review' && (
          <div>
            {mandarinCards.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                <button
                  className="refine-btn"
                  style={mandarinPracticeAll ? {
                    borderColor: '#f59e0b', color: '#f59e0b', background: 'rgba(245, 158, 11, 0.1)'
                  } : {}}
                  onClick={() => {
                    const next = !mandarinPracticeAll
                    setMandarinPracticeAll(next)
                    startMandarinReview(next)
                  }}
                >
                  {mandarinPracticeAll ? 'Practice All: ON' : 'Practice All: OFF'}
                </button>
                {mandarinPracticeAll && (
                  <span style={{ fontSize: 12, color: '#f59e0b', fontWeight: 500 }}>
                    Practice mode -- ratings won't affect schedule
                  </span>
                )}
              </div>
            )}
            {/* Filter buttons */}
            {mandarinCards.length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                {([
                  { key: 'all' as MandarinFilter, label: 'All' },
                  { key: 'em-lose-yourself' as MandarinFilter, label: 'Em - Lose Yourself' },
                  { key: 'general' as MandarinFilter, label: 'General Mandarin' },
                  { key: 'random' as MandarinFilter, label: 'Random Words' },
                ]).map(f => (
                  <button
                    key={f.key}
                    className="refine-btn"
                    style={mandarinFilter === f.key ? {
                      borderColor: '#8b5cf6', color: '#8b5cf6', background: 'rgba(139, 92, 246, 0.1)'
                    } : {}}
                    onClick={() => {
                      setMandarinFilter(f.key)
                      startMandarinReview(undefined, f.key)
                    }}
                  >
                    {f.label}
                    {(() => {
                      const count = mandarinCards.filter(c => {
                        if (f.key === 'em-lose-yourself') return c.source === 'em-lose-yourself'
                        if (f.key === 'general') return !c.source
                        if (f.key === 'random') return c.source === 'random'
                        return true
                      }).length
                      return count > 0 ? ` (${count})` : ''
                    })()}
                  </button>
                ))}
              </div>
            )}
            {!mandarinReviewCard ? (
              <div className="card" style={{ opacity: 1, textAlign: 'center', padding: 40 }}>
                <p style={{ color: 'var(--text-dim)', fontSize: 16 }}>
                  {mandarinCards.length === 0 ? 'No Mandarin cards yet -- decompose some characters first!' : mandarinPracticeAll ? 'No cards available for this filter.' : 'All caught up! No Mandarin cards due for review in this filter.'}
                </p>
              </div>
            ) : (
              <div className="card" style={{ opacity: 1 }}>
                <div className="card-label">What character does this image represent?</div>

                {/* Show the mnemonic image */}
                {mandarinReviewImageLoading && (
                  <div className="loading" style={{ marginBottom: 16 }}>
                    <div className="dots"><span /><span /><span /></div>
                    <span>Generating mnemonic image...</span>
                  </div>
                )}
                {mandarinReviewImageError && (
                  <div className="error" style={{ marginBottom: 12 }}>{mandarinReviewImageError}</div>
                )}
                {mandarinReviewImageUrl && (
                  <div className="generated-image-container" style={{ marginBottom: 20 }}>
                    <img
                      src={mandarinReviewImageUrl}
                      alt="Mnemonic scene -- what character does this represent?"
                      className="generated-image"
                    />
                  </div>
                )}

                <button className="refine-btn" style={{ marginBottom: 12 }} onClick={() => setShowHints(!showHints)}>
                  {showHints ? 'Hide Hints' : 'Show Radical Hints'}
                </button>
                {showHints && (
                  <pre className="radical-tree">{mandarinReviewCard.result.radical_tree}</pre>
                )}

                {!showMandarinAnswer ? (
                  <div style={{ marginTop: 16 }}>
                    <form onSubmit={(e) => { e.preventDefault(); if (mandarinReviewAnswer.trim()) setShowMandarinAnswer(true) }} style={{ display: 'flex', gap: 8 }}>
                      <input
                        type="text"
                        placeholder="Type the character or pinyin..."
                        value={mandarinReviewAnswer}
                        onChange={e => setMandarinReviewAnswer(e.target.value)}
                        className="mandarin-input"
                        style={{
                          flex: 1, padding: '10px 14px', fontSize: 16,
                          background: 'var(--bg)', border: '1px solid var(--border)',
                          borderRadius: 8, color: 'var(--text)',
                        }}
                        autoFocus
                      />
                      <button className="generate-btn" type="submit" disabled={!mandarinReviewAnswer.trim()}>
                        Check
                      </button>
                    </form>
                  </div>
                ) : (
                  <>
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 16, textAlign: 'center' }}>
                      <p style={{ fontSize: 14, color: 'var(--text-dim)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Your answer</p>
                      <p style={{
                        fontSize: 20, fontWeight: 600, marginBottom: 16,
                        color: (mandarinReviewAnswer.trim() === mandarinReviewCard.character || mandarinReviewAnswer.trim().toLowerCase() === mandarinReviewCard.pinyin.toLowerCase()) ? '#22c55e' : '#ef4444',
                      }}>
                        {mandarinReviewAnswer}
                        {(mandarinReviewAnswer.trim() === mandarinReviewCard.character || mandarinReviewAnswer.trim().toLowerCase() === mandarinReviewCard.pinyin.toLowerCase()) ? ' -- Correct!' : ' -- Incorrect'}
                      </p>
                      <p className="character-display">{mandarinReviewCard.character}</p>
                      <p className="pinyin-display">{mandarinReviewCard.pinyin}</p>
                      <p style={{ fontSize: 14, color: 'var(--text-dim)' }}>{mandarinReviewCard.result.definition}</p>
                      {mandarinReviewCard.source === 'em-lose-yourself' && (
                        <span style={{
                          display: 'inline-block', marginTop: 8, padding: '3px 10px',
                          fontSize: 11, fontWeight: 600, letterSpacing: 0.5,
                          background: 'rgba(139, 92, 246, 0.15)', color: '#8b5cf6',
                          borderRadius: 12, border: '1px solid rgba(139, 92, 246, 0.3)'
                        }}>Em - Lose Yourself</span>
                      )}
                      <p className="scene-text" style={{ marginTop: 12, fontSize: 13 }}>{mandarinReviewCard.result.scene_description}</p>
                    </div>
                    <div style={{ marginTop: 20 }}>
                      <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Rate yourself</p>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {[1, 2, 3, 4, 5].map(q => (
                          <button key={q} className="refine-btn" onClick={() => rateMandarinCard(q)}
                            style={{ flex: 1, textAlign: 'center' }}>
                            {q === 1 ? 'Again' : q === 2 ? 'Hard' : q === 3 ? 'OK' : q === 4 ? 'Good' : q === 5 ? 'Easy' : ''}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
            {mandarinCards.length > 0 && (
              <div style={{ marginTop: 24, fontSize: 13, color: 'var(--text-dim)' }}>
                {(() => {
                  const filtered = filterMandarinCards(mandarinCards)
                  const filteredDue = filtered.filter(c => c.nextReview <= Date.now())
                  return `${filtered.length} card${filtered.length !== 1 ? 's' : ''} in filter -- ${filteredDue.length} due now (${mandarinCards.length} total)`
                })()}
              </div>
            )}
          </div>
        )}

        {/* ===== MANDARIN ENCODE TAB ===== */}
        {tab === 'mandarin' && (
          <>
            <form className="input-section" onSubmit={handleMandarinSubmit}>
              <input
                className="word-input mandarin-input"
                type="text"
                placeholder="Enter Chinese characters... (e.g. random = sui2 bian4)"
                value={mandarinInput}
                onChange={e => setMandarinInput(e.target.value)}
                disabled={loading}
                spellCheck={false}
              />
              <select
                className="mode-select"
                value={mode}
                onChange={e => setMode(e.target.value as Mode)}
                disabled={loading}
              >
                {MODES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <button className="generate-btn" type="submit" disabled={loading || !mandarinInput.trim()}>
                {loading ? 'Decomposing...' : 'Decompose'}
              </button>
            </form>

            {loading && (
              <div className="loading">
                <div className="dots"><span /><span /><span /></div>
                <span>Decomposing character...</span>
              </div>
            )}

            {error && <div className="error">{error}</div>}

            {mandarinResult && !loading && (
              <div className="results">
                {/* Definition */}
                <div className="card">
                  <div className="card-label">Definition</div>
                  <p className="character-display">{mandarinResult.character}</p>
                  <p className="pinyin-display">{mandarinResult.pinyin}</p>
                  <p>{mandarinResult.definition}</p>
                </div>

                {/* Radical Tree */}
                <div className="card">
                  <div className="card-label">Radical Decomposition</div>
                  <pre className="radical-tree">{mandarinResult.radical_tree}</pre>
                  <div className="radical-legend">
                    {mandarinResult.radicals.map(r => (
                      <div key={r.component} className="radical-item">
                        <span className="radical-char">{r.component}</span>
                        <span className="radical-pinyin">({r.pinyin})</span>
                        <span className="radical-meaning">{r.meaning}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Character Type */}
                <div className="card">
                  <div className="card-label">Character Type</div>
                  <div className="character-type">
                    <span className="type-badge">{mandarinResult.character_type.category} ({mandarinResult.character_type.category_pinyin})</span>
                    <p className="type-description">{mandarinResult.character_type.explanation}</p>
                  </div>
                </div>

                {/* Mnemonics */}
                <div className="card">
                  <div className="card-label">Mnemonics</div>
                  <div className="mnemonic-bridges">
                    {mandarinResult.mnemonics.map((m, i) => (
                      <div key={i} className="mnemonic-item">
                        <div className="mnemonic-type">{m.type.replace(/_/g, ' ')}</div>
                        <p className="mnemonic-text">{m.bridge}</p>
                        <p style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>{m.explanation}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Etymology */}
                <div className="card">
                  <div className="card-label">Etymology</div>
                  <p style={{ fontSize: 14, lineHeight: 1.7 }}>{mandarinResult.etymology}</p>
                </div>

                {/* Scene */}
                <div className="card">
                  <div className="card-label">Visual Scene</div>
                  <p className="scene-text mandarin-scene">{mandarinResult.scene_description}</p>
                </div>

                {/* Render Prompt */}
                <div className="card">
                  <div className="card-label">Render Prompt</div>
                  <div className="render-prompt">{mandarinResult.render_prompt}</div>
                </div>

                {/* Generate Image */}
                <div className="card" style={{ opacity: 1 }}>
                  <button
                    className="generate-btn"
                    onClick={() => generateImage(mandarinResult.render_prompt, 'mandarin')}
                    disabled={mandarinImageLoading}
                    style={{ width: '100%' }}
                  >
                    {mandarinImageLoading ? 'Generating...' : 'Generate Image'}
                  </button>
                  {mandarinImageLoading && (
                    <div className="loading" style={{ marginTop: 16 }}>
                      <div className="dots"><span /><span /><span /></div>
                      <span>Generating image (this may take a moment)...</span>
                    </div>
                  )}
                  {mandarinImageError && (
                    <div className="error" style={{ marginTop: 12 }}>{mandarinImageError}</div>
                  )}
                  {mandarinImageUrl && (
                    <div className="generated-image-container">
                      <img
                        src={mandarinImageUrl}
                        alt="Mnemonic scene"
                        className="generated-image"
                      />
                      <a href={mandarinImageUrl} download="sonoglyph-mandarin-image.jpg" className="download-btn">
                        Download Image
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* ===== ENCODE TAB ===== */}
        {tab === 'encode' && (
        <>
        <form className="input-section" onSubmit={handleSubmit}>
          <input
            className="word-input"
            type="text"
            placeholder="Enter a word to encode..."
            value={word}
            onChange={e => setWord(e.target.value)}
            disabled={loading}
            spellCheck={true}
            autoCorrect="on"
          />
          <select
            className="mode-select"
            value={mode}
            onChange={e => setMode(e.target.value as Mode)}
            disabled={loading}
          >
            {MODES.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <button className="generate-btn" type="submit" disabled={loading || !word.trim()}>
            {loading ? 'Encoding...' : 'Encode'}
          </button>
        </form>

        {loading && (
          <div className="loading">
            <div className="dots"><span /><span /><span /></div>
            <span>Constructing mnemonic scene...</span>
          </div>
        )}

        {error && <div className="error">{error}</div>}

        {result && !loading && (
          <>
            <div className="results">
              {/* Definition */}
              <div className="card">
                <div className="card-label">Definition</div>
                <p>{result.definition}</p>
              </div>

              {/* Phonetic Mapping with Shuffle/Rewrite */}
              <div className="card">
                <div className="card-label">Phonetic Mapping</div>
                <div className="phonetic-grid">
                  {result.phonetic_mapping.map((pm, i) => (
                    <div className="phonetic-item" key={i}>
                      <div className="sound">{pm.sound}</div>
                      <div className="object">{pm.object}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
                        {pm.role}
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                        <button
                          className="refine-btn"
                          style={{ fontSize: 11, padding: '4px 10px' }}
                          disabled={loading}
                          onClick={() => shuffleMapping(i)}
                        >Shuffle</button>
                        <button
                          className="refine-btn"
                          style={{ fontSize: 11, padding: '4px 10px' }}
                          disabled={loading}
                          onClick={() => { setRewriteIdx(rewriteIdx === i ? null : i); setRewriteText('') }}
                        >Rewrite</button>
                      </div>
                      {rewriteIdx === i && (
                        <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                          <input
                            type="text"
                            placeholder="e.g. use a trumpet instead"
                            value={rewriteText}
                            onChange={e => setRewriteText(e.target.value)}
                            style={{
                              flex: 1, padding: '6px 10px', fontSize: 12,
                              background: 'var(--bg)', border: '1px solid var(--border)',
                              borderRadius: 6, color: 'var(--text)',
                            }}
                            onKeyDown={e => { if (e.key === 'Enter') rewriteMapping(i) }}
                          />
                          <button
                            className="generate-btn"
                            style={{ fontSize: 11, padding: '6px 12px' }}
                            disabled={loading || !rewriteText.trim()}
                            onClick={() => rewriteMapping(i)}
                          >Go</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Functional Extraction */}
              <div className="card">
                <div className="card-label">Functional Extraction</div>
                <ul className="behavior-list">
                  {result.functional_extraction.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </div>

              {/* Scene Description */}
              <div className="card">
                <div className="card-label">Unified Scene</div>
                <p className="scene-text">{result.scene_description}</p>
              </div>

              {/* Render Prompt */}
              <div className="card">
                <div className="card-label">Render Prompt</div>
                <div className="render-prompt">{result.render_prompt}</div>
              </div>

              {/* Generate Image */}
              <div className="card" style={{ opacity: 1 }}>
                <button
                  className="generate-btn"
                  onClick={() => generateImage(result.render_prompt, 'english')}
                  disabled={imageLoading}
                  style={{ width: '100%' }}
                >
                  {imageLoading ? 'Generating...' : 'Generate Image'}
                </button>
                {imageLoading && (
                  <div className="loading" style={{ marginTop: 16 }}>
                    <div className="dots"><span /><span /><span /></div>
                    <span>Generating image (this may take a moment)...</span>
                  </div>
                )}
                {imageError && (
                  <div className="error" style={{ marginTop: 12 }}>{imageError}</div>
                )}
                {imageUrl && (
                  <div className="generated-image-container">
                    <img
                      src={imageUrl}
                      alt="Mnemonic scene"
                      className="generated-image"
                    />
                    <a href={imageUrl} download="sonoglyph-image.jpg" className="download-btn">
                      Download Image
                    </a>
                  </div>
                )}
              </div>
            </div>

            {/* Refine */}
            <div className="refine-section">
              <h3>Refine</h3>
              <div className="refine-buttons">
                {REFINE_OPTIONS.map((opt) => (
                  <button
                    key={opt.label}
                    className="refine-btn"
                    disabled={loading}
                    onClick={() => generate(opt.instruction)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
        </>
        )}
      </main>
    </div>
  )
}
