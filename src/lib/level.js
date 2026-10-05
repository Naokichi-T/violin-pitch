// ===== 判定のレベルに関する設定値 =====
// 判定のレベルは、「目標の音からどのくらいずれていても OK とするか」の決め方のこと

// 選べるレベルの一覧
//   id        ：レベルを区別するための名前（保存するときにも使う）
//   name      ：画面に表示する名前
//   tolerance ：「OK」とする範囲（セント）。例：10 なら、−10〜+10 が OK
// OK の範囲を変えたいときは、ここの tolerance の数字を書き換える
export const LEVELS = [
  { id: "normal", name: "ノーマル", tolerance: 10 },
  { id: "easy", name: "イージー", tolerance: 25 },
];

// 最初に選ばれているレベルの id（ノーマル）
export const DEFAULT_LEVEL_ID = "normal";

/**
 * id からレベルのデータを探す関数
 * @param {string} id - レベルの id（例：'normal'）
 * @returns {object} レベルのデータ。見つからないときは一覧の先頭（ノーマル）を返す
 */
export function getLevel(id) {
  // 一覧の中から、id が一致するものを探す
  const found = LEVELS.find((level) => level.id === id);

  // 見つからなかったとき（古いデータなど）は、一覧の先頭のノーマルを返す
  return found ?? LEVELS[0];
}
