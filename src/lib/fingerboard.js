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

  // ♭ の多い調では、音名で数えると5つ上になる音がある（例：A線のファ♭）。指は4本なので、4の指にする
  return Math.min(stepsAbove, 4);
}

// 音階にない音の、♯ を使った呼び方。半音の番号（ド＝0、ド♯＝1、…、シ＝11）の順に並べてある
// ♯ の付く調と、調号のない調で使う
const SHARP_SPELLINGS = [
  { step: 0, accidental: 0 }, // ド
  { step: 0, accidental: 1 }, // ド♯
  { step: 1, accidental: 0 }, // レ
  { step: 1, accidental: 1 }, // レ♯
  { step: 2, accidental: 0 }, // ミ
  { step: 3, accidental: 0 }, // ファ
  { step: 3, accidental: 1 }, // ファ♯
  { step: 4, accidental: 0 }, // ソ
  { step: 4, accidental: 1 }, // ソ♯
  { step: 5, accidental: 0 }, // ラ
  { step: 5, accidental: 1 }, // ラ♯
  { step: 6, accidental: 0 }, // シ
];

// 音階にない音の、♭ を使った呼び方。♭ の付く調で使う
const FLAT_SPELLINGS = [
  { step: 0, accidental: 0 }, // ド
  { step: 1, accidental: -1 }, // レ♭
  { step: 1, accidental: 0 }, // レ
  { step: 2, accidental: -1 }, // ミ♭
  { step: 2, accidental: 0 }, // ミ
  { step: 3, accidental: 0 }, // ファ
  { step: 4, accidental: -1 }, // ソ♭
  { step: 4, accidental: 0 }, // ソ
  { step: 5, accidental: -1 }, // ラ♭
  { step: 5, accidental: 0 }, // ラ
  { step: 6, accidental: -1 }, // シ♭
  { step: 6, accidental: 0 }, // シ
];

/**
 * 音名と変化記号から、指定した音番号になる音のデータを作る関数（このファイルの中だけで使う）
 * オクターブを順に試して、音番号が合うものを探す。
 * @param {number} step - 音名の番号（0〜6）
 * @param {number} accidental - 変化記号（1 が♯、-1 が♭、0 がなし）
 * @param {number} number - 作りたい音の音番号
 * @returns {{step: number, accidental: number, octave: number}|null} 音のデータ。合うオクターブがないときは null
 */
function createNoteByNumber(step, accidental, number) {
  for (const octave of SEARCH_OCTAVES) {
    const note = { step: step, accidental: accidental, octave: octave };
    if (getNoteNumber(note) === number) {
      return note;
    }
  }
  return null;
}

/**
 * ファーストポジションの指板の、押せる場所を全部調べる関数
 * 4本の弦それぞれについて、開放弦から半音7つ分上までの、8つの場所を調べる（全部で32個）。
 * その場所の音が、選んだ調の音階の音かどうかも調べる。
 * 音階にない音は、♯ の付く調と調号のない調では ♯ で、♭ の付く調では ♭ で呼ぶ。
 * @param {object} key - 調のデータ
 * @returns {Array} 印を付ける場所の配列。1つの印は次の形
 *   stringIndex：何番目の弦か（0 が G線、3 が E線）
 *   semitones  ：開放弦から半音いくつ分上か（0 は開放弦）
 *   note       ：音のデータ（{ step, accidental, octave }）
 *   name       ：音名の文字（例：'ファ♯'）
 *   finger     ：指番号（0 は開放弦、1〜4 は指）
 *   inScale    ：選んだ調の音階の音かどうか
 *   isTonic    ：主音（音階の最初の音）かどうか
 */
export function getFingerboardMarkers(key) {
  // 調号で、7つの音名それぞれに付く変化記号（1 が♯、-1 が♭、0 がなし）
  const accidentals = getSignatureAccidentals(key.signature);

  // 音階にない音の呼び方の表（♭ の付く調は ♭、それ以外は ♯）
  const spellings = key.signature < 0 ? FLAT_SPELLINGS : SHARP_SPELLINGS;

  const markers = [];

  // 弦を1本ずつ調べる
  STRINGS.forEach((string, stringIndex) => {
    // 開放弦の音番号（半音ごとに1ずつ増える通し番号）
    const openNumber = getNoteNumber(string.openNote);

    // 開放弦から、半音ずつ上の場所を順に調べる
    for (let semitones = 0; semitones <= MAX_SEMITONES; semitones += 1) {
      // この場所の音番号
      const number = openNumber + semitones;

      // まず、音階の7つの音の中に、この音番号になるものがあるかを探す
      let note = null;
      let inScale = false;
      for (let step = 0; step < 7; step += 1) {
        const scaleNote = createNoteByNumber(step, accidentals[step], number);
        if (scaleNote !== null) {
          note = scaleNote;
          inScale = true;
          break;
        }
      }

      // 音階になかったとき：呼び方の表から、音名と変化記号を決める
      // number % 12 は、12で割った余り（ド＝0、ド♯＝1、…、シ＝11 の番号になる）
      if (note === null) {
        const spelling = spellings[number % 12];
        note = createNoteByNumber(spelling.step, spelling.accidental, number);
      }

      markers.push({
        stringIndex: stringIndex,
        semitones: semitones,
        note: note,
        name: STEP_NAMES[note.step] + accidentalToText(note.accidental),
        finger: getFinger(note.step, string.openNote.step, semitones),
        inScale: inScale,
        isTonic: inScale && note.step === key.tonicStep,
      });
    }
  });

  return markers;
}

/**
 * 印を区別するための id を作る関数
 * 「何番目の弦か」と「半音いくつ分上か」をつなげた文字にする（例：G線の半音2つ上なら "0-2"）。
 * 図の中で印を見分けるときと、選択中の印を覚えておくときに使う。
 * @param {object} marker - 印のデータ（getFingerboardMarkers が返すもの）
 * @returns {string} 印の id
 */
export function getMarkerId(marker) {
  return marker.stringIndex + "-" + marker.semitones;
}
