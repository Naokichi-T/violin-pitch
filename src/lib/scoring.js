// 「通し」モードの点数を計算するファイル
// 点の付け方を変えたくなったときは、このファイルだけを直せばよい。

// ずれ（セント）と点数の対応表。ずれの小さい順に並べておく
// 表の間の値は、前後の点を直線でつないで計算する
//   例：ずれ 20 は、10（90点）と 25（60点）の間なので 70点
// 一番上の行より小さいずれ（0〜5セント）は 100点、一番下の行より大きいずれ（100セント以上）は 0点
const SCORE_TABLE = [
  { cents: 5, points: 100 },
  { cents: 10, points: 90 },
  { cents: 25, points: 60 },
  { cents: 40, points: 42 },
  { cents: 50, points: 30 },
  { cents: 75, points: 15 },
  { cents: 100, points: 0 },
];

/**
 * 1つの音の、ずれ（セント）から点数を計算する関数
 * 高い・低いは区別せず、ずれの大きさだけで決める。
 * @param {number|null} cents - 目標の音とのずれ（セント）。音が出ていなかったときは null
 * @returns {number} 点数（0〜100 の整数）
 */
export function centsToPoints(cents) {
  // 音が出ていなかったときは 0点
  if (cents === null) {
    return 0;
  }

  // ずれの大きさ（高い・低いを区別しないので、マイナスを取る）
  const distance = Math.abs(cents);

  // 表の一番上の行より小さいずれは、一番上の行の点数（100点）
  if (distance <= SCORE_TABLE[0].cents) {
    return SCORE_TABLE[0].points;
  }

  // 表を上から順に見て、ずれがどの行とどの行の間にあるかを探す
  for (let index = 1; index < SCORE_TABLE.length; index += 1) {
    // 間の「前」の行と「後ろ」の行
    const previous = SCORE_TABLE[index - 1];
    const current = SCORE_TABLE[index];

    if (distance <= current.cents) {
      // 前の行から後ろの行までのうち、どのくらい進んだ位置か（0 なら前の行、1 なら後ろの行）
      const ratio = (distance - previous.cents) / (current.cents - previous.cents);

      // 前の行の点数から、進んだぶんだけ後ろの行の点数に近づける。小数は四捨五入する
      return Math.round(previous.points + (current.points - previous.points) * ratio);
    }
  }

  // 表の一番下の行より大きいずれは 0点
  return 0;
}

/**
 * 全体の点数を計算する関数
 * 1音ごとの点数を平均して、小数を四捨五入する。
 * @param {(number|null)[]} centsList - 1音ごとのずれ（セント）の配列。音が出ていなかった音は null
 * @returns {number} 全体の点数（0〜100 の整数）。配列が空のときは 0
 */
export function getTotalScore(centsList) {
  // 音が1つもないときは 0点（0 で割り算をしないため）
  if (centsList.length === 0) {
    return 0;
  }

  // 1音ごとの点数を全部足す
  let sum = 0;
  for (const cents of centsList) {
    sum += centsToPoints(cents);
  }

  // 音の数で割って平均にし、小数を四捨五入する
  return Math.round(sum / centsList.length);
}
