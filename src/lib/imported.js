// 読み込んだ楽譜（MusicXML から読み込んだ、練習専用の楽譜）を扱うファイル（ステップA-1a）
// （ステップA-1b：同じ名前を探す・名前に (2) を付ける・上書き・削除の関数を足した）
// 手で入力した楽譜（library.js）とは、保存する場所も形も別にしている。
//
// 【読み込んだ楽譜の形】
// 楽譜作成アプリ（string-score）と同じ形のまま、選んだパートだけを保存する
// （くり返しの展開やテンポの計算に、楽譜作成アプリの考え方をそのまま使えるようにするため）
// {
//   id:            楽譜を区別するための文字
//   name:          名前（例：'カノン（Violin I）'）
//   title:         MusicXML のタイトル
//   partName:      選んだパートの名前（例：'Violin I'）
//   instrument:    選んだパートの楽器（'violin'・'viola' など）
//   keyId:         調の id（例：'D-dur'。読み込むときに選んだ長調・短調）
//   temperamentId: 音律の id（読み込んだときに選ばれていた音律）
//   tempo:         1小節目のテンポ（♩＝○○）
//   tempoText:     速度記号（'Allegro' など。なければ空の文字）
//   measures:      楽譜全体の小節の情報（拍子・調・途中のテンポ・rit.・くり返しなど。楽譜作成アプリと同じ形）
//   partMeasures:  選んだパートの小節（音符の並び。楽譜作成アプリと同じ形）
//   importedAt:    読み込んだ日時（ミリ秒の数字）
//   bestScore:     「通し」の最高点（あとのステップで記録する。まだ無いときは、項目そのものが無い）
// }

// 楽譜作成アプリの計算の関数を読み込む（調・高さを数にする・重音の高さの並び・ハーモニクスのひし形）
import { keyAt, pitchNumber, notePitches, hasDiamond } from "#lib/musicxml/model.js";

// 調の一覧と、調の名前を作る関数を読み込む
import { KEYS } from "#lib/key.js";

// 今選ばれている音律を読み込む関数を読み込む
import { loadTemperamentId } from "#lib/settings.js";

// ===== ブラウザに保存するための設定値 =====

// 読み込んだ楽譜の一覧を保存するときの名前（手で入力した楽譜の一覧とは別の名前にする）
const IMPORTED_SCORES_STORAGE_KEY = "violin-pitch:imported-scores";

// ===== 判定できる音域（score.js と同じ値。ソ3〜シ6） =====

// 判定できる一番低い音の音番号（ソ3。バイオリンのG線の開放弦）
const MIN_NOTE_NUMBER = 55;

// 判定できる一番高い音の音番号（シ6）
const MAX_NOTE_NUMBER = 95;

// ===== 判定から外す理由 =====
// 音符のどこを見て外すかと、知らせるときの名前
//   range     ：音域の外（重音なら、いちばん上の音で調べる）
//   ornament  ：トリル・プラルトリラー・モルデント・ターン（音がすばやく行き来するので、1つの高さに決まらない）
//   grace     ：前打音の付いた音（頭に別の高さの音が入る）
//   tremolo   ：トレモロ（2音トレモロも。音を細かく刻む・行き来する）
//   glissando ：グリッサンド（高さがすべって変わる）
//   harmonic  ：ハーモニクスのひし形の玉がある音（書いた高さと、聞こえる高さが違う）
const EXCLUDE_LABELS = {
  range: "音域（ソ3〜シ6）の外の音",
  ornament: "トリルなどの装飾の付いた音",
  grace: "前打音の付いた音",
  tremolo: "トレモロの音",
  glissando: "グリッサンドの付いた音",
  harmonic: "ハーモニクス（ひし形）の音",
};

/**
 * 読み込んだ楽譜の一覧を、ブラウザから読み込む関数
 * ブラウザの中でだけ使える機能なので、ページが画面に表示された後に呼ぶこと。
 * @returns {Array} 読み込んだ楽譜の配列。1つもないときや、読み込めないときは空の配列
 */
export function loadImportedScores() {
  try {
    // 保存されている文字を取り出す（保存されていないときは null が入る）
    const saved = localStorage.getItem(IMPORTED_SCORES_STORAGE_KEY);
    if (saved === null) {
      return [];
    }

    // JSON の文字を、元のデータの形に戻す
    const scores = JSON.parse(saved);

    // 配列でないとき（保存された中身が壊れているとき）は、空の配列を返す
    if (!Array.isArray(scores)) {
      return [];
    }

    // 楽譜として最低限の形になっているものだけを残す（id と名前が文字で、小節の並びが配列であること）
    return scores.filter(
      (score) => typeof score === "object" && score !== null && typeof score.id === "string" && typeof score.name === "string" && Array.isArray(score.measures) && Array.isArray(score.partMeasures),
    );
  } catch (error) {
    // 保存領域を使えないときや、保存された文字が壊れていて戻せないとき
    return [];
  }
}

/**
 * 読み込んだ楽譜の一覧を、ブラウザに書き込む関数（このファイルの中だけで使う）
 * @param {Array} scores - 読み込んだ楽譜の配列
 * @returns {boolean} 書き込めたら true、書き込めなかったら false
 */
function writeImportedScores(scores) {
  try {
    // localStorage には文字しか保存できないので、JSON という形式の文字に直して保存する
    localStorage.setItem(IMPORTED_SCORES_STORAGE_KEY, JSON.stringify(scores));
    return true;
  } catch (error) {
    // 保存領域を使えないときや、いっぱいのとき
    return false;
  }
}

/**
 * 楽譜を区別するための id を、新しく作る関数（このファイルの中だけで使う）
 * 今の時刻と、でたらめな文字を組み合わせて、ほかの楽譜と重ならない文字にする。
 * （手で入力した楽譜と見分けやすいように、頭に「x」を付ける）
 * @returns {string} 新しい id（例：'xm1x2y3z4-k8f3q2'）
 */
function createId() {
  // toString(36) は、数字を「0〜9 と a〜z」を使った短い文字に直す
  const timePart = Date.now().toString(36);
  const randomPart = Math.random().toString(36).slice(2, 8);
  return "x" + timePart + "-" + randomPart;
}

/**
 * 読み込んだ楽譜を、一覧に新しく足して保存する関数
 * @param {object} record - 保存する楽譜（buildImportedScore で作ったもの。id と日時はここで付ける）
 * @returns {object|null} 保存した楽譜。保存できなかったときは null
 */
export function addImportedScore(record) {
  // 今の一覧を読み込む
  const scores = loadImportedScores();

  // 新しい id と、今の日時を付ける
  const score = { ...record, id: createId(), importedAt: Date.now() };

  // 一覧の最後に足して、書き込む
  scores.push(score);
  if (!writeImportedScores(scores)) {
    return null;
  }

  return score;
}

/**
 * 同じ名前の、読み込んだ楽譜を探す関数（ステップA-1b）
 * 読み込むときに「上書きか、別に追加か」を聞くために使う。
 * @param {string} name - 探す名前
 * @returns {object|null} 見つかった楽譜（同じ名前が2つ以上あるときは、いちばん新しく読み込んだもの）。なければ null
 */
export function findImportedScoreByName(name) {
  // 同じ名前の楽譜を全部取り出して、読み込んだ日時の新しい順に並べる
  const sameName = loadImportedScores()
    .filter((score) => score.name === name)
    .sort((a, b) => b.importedAt - a.importedAt);

  // 1つもなければ null、あれば先頭（いちばん新しいもの）
  return sameName.length === 0 ? null : sameName[0];
}

/**
 * 同じ名前の楽譜があるとき、名前のうしろに「 (2)」「 (3)」…を付けて、まだ使っていない名前にする関数（ステップA-1b）
 * ［別に追加］を選んだときに使う。
 * @param {string} name - もとの名前（例：'カノン（Violin I）'）
 * @returns {string} まだ使っていない名前（例：'カノン（Violin I） (2)'）。同じ名前がなければ、もとの名前のまま
 */
export function getUniqueName(name) {
  // 今ある楽譜の名前を全部集める（Set は、同じものを1つにまとめて持てる入れ物。has で「入っているか」を調べられる）
  const usedNames = new Set(loadImportedScores().map((score) => score.name));

  // 同じ名前がなければ、そのまま使う
  if (!usedNames.has(name)) {
    return name;
  }

  // (2) から順に、まだ使っていない番号を探す
  let number = 2;
  while (usedNames.has(name + " (" + number + ")")) {
    number += 1;
  }
  return name + " (" + number + ")";
}

/**
 * 楽譜の中身（調・小節の情報・音符）を、比べるための文字にする関数（このファイルの中だけで使う）（ステップA-1b）
 * 上書きするときに、楽譜が変わったかどうか（最高点を消すかどうか）を決めるのに使う。
 * テンポ・音律・名前は比べない（変わっても、前の点数と比べられるので）。
 * @param {object} score - 読み込んだ楽譜
 * @returns {string} 比べるための文字
 */
function toComparableText(score) {
  return JSON.stringify({
    keyId: score.keyId,
    measures: score.measures,
    partMeasures: score.partMeasures,
  });
}

/**
 * 読み込んだ楽譜を、新しく読み込んだ内容で上書きする関数（ステップA-1b）
 * id はそのまま、中身と読み込んだ日時を入れ替える。
 * 楽譜の中身（調・小節・音符）が変わったときは、最高点を消す（前の点数とは比べられないため）。
 * @param {string} id - 上書きする楽譜の id
 * @param {object} record - 新しく読み込んだ楽譜の形（buildImportedScore で作ったもの）
 * @returns {object|null} 上書きした後の楽譜。その id の楽譜がないときや、保存できなかったときは null
 */
export function replaceImportedScore(id, record) {
  // 今の一覧を読み込んで、上書きする楽譜の場所を探す（findIndex は、見つからないとき -1 を返す）
  const scores = loadImportedScores();
  const index = scores.findIndex((score) => score.id === id);
  if (index === -1) {
    return null;
  }

  const old = scores[index];

  // 新しい楽譜を作る（id は前のまま、読み込んだ日時は今）
  const score = { ...record, id: old.id, importedAt: Date.now() };

  // 楽譜の中身が同じで、前に最高点があれば、最高点を引き継ぐ
  if (toComparableText(old) === toComparableText(record) && typeof old.bestScore === "number") {
    score.bestScore = old.bestScore;
  }

  // 一覧の同じ場所に入れ替えて、書き込む
  scores[index] = score;
  if (!writeImportedScores(scores)) {
    return null;
  }

  return score;
}

/**
 * 読み込んだ楽譜を、一覧から削除する関数（ステップA-1b）
 * @param {string} id - 削除する楽譜の id
 * @returns {boolean} 削除できたら true。その id の楽譜がないときや、書き込めなかったときは false
 */
export function deleteImportedScore(id) {
  // 今の一覧を読み込む
  const scores = loadImportedScores();

  // 削除する楽譜を除いた、新しい一覧を作る
  const remaining = scores.filter((score) => score.id !== id);

  // 数が変わっていないときは、その id の楽譜がなかった
  if (remaining.length === scores.length) {
    return false;
  }

  // 書き込む
  return writeImportedScores(remaining);
}

/**
 * 楽譜のパートの一覧を、選ぶメニュー用に作る関数
 * @param {object} score - 楽譜作成アプリの形の楽譜データ（musicXMLToScore で読み込んだもの）
 * @returns {{index: number, name: string}[]} パートの番号（0から）と名前の配列
 */
export function getPartChoices(score) {
  return score.parts.map((part, index) => ({ index: index, name: part.name }));
}

/**
 * 楽譜の1小節目の調号から、候補になる調（長調と短調の2つ）を返す関数
 * MusicXML には長調・短調の区別が書かれていないことが多いので、読み込むときに選んでもらう。
 * @param {object} score - 楽譜作成アプリの形の楽譜データ
 * @returns {object[]} [長調, 短調] の調のデータ（key.js の KEYS の中のもの）
 */
export function getKeyChoices(score) {
  // 1小節目の調号（♯の数がプラス、♭の数がマイナス）
  const signature = keyAt(score, 0);

  // 同じ調号の長調と短調を探す（KEYS には、どの調号にも長調と短調が1つずつある）
  const major = KEYS.find((key) => key.mode === "major" && key.signature === signature);
  const minor = KEYS.find((key) => key.mode === "minor" && key.signature === signature);
  return [major, minor];
}

/**
 * 読み込む楽譜の、最初の名前を作る関数
 * 「タイトル（パート名）」の形にする。
 * @param {object} score - 楽譜作成アプリの形の楽譜データ
 * @param {number} partIndex - 選んだパートの番号（0から）
 * @returns {string} 名前（例：'カノン（Violin I）'）
 */
export function getDefaultName(score, partIndex) {
  return score.title + "（" + score.parts[partIndex].name + "）";
}

/**
 * 音符を判定から外す理由を返す関数
 * あとのステップ（練習ページ）でも、灰色にする音を決めるのに使う。
 * @param {object} note - 楽譜作成アプリの形の音符（休符ではないもの）
 * @returns {string|null} 外す理由（EXCLUDE_LABELS の名前。'range' など）。判定できる音なら null
 */
export function getExcludeReason(note) {
  // 重音は、いちばん上の音で判定する（notePitches は低い順に並んでいるので、最後がいちばん上）
  const pitches = notePitches(note);
  const top = pitches[pitches.length - 1];
  const noteNumber = pitchNumber(top);

  // 上から順に調べて、最初に当てはまった理由を返す
  if (noteNumber < MIN_NOTE_NUMBER || noteNumber > MAX_NOTE_NUMBER) return "range";
  if (hasDiamond(note)) return "harmonic";
  if (note.ornament) return "ornament";
  if (note.grace) return "grace";
  if (note.tremolo) return "tremolo";
  if (note.glissando) return "glissando";
  return null;
}

/**
 * 選んだパートを調べて、読み込むときに知らせることを作る関数
 * タイでつながった後ろの音は、前の音と同じ1つの音として数える（数えない）。
 * @param {object} score - 楽譜作成アプリの形の楽譜データ
 * @param {number} partIndex - 選んだパートの番号（0から）
 * @returns {{notices: string[], judgeableCount: number}}
 *   notices：知らせる文の配列、judgeableCount：判定できる音の数
 */
export function analyzePart(score, partIndex) {
  const part = score.parts[partIndex];

  // 数える入れ物
  let chordCount = 0; // 重音の数
  let judgeableCount = 0; // 判定できる音の数
  const excluded = {}; // 外す理由ごとの音の数（例：{ range: 3 }）

  // 1つ前の音符・休符（小節をまたいでもよい。タイの続きかどうかを調べるのに使う）
  let previous = null;

  part.measures.forEach((measure) => {
    measure.notes.forEach((note) => {
      // 前の音からタイでつながってきた音か（つながってきた音は、前の音と1つの音として数えるので、ここでは数えない）
      const isTiedFromPrevious = previous !== null && !previous.rest && previous.tie;
      previous = note;

      // 休符と、タイの続きの音は数えない
      if (note.rest || isTiedFromPrevious) {
        return;
      }

      // 重音の数
      if (note.chord && note.chord.length > 0) {
        chordCount += 1;
      }

      // 判定から外す音か、判定できる音か
      const reason = getExcludeReason(note);
      if (reason === null) {
        judgeableCount += 1;
      } else {
        // excluded[reason] がまだ無いときは 0 として、1つ足す
        excluded[reason] = (excluded[reason] ?? 0) + 1;
      }
    });
  });

  // 知らせる文を作る
  const notices = [];

  // 重音
  if (chordCount > 0) {
    notices.push("重音 " + chordCount + "か所は、いちばん上の音で判定します");
  }

  // 判定から外す音（理由ごとに「○○ 3音」の形でつなげる）
  const excludedTexts = Object.keys(EXCLUDE_LABELS)
    .filter((reason) => excluded[reason] > 0)
    .map((reason) => EXCLUDE_LABELS[reason] + " " + excluded[reason] + "音");
  if (excludedTexts.length > 0) {
    notices.push("判定から外す音（灰色で表示します）：" + excludedTexts.join("、"));
  }

  // 途中で調号が変わるか（1小節目より後ろに、1小節目と違う調号の小節があるか）
  const firstSignature = keyAt(score, 0);
  const keyChangeCount = score.measures.filter((info, i) => i > 0 && info.key !== undefined && info.key !== firstSignature).length;
  if (keyChangeCount > 0) {
    notices.push("途中で調号が変わる所が " + keyChangeCount + "か所あります。純正律の計算は、ここで選んだ調で行います");
  }

  return { notices: notices, judgeableCount: judgeableCount };
}

/**
 * 保存する「読み込んだ楽譜」の形を作る関数
 * 選んだパートの小節だけを取り出す。id と読み込んだ日時は、保存するとき（addImportedScore）に付ける。
 * @param {object} score - 楽譜作成アプリの形の楽譜データ
 * @param {number} partIndex - 選んだパートの番号（0から）
 * @param {string} keyId - 選んだ調の id（例：'D-dur'）
 * @param {string} name - 名前
 * @returns {object} 保存する楽譜（このファイルの先頭の説明の形。id・importedAt はまだ無い）
 */
export function buildImportedScore(score, partIndex, keyId, name) {
  const part = score.parts[partIndex];
  return {
    name: name,
    title: score.title,
    partName: part.name,
    instrument: part.instrument,
    keyId: keyId,
    temperamentId: loadTemperamentId(),
    tempo: score.tempo,
    tempoText: score.tempoText ?? "",
    measures: score.measures,
    partMeasures: part.measures,
  };
}
