// 音番号を計算する関数を読み込む
import { getNoteNumber } from "./score.js";

// 調号から、各音名に付く変化記号を求める関数を読み込む
import { getSignatureAccidentals } from "./key.js";

// 基準音（ラ4）の周波数（442Hz）を読み込む
import { REFERENCE_FREQUENCY } from "./note.js";

// ===== 純正律の計算のための設定値 =====

// 基準音（ラ4）の音番号
const REFERENCE_NOTE_NUMBER = 69;

// 主音から半音いくつ分離れているか（0〜11）ごとの、主音との周波数の比率
// 例：半音7つ分（完全5度）なら、主音の周波数の 3/2 倍
const JUST_RATIOS = [
  1 / 1, // 0：主音
  16 / 15, // 1：短2度
  9 / 8, // 2：長2度
  6 / 5, // 3：短3度
  5 / 4, // 4：長3度
  4 / 3, // 5：完全4度
  45 / 32, // 6：増4度
  3 / 2, // 7：完全5度
  8 / 5, // 8：短6度
  5 / 3, // 9：長6度
  9 / 5, // 10：短7度
  15 / 8, // 11：長7度
];

// 各音名が、ラから完全5度をいくつ分進んだ位置にあるか（音名の番号 0〜6 の順）
// プラスは5度上の方向、マイナスは5度下の方向
// 5度の並び：ファ ← ド ← ソ ← レ ← ラ → ミ → シ
//           -4    -3   -2   -1   0    1    2
const FIFTHS_FROM_A = [-3, -1, 1, -4, -2, 0, 2];

// ♯や♭が1つ付くと、5度の並びの上でいくつ分ずれるか（♯は7つ上、♭は7つ下）
const FIFTHS_PER_ACCIDENTAL = 7;

/**
 * 音番号から、平均律での周波数を計算する関数
 * 平均律は、1オクターブを12等分した音律（普通のチューナーやピアノで使われる）。
 * @param {number} noteNumber - 音番号（ラ4 が 69）
 * @returns {number} 平均律での周波数（Hz）
 */
export function getEqualFrequency(noteNumber) {
  // 基準音から半音いくつ分離れているかを求め、その分だけ周波数を変える
  // 半音12個（1オクターブ）で、周波数がちょうど2倍になる
  return REFERENCE_FREQUENCY * Math.pow(2, (noteNumber - REFERENCE_NOTE_NUMBER) / 12);
}

/**
 * 調の主音を、音のデータにして返す関数
 * オクターブは4に決めておく（ほかの音の高さを計算するときの基準にするため）。
 * @param {object} key - 調のデータ
 * @returns {{step: number, accidental: number, octave: number}} 主音の音のデータ
 *   例：イ長調なら ラ4、変ロ長調なら シ♭4
 */
function getTonicNote(key) {
  return {
    step: key.tonicStep,
    // 主音に付く変化記号は、調号から分かる（例：変ロ長調のシには♭が付く）
    accidental: getSignatureAccidentals(key.signature)[key.tonicStep],
    octave: 4,
  };
}

/**
 * 調の主音（オクターブ4）の周波数を計算する関数
 * バイオリンの開放弦と同じように、ラ＝442Hz から完全5度（3/2倍）を積み重ねて求める。
 * こうすると、主音が開放弦ときれいに響く高さになる。
 * @param {object} key - 調のデータ
 * @returns {number} 主音の周波数（Hz）
 *   例：イ長調なら 442、ニ長調なら 約294.7（D線の開放弦と同じ）
 */
function getTonicFrequency(key) {
  // 主音の音のデータ
  const tonic = getTonicNote(key);

  // 主音が、ラから完全5度をいくつ分進んだ位置にあるかを求める
  const fifths = FIFTHS_FROM_A[tonic.step] + tonic.accidental * FIFTHS_PER_ACCIDENTAL;

  // ラ＝442Hz に、3/2 を fifths 回掛ける（マイナスのときは、その回数だけ割ることになる）
  let frequency = REFERENCE_FREQUENCY * Math.pow(3 / 2, fifths);

  // 5度を積み重ねると、オクターブがずれていく。
  // そこで、オクターブ4の主音の高さになるまで、2倍または半分にして合わせる。
  // 目安として平均律での主音の周波数を使い、その近く（半オクターブ以内）に来るまで繰り返す
  const target = getEqualFrequency(getNoteNumber(tonic));
  while (frequency > target * Math.SQRT2) {
    frequency = frequency / 2;
  }
  while (frequency < target / Math.SQRT2) {
    frequency = frequency * 2;
  }

  return frequency;
}

/**
 * 音の、純正律での周波数を計算する関数
 * 主音から半音いくつ分離れているかを調べ、その音程の比率を主音の周波数に掛ける。
 * @param {{step: number, accidental: number, octave: number}} note - 音のデータ
 * @param {object} key - 調のデータ
 * @returns {number} 純正律での周波数（Hz）
 */
export function getJustFrequency(note, key) {
  // 主音（オクターブ4）から、半音いくつ分離れているか（下にあるときはマイナス）
  const semitones = getNoteNumber(note) - getNoteNumber(getTonicNote(key));

  // 何オクターブ離れているか（例：半音14個なら1オクターブ上、半音-3個なら1オクターブ下）
  const octaves = Math.floor(semitones / 12);

  // オクターブの分を取り除いた、主音からの半音の数（0〜11）
  const semitonesInOctave = semitones - octaves * 12;

  // 主音の周波数 × 音程の比率 × オクターブの分（1オクターブ上がるごとに2倍）
  return getTonicFrequency(key) * JUST_RATIOS[semitonesInOctave] * Math.pow(2, octaves);
}

/**
 * 音の純正律での高さが、平均律と比べて何セントずれているかを計算する関数
 * 普通のチューナー（平均律）で測ったときに、針がどれだけずれて見えるかの目安になる。
 * @param {{step: number, accidental: number, octave: number}} note - 音のデータ
 * @param {object} key - 調のデータ
 * @returns {number} 平均律からのズレ（セント）。プラスは平均律より高い、マイナスは低い
 */
export function getCentsFromEqual(note, key) {
  // 純正律での周波数と、平均律での周波数
  const justFrequency = getJustFrequency(note, key);
  const equalFrequency = getEqualFrequency(getNoteNumber(note));

  // 周波数の比を、セントに変換する（周波数が2倍で1200セント）
  return 1200 * Math.log2(justFrequency / equalFrequency);
}
