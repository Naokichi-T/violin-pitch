// 音律の一覧と、最初の設定を読み込む
import { TEMPERAMENTS, DEFAULT_TEMPERAMENT_ID } from "./tuning.js";

// ===== ブラウザに設定を保存するための設定値 =====

// 音律を保存するときの名前（localStorage の中で、この名前を付けて保存する）
// ほかのサイトやアプリの保存データと区別できるように、先頭にアプリの名前を付けている
const TEMPERAMENT_STORAGE_KEY = "violin-pitch:temperament";

// 「音を入れたとき・選んだときに音を鳴らすかどうか」を保存するときの名前
const SOUND_ENABLED_STORAGE_KEY = "violin-pitch:sound-enabled";

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
