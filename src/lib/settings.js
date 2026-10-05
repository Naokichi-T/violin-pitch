// 音律の一覧と、最初の設定を読み込む
import { TEMPERAMENTS, DEFAULT_TEMPERAMENT_ID } from "./tuning.js";

// ===== ブラウザに設定を保存するための設定値 =====

// 音律を保存するときの名前（localStorage の中で、この名前を付けて保存する）
// ほかのサイトやアプリの保存データと区別できるように、先頭にアプリの名前を付けている
const TEMPERAMENT_STORAGE_KEY = "violin-pitch:temperament";

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
