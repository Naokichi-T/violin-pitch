// ===== 五線譜を描くための設定値 =====
// 単位はすべて、SVGの中での長さ（画面の幅に合わせて全体が拡大・縮小される）

// 五線の線と線の間隔
export const STAFF_SPACE = 10;

// 五線譜1段ぶんの横幅
export const STAFF_WIDTH = 448;

// 五線譜1段ぶんの高さ（五線の上下に、はみ出す音符のための余白を含む）
export const ROW_HEIGHT = 140;

// 一番下の線（ミ4）の縦の位置
// 上に余白を多く取っているのは、高い音（シ6まで）が五線の上に大きくはみ出すため
const BOTTOM_LINE_Y = 100;

// 一番下の線（ミ4）の通し番号
// 通し番号は「オクターブ × 7 ＋ 音名の番号」で求める、音の高さの順番を表す番号
// 例：ミ4 は 4 × 7 + 2 = 30
const BOTTOM_LINE_POSITION = 30;

// 五線の5本の線の通し番号（下から順に、ミ4・ソ4・シ4・レ5・ファ5）
export const LINE_POSITIONS = [30, 32, 34, 36, 38];

// ト音記号を置く線の通し番号（ソ4。下から2番目の線）
export const G_LINE_POSITION = 32;

// ト音記号の横の位置（左端からの距離）
export const CLEF_X = 8;

// 楽譜用フォントの文字の大きさ
// Bravura は「文字の大きさ ＝ 線と線の間隔の4倍」にすると、五線にぴったり合うように作られている
export const GLYPH_FONT_SIZE = STAFF_SPACE * 4;

// 楽譜用フォントの中での、各記号の文字コード
// （楽譜用フォントの共通規格 SMuFL で決められている番号）
export const GLYPHS = {
  gClef: "\uE050", // ト音記号
};

/**
 * 通し番号から、縦の位置（y座標）を計算する関数
 * 通し番号が1つ増えるごとに、線と線の間隔の半分だけ上に移動する。
 * SVGでは下に行くほど y が大きくなるので、上に移動するときは引き算になる。
 * @param {number} position - 通し番号（例：ミ4 は 30、ソ4 は 32）
 * @returns {number} 縦の位置（y座標）
 */
export function positionToY(position) {
  // 一番下の線から、通し番号いくつ分上にあるか
  const stepsFromBottomLine = position - BOTTOM_LINE_POSITION;

  // 一番下の線の位置から、その分だけ上に移動する
  return BOTTOM_LINE_Y - stepsFromBottomLine * (STAFF_SPACE / 2);
}
