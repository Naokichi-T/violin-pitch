// 音律の一覧と、最初の設定を読み込む
import { TEMPERAMENTS, DEFAULT_TEMPERAMENT_ID } from "./tuning.js";

// 音が登録できる音域に入っているかを調べる関数を読み込む（保存された楽譜の確認に使う）
import { isInRange } from "./score.js";

// ===== ブラウザに設定を保存するための設定値 =====

// 音律を保存するときの名前（localStorage の中で、この名前を付けて保存する）
// ほかのサイトやアプリの保存データと区別できるように、先頭にアプリの名前を付けている
const TEMPERAMENT_STORAGE_KEY = "violin-pitch:temperament";

// 「音を入れたとき・選んだときに音を鳴らすかどうか」を保存するときの名前
const SOUND_ENABLED_STORAGE_KEY = "violin-pitch:sound-enabled";

// 作業中の楽譜（調・テンポ・音の並び）を保存するときの名前
const CURRENT_SCORE_STORAGE_KEY = "violin-pitch:current-score";

/**
 * 最後に選んだ音律の id を、ブラウザから読み込む関数
 * 保存されていないときや、読み込めないときは、最初の設定（DEFAULT_TEMPERAMENT_ID）を返す。
 * ブラウザの中でだけ使える機能なので、ページが画面に表示された後に呼ぶこと。
 * @returns {string} 音律の id（'just'・'pythagorean'・'equal'）
 */
export function loadTemperamentId() {
  try {
    // 保存されている値を取り出す（保存されていないときは null が入る）
    const saved = localStorage.getItem(TEMPERAMENT_STORAGE_KEY);

    // 保存されていた値が、今の音律の一覧にあるものかを確認する
    // （一覧にない値がそのまま使われてしまうのを防ぐため）
    const isValid = TEMPERAMENTS.some((temperament) => temperament.id === saved);
    if (isValid) {
      return saved;
    }
  } catch (error) {
    // ブラウザの設定によっては、保存領域を使えずにエラーになることがある
    // そのときは何もせず、下で最初の設定を返す
  }

  // 保存されていないとき、正しくない値のとき、読み込めなかったとき
  return DEFAULT_TEMPERAMENT_ID;
}

/**
 * 選んだ音律の id を、ブラウザに保存する関数
 * 保存しておくと、次にページを開いたときも同じ音律から始められる。
 * @param {string} id - 音律の id（'just'・'pythagorean'・'equal'）
 */
export function saveTemperamentId(id) {
  try {
    localStorage.setItem(TEMPERAMENT_STORAGE_KEY, id);
  } catch (error) {
    // 保存領域を使えないときは、保存をあきらめる（アプリはそのまま使える）
  }
}

/**
 * 「音を入れたとき・選んだときに音を鳴らすかどうか」を、ブラウザから読み込む関数
 * 保存されていないときや、読み込めないときは、「鳴らす」（true）を返す。
 * ブラウザの中でだけ使える機能なので、ページが画面に表示された後に呼ぶこと。
 * @returns {boolean} 鳴らすなら true、鳴らさないなら false
 */
export function loadSoundEnabled() {
  try {
    // 保存されている値を取り出す（保存されていないときは null が入る）
    // localStorage には文字しか保存できないので、'true' か 'false' という文字で入っている
    const saved = localStorage.getItem(SOUND_ENABLED_STORAGE_KEY);

    // 'false' と保存されているときだけ「鳴らさない」にする
    if (saved === "false") {
      return false;
    }
  } catch (error) {
    // 保存領域を使えないときは何もせず、下で「鳴らす」を返す
  }

  // 保存されていないとき、'true' のとき、読み込めなかったとき
  return true;
}

/**
 * 「音を入れたとき・選んだときに音を鳴らすかどうか」を、ブラウザに保存する関数
 * @param {boolean} enabled - 鳴らすなら true、鳴らさないなら false
 */
export function saveSoundEnabled(enabled) {
  try {
    // true・false を、'true'・'false' という文字に直して保存する
    localStorage.setItem(SOUND_ENABLED_STORAGE_KEY, String(enabled));
  } catch (error) {
    // 保存領域を使えないときは、保存をあきらめる（アプリはそのまま使える）
  }
}

/**
 * 作業中の楽譜を、ブラウザに保存する関数
 * 保存しておくと、ページを再読み込みしたときや、練習ページを開いたときに、同じ楽譜を使える。
 * @param {{keyId: string, tempo: number, notes: Array}} score - 楽譜のデータ
 *   keyId：調の id、tempo：テンポ、notes：音のデータの配列
 */
export function saveCurrentScore(score) {
  try {
    // localStorage には文字しか保存できないので、楽譜のデータを JSON という形式の文字に直す
    // 例：{"keyId":"A-dur","tempo":60,"notes":[{"step":5,"accidental":0,"octave":4}]}
    localStorage.setItem(CURRENT_SCORE_STORAGE_KEY, JSON.stringify(score));
  } catch (error) {
    // 保存領域を使えないときは、保存をあきらめる（アプリはそのまま使える）
  }
}

/**
 * 保存されたデータが、正しい音のデータかどうかを調べる関数
 * 保存領域の中身が壊れていた場合に、おかしなデータを楽譜に入れてしまうのを防ぐ。
 * @param {any} note - 調べるデータ
 * @returns {boolean} 正しい音のデータなら true
 */
function isValidNote(note) {
  // オブジェクトでないもの（null、数字、文字など）は、音のデータではない
  if (typeof note !== "object" || note === null) {
    return false;
  }

  // 音名の番号は 0〜6 の整数、変化記号は -1・0・1 のどれか、オクターブは整数であること
  const isStepValid = Number.isInteger(note.step) && note.step >= 0 && note.step <= 6;
  const isAccidentalValid = note.accidental === -1 || note.accidental === 0 || note.accidental === 1;
  const isOctaveValid = Number.isInteger(note.octave);
  if (!isStepValid || !isAccidentalValid || !isOctaveValid) {
    return false;
  }

  // 登録できる音域（ソ3〜シ6）に入っていること
  return isInRange(note);
}

/**
 * 作業中の楽譜を、ブラウザから読み込む関数
 * ブラウザの中でだけ使える機能なので、ページが画面に表示された後に呼ぶこと。
 * @returns {{keyId: string, tempo: number, notes: Array}|null}
 *   楽譜のデータ。保存されていないときや、読み込めないときは null
 */
export function loadCurrentScore() {
  try {
    // 保存されている文字を取り出す（保存されていないときは null が入る）
    const saved = localStorage.getItem(CURRENT_SCORE_STORAGE_KEY);
    if (saved === null) {
      return null;
    }

    // JSON の文字を、元のデータの形に戻す
    const score = JSON.parse(saved);

    // 楽譜のデータとして形が正しいかを確認する
    const isShapeValid = typeof score === "object" && score !== null && typeof score.keyId === "string" && typeof score.tempo === "number" && Array.isArray(score.notes);
    if (!isShapeValid) {
      return null;
    }

    // 正しい音のデータだけを残して返す
    // それぞれの音は、必要な3つの値だけを取り出した新しいデータにする
    return {
      keyId: score.keyId,
      tempo: score.tempo,
      notes: score.notes.filter(isValidNote).map((note) => ({
        step: note.step,
        accidental: note.accidental,
        octave: note.octave,
      })),
    };
  } catch (error) {
    // 保存領域を使えないときや、保存された文字が壊れていて戻せないとき
    return null;
  }
}
