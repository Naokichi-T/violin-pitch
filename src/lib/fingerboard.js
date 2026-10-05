// 指板（バイオリンの弦を押さえる板）の上で、音がどこにあるかを計算するファイル
// 今は、ファーストポジション（開放弦から、4の指で届くところまで）だけを扱う。

// 音番号を計算する関数、音名の一覧、変化記号を文字にする関数を読み込む
import { getNoteNumber, STEP_NAMES, accidentalToText } from "./score.js";

// 調号から、各音名に付く変化記号を求める関数を読み込む
import { getSignatureAccidentals } from "./key.js";

// ===== 指板に関する設定値 =====

// 4本の弦。指板の図では、左から G線・D線・A線・E線 の順に並べる
//   id       ：弦を区別するための名前（図の上に表示する）
//   openNote ：開放弦（指で押さえないとき）の音のデータ
export const STRINGS = [
  { id: "G", openNote: { step: 4, accidental: 0, octave: 3 } },
  { id: "D", openNote: { step: 1, accidental: 0, octave: 4 } },
  { id: "A", openNote: { step: 5, accidental: 0, octave: 4 } },
  { id: "E", openNote: { step: 2, accidental: 0, octave: 5 } },
];

// ファーストポジションで扱う範囲：開放弦から、半音いくつ分上までか
// 7 は、4の指でふつうに届く高さ（隣の高い弦の開放弦と同じ音）
export const MAX_SEMITONES = 7;

// 音を探すオクターブの範囲（バイオリンのファーストポジションの音は、この中に全部入る）
const SEARCH_OCTAVES = [3, 4, 5, 6];

/**
 * 指番号を決める関数（このファイルの中だけで使う）
 * ファーストポジションでは、開放弦の音名から数えて、1つ上の音名が1の指、2つ上が2の指…となる。
 * 例：G線（ソ）なら、ラが1、シが2、ドが3、レが4。♯や♭が付いても、音名が同じなら同じ指。
 * @param {number} step - 押さえる音の、音名の番号（0〜6）
 * @param {number} openStep - その弦の開放弦の、音名の番号（0〜6）
 * @param {number} semitones - 開放弦から半音いくつ分上か
 * @returns {number} 指番号（0 は開放弦、1〜4 は指）
 */
function getFinger(step, openStep, semitones) {
  // 開放弦そのもの
  if (semitones === 0) {
    return 0;
  }

  // 開放弦の音名から、音名でいくつ上か（0〜6）。7 を足してから割った余りにすると、マイナスにならない
  const stepsAbove = (step - openStep + 7) % 7;

  // 開放弦と同じ音名に♯が付いた音（例：G線のソ♯）は、1の指をナットの近くに引いて押さえる
  if (stepsAbove === 0) {
    return 1;
  }

  return stepsAbove;
}

/**
 * 選んだ調の音階の音が、ファーストポジションの指板のどこにあるかを調べる関数
 * 4本の弦それぞれについて、開放弦から半音7つ分上までの間にある、音階の音を全部探す。
 * @param {object} key - 調のデータ
 * @returns {Array} 印を付ける場所の配列。1つの印は次の形
 *   stringIndex：何番目の弦か（0 が G線、3 が E線）
 *   semitones  ：開放弦から半音いくつ分上か（0 は開放弦）
 *   note       ：音のデータ（{ step, accidental, octave }）
 *   name       ：音名の文字（例：'ファ♯'）
 *   finger     ：指番号（0 は開放弦、1〜4 は指）
 *   isTonic    ：主音（音階の最初の音）かどうか
 */
export function getFingerboardMarkers(key) {
  // 調号で、7つの音名それぞれに付く変化記号（1 が♯、-1 が♭、0 がなし）
  const accidentals = getSignatureAccidentals(key.signature);

  const markers = [];

  // 弦を1本ずつ調べる
  STRINGS.forEach((string, stringIndex) => {
    // 開放弦の音番号（半音ごとに1ずつ増える通し番号）
    const openNumber = getNoteNumber(string.openNote);

    // 音階の7つの音名を、1つずつ調べる
    for (let step = 0; step < 7; step += 1) {
      // どのオクターブなら、この弦のファーストポジションに入るかを探す
      for (const octave of SEARCH_OCTAVES) {
        const note = { step: step, accidental: accidentals[step], octave: octave };

        // 開放弦から半音いくつ分上か
        const semitones = getNoteNumber(note) - openNumber;

        // ファーストポジションの範囲に入っているときだけ、印を付ける
        if (semitones >= 0 && semitones <= MAX_SEMITONES) {
          markers.push({
            stringIndex: stringIndex,
            semitones: semitones,
            note: note,
            name: STEP_NAMES[step] + accidentalToText(note.accidental),
            finger: getFinger(step, string.openNote.step, semitones),
            isTonic: step === key.tonicStep,
          });
        }
      }
    }
  });

  return markers;
}
