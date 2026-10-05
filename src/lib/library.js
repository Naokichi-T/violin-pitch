// 名前を付けて保存した楽譜の一覧を、ブラウザに保存したり読み込んだりするファイル
// 「作業中の楽譜」（settings.js）とは別に、いくつでも保存しておける。

// ===== ブラウザに保存するための設定値 =====

// 保存した楽譜の一覧を保存するときの名前（localStorage の中で、この名前を付けて保存する）
const SAVED_SCORES_STORAGE_KEY = "violin-pitch:saved-scores";

/**
 * 保存した楽譜の一覧を、ブラウザから読み込む関数
 * ブラウザの中でだけ使える機能なので、ページが画面に表示された後に呼ぶこと。
 * @returns {Array} 保存した楽譜の配列。1つも保存されていないときや、読み込めないときは空の配列
 *   1つの楽譜は { id, name, keyId, tempo, temperamentId, notes, savedAt } の形
 *   id：楽譜を区別するための文字、name：名前、keyId：調の id、tempo：テンポ、
 *   temperamentId：音律の id、notes：音のデータの配列、savedAt：保存した日時（ミリ秒の数字）
 */
export function loadSavedScores() {
  try {
    // 保存されている文字を取り出す（保存されていないときは null が入る）
    const saved = localStorage.getItem(SAVED_SCORES_STORAGE_KEY);
    if (saved === null) {
      return [];
    }

    // JSON の文字を、元のデータの形に戻す
    const scores = JSON.parse(saved);

    // 配列でないとき（保存された中身が壊れているとき）は、空の配列を返す
    if (!Array.isArray(scores)) {
      return [];
    }

    // 楽譜として最低限の形になっているものだけを残す（id と名前が文字で、音の並びが配列であること）
    return scores.filter((score) => typeof score === "object" && score !== null && typeof score.id === "string" && typeof score.name === "string" && Array.isArray(score.notes));
  } catch (error) {
    // 保存領域を使えないときや、保存された文字が壊れていて戻せないとき
    return [];
  }
}

/**
 * 保存した楽譜の一覧を、ブラウザに書き込む関数（このファイルの中だけで使う）
 * @param {Array} scores - 保存した楽譜の配列
 * @returns {boolean} 書き込めたら true、書き込めなかったら false
 */
function writeSavedScores(scores) {
  try {
    // localStorage には文字しか保存できないので、JSON という形式の文字に直して保存する
    localStorage.setItem(SAVED_SCORES_STORAGE_KEY, JSON.stringify(scores));
    return true;
  } catch (error) {
    // 保存領域を使えないときや、いっぱいのとき
    return false;
  }
}

/**
 * 楽譜を区別するための id を、新しく作る関数（このファイルの中だけで使う）
 * 今の時刻と、でたらめな文字を組み合わせて、ほかの楽譜と重ならない文字にする。
 * @returns {string} 新しい id（例：'m1x2y3z4-k8f3q2'）
 */
function createId() {
  // toString(36) は、数字を「0〜9 と a〜z」を使った短い文字に直す
  const timePart = Date.now().toString(36);
  const randomPart = Math.random().toString(36).slice(2, 8);
  return timePart + "-" + randomPart;
}

/**
 * 同じ名前の楽譜が、すでに保存されているかどうかを調べる関数
 * @param {string} name - 調べる名前
 * @param {string|null} exceptId - この id の楽譜は調べない（自分自身を上書きするときに使う）。なければ null
 * @returns {boolean} 同じ名前の楽譜があれば true
 */
export function isNameUsed(name, exceptId) {
  return loadSavedScores().some((score) => score.name === name && score.id !== exceptId);
}

/**
 * 楽譜を、新しく保存する関数
 * @param {{name: string, keyId: string, tempo: number, temperamentId: string, notes: Array}} data - 保存する内容
 * @returns {object|null} 保存した楽譜（id と保存した日時が付いたもの）。保存できなかったときは null
 */
export function addSavedScore(data) {
  // 今の一覧を読み込む
  const scores = loadSavedScores();

  // 保存する楽譜を作る（新しい id と、今の日時を付ける）
  const score = {
    id: createId(),
    name: data.name,
    keyId: data.keyId,
    tempo: data.tempo,
    temperamentId: data.temperamentId,
    notes: data.notes,
    savedAt: Date.now(),
  };

  // 一覧の最後に足して、書き込む
  scores.push(score);
  if (!writeSavedScores(scores)) {
    return null;
  }

  return score;
}

/**
 * 保存してある楽譜を、新しい内容で上書きする関数
 * 名前はそのままで、調・テンポ・音律・音の並び・保存した日時を入れ替える。
 * @param {string} id - 上書きする楽譜の id
 * @param {{keyId: string, tempo: number, temperamentId: string, notes: Array}} data - 新しい内容
 * @returns {object|null} 上書きした後の楽譜。その id の楽譜がないときや、保存できなかったときは null
 */
export function updateSavedScore(id, data) {
  // 今の一覧を読み込んで、上書きする楽譜を探す
  const scores = loadSavedScores();
  const score = scores.find((item) => item.id === id);

  // 見つからないとき（一覧から削除されていたときなど）
  if (score === undefined) {
    return null;
  }

  // 内容を入れ替える（id と名前はそのまま）
  score.keyId = data.keyId;
  score.tempo = data.tempo;
  score.temperamentId = data.temperamentId;
  score.notes = data.notes;
  score.savedAt = Date.now();

  // 書き込む
  if (!writeSavedScores(scores)) {
    return null;
  }

  return score;
}

/**
 * 保存してある楽譜を、一覧から削除する関数
 * @param {string} id - 削除する楽譜の id
 * @returns {boolean} 削除できたら true。その id の楽譜がないときや、書き込めなかったときは false
 */
export function deleteSavedScore(id) {
  // 今の一覧を読み込む
  const scores = loadSavedScores();

  // 削除する楽譜を除いた、新しい一覧を作る
  const remaining = scores.filter((score) => score.id !== id);

  // 数が変わっていないときは、その id の楽譜がなかった
  if (remaining.length === scores.length) {
    return false;
  }

  // 書き込む
  return writeSavedScores(remaining);
}
