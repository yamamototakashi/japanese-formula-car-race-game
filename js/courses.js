// Japanese Formula — Course definitions
// 架空のコース3種。性格を分ける指標:
//   overtake : オーバーテイク容易度 (0.4 = 抜きにくい / 1.6 = 抜きやすい)
//   tireLoad : タイヤ負荷 (0.6 = 軽い / 1.4 = 重い)
//   pitLoss  : ピットインで失う秒数 (game seconds)
//   baseLapTime : 基準ラップタイム (game seconds)

const COURSES = [
  {
    slug: 'twin-ring-aki',
    name: 'TWIN RING AKI',
    nameJa: '秋ツインリンク',
    desc: 'ロングストレート2本、ハイスピード型。OTSの使いどころが勝負を分ける。',
    overtake: 1.5,
    tireLoad: 0.95,
    pitLoss: 22.0,
    baseLapTime: 80,
    color: '#ff3b56',
  },
  {
    slug: 'kogen-mountain',
    name: 'KOGEN MOUNTAIN',
    nameJa: '高原マウンテン',
    desc: '中速コーナーが連続するテクニカルレイアウト。タイヤ管理が命。',
    overtake: 0.85,
    tireLoad: 1.35,
    pitLoss: 24.0,
    baseLapTime: 92,
    color: '#4ad6c5',
  },
  {
    slug: 'urban-bayside',
    name: 'URBAN BAYSIDE',
    nameJa: '湾岸シティ',
    desc: '抜きどころ少なめ、ピットロスは小。ピット戦略でポジションを取れ。',
    overtake: 0.6,
    tireLoad: 1.0,
    pitLoss: 19.0,
    baseLapTime: 86,
    color: '#ffd23a',
  },
];

// メーター表示用に 0..1 へ正規化
function meterValue(course, key) {
  if (key === 'overtake') return clamp01((course.overtake - 0.4) / 1.4);
  if (key === 'tireLoad') return clamp01((course.tireLoad - 0.6) / 0.9);
  if (key === 'pitLoss')  return clamp01((course.pitLoss - 18) / 8);
  return 0.5;
}
function clamp01(x) { return Math.max(0, Math.min(1, x)); }
