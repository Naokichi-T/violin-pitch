// 読み込んだ楽譜の「お手本の時刻表」を作るファイル（ステップC-1）
// 「通し」で、判定する音ごとに「何秒から何秒まで鳴るか」を決める。
// 時刻の計算は、楽譜作成アプリ（string-score）の再生の計算（playback.js の buildEvents）をそのまま使うので、
// テンポの変化・rit.・accel.・a tempo・フェルマータ・カエスーラ・くり返し・アウフタクトが、再生とぴったり同じになる。
//
// 【時刻表の形】
// {
//   items: [                       … 判定する音の並び（imported.js の buildTargets と同じ順番・同じ数）
//     {
//       note:      { step, accidental, octave }  … 目標の音（音程チェックアプリの音の形）
//       positions: [{ measure, note }, ...]      … 五線譜の音符の場所（タイでつながった音符は全部）
//       start:     1.5                           … 鳴り始める時刻（秒。曲の頭（区間の頭）を 0 とする）
//       end:       2.25                          … 鳴り終わる時刻（秒。次の音の始まりか、休符の始まり）
//       judge:     true                          … 判定するか（短すぎる音は false）
//     }
//   ],
//   clicks: [{ time, strong }, ...]  … 拍の頭の時刻（秒）と、1拍目かどうか（カウントとメトロノームに使う）
//   beatSeconds: 0.75                … 最初の音のあたりの、1拍の長さ（秒）（カウントの間に使う）
// }

// 楽譜作成アプリの再生の計算（鳴らす音の一覧・1ティックが何秒か・1拍の長さ）を読み込む（コピーしたもの）
import { buildEvents, secondsPerTick, beatTicks } from "#lib/musicxml/playback.js";

// 楽譜作成アプリの、拍子とテンポを調べる関数を読み込む（コピーしたもの）
import { timeAt, tempoAt } from "#lib/musicxml/model.js";

// 読み込んだ楽譜を五線譜（楽譜作成アプリの形）に直す関数と、判定する音の並びを作る関数を読み込む
import { toRenderScore, buildTargets } from "#lib/imported.js";

// ===== 判定に関する設定値 =====

// これより短い音は判定しない（秒）
// マイクで調べる高さは、直近 0.2秒くらいの中央値なので、これより短い音は高さがはっきり取れないため
export const MIN_JUDGE_SECONDS = 0.2;

// 1つの音の、どこから判定に使いはじめるか（0.4 なら、頭の4割をよけて、後ろの6割で判定する）
// 弾き始めは音程が揺れやすく、前の音の残りも拾いやすいので、頭のほうは使わない
export const JUDGE_START_RATIO = 0.4;

/**
 * テンポを変えた楽譜データ（楽譜作成アプリの形）を作る関数（このファイルの中だけで使う）
 * 1小節目のテンポを tempo にして、途中のテンポ変更も同じ割合で変える
 * （例：楽譜が ♩＝80 で途中に ♩＝60 があり、tempo を 120 にした → 途中は ♩＝90）。
 * rit.・accel. は「何割の速さにするか」で決まっているので、そのままで同じ割合になる。
 * @param {object} record - 読み込んだ楽譜
 * @param {number} tempo - 1小節目のテンポ（♩＝○○）
 * @returns {object} 楽譜作成アプリの形の楽譜データ
 */
function scaledScore(record, tempo) {
  const score = toRenderScore(record);
  const rate = tempo / record.tempo; // テンポを何倍にするか
  return {
    ...score,
    tempo: tempo,
    // テンポ変更のある小節だけ、同じ割合で変える（それ以外の小節はそのまま）
    measures: score.measures.map((info) => (info.tempo !== undefined ? { ...info, tempo: info.tempo * rate } : info)),
  };
}

/**
 * お手本の時刻表を作る関数（ステップC-1）
 * @param {object} record - 読み込んだ楽譜
 * @param {number} tempo - 1小節目のテンポ（♩＝○○。「通し」で −＋ を押して変えたもの）
 * @param {boolean} expandRepeats - くり返しを展開するなら true、書いてある順に1回ずつなら false
 *                                  （buildTargets と同じ値を渡すこと。番号がそろうように）
 * @returns {object} 時刻表（このファイルの先頭の説明の形）
 */
export function buildTimeline(record, tempo, expandRepeats) {
  const score = scaledScore(record, tempo);

  // 鳴らす音の一覧を作る（楽譜作成アプリの再生と同じ計算）
  //   くり返しを展開する：1小節目から、くり返しをたどる
  //   展開しない：1小節目から最後の小節まで、まっすぐ並べる（buildEvents は、終わりの小節を渡すと、くり返しをたどらない）
  const lastMeasure = record.partMeasures.length - 1;
  const result = expandRepeats ? buildEvents(score, 0, {}) : buildEvents(score, 0, {}, lastMeasure);

  // 1ティックが何秒か（buildEvents の時刻は、1小節目のテンポで数えたティックになっている）
  const tickSeconds = secondsPerTick(score.tempo);

  // 判定する音の並び（buildEvents と同じ順に小節をたどったもの）
  const targets = buildTargets(record, expandRepeats);

  // 音符ごとの鳴る時間（highlights）を前から順に見て、判定する音の並びに当てはめる
  // highlights は、鳴らす順に、音符1つ（タイの後ろの音符も1つずつ）ごとに入っている。休符は入っていない
  // 判定から外す音（灰色の音）の音符は、判定する音の並びにないので、当てはまらずに飛ばされる
  const starts = new Array(targets.length).fill(null); // 判定する音ごとの、鳴り始める時刻（ティック）
  const ends = new Array(targets.length).fill(null); // 判定する音ごとの、鳴り終わる時刻（ティック）
  let k = 0; // 今、当てはめようとしている判定する音の番号
  let p = 0; // その音の positions の、何番目の音符を待っているか
  result.highlights.forEach((h) => {
    if (k >= targets.length) {
      return;
    }
    const expected = targets[k].positions[p];
    if (h.measure !== expected.measure || h.note !== expected.note) {
      return; // 判定する音ではない音符（灰色の音など）
    }
    if (p === 0) {
      starts[k] = h.startTick; // 1つ目の音符の始まりが、この音の始まり
    }
    ends[k] = h.endTick; // タイでつながった最後の音符の終わりが、この音の終わり
    p += 1;
    // この音の音符を全部当てはめたら、次の音へ
    if (p === targets[k].positions.length) {
      k += 1;
      p = 0;
    }
  });

  // 秒に直して、時刻表の形にする
  const items = targets.map((target, index) => {
    const start = (starts[index] ?? 0) * tickSeconds;
    const end = (ends[index] ?? starts[index] ?? 0) * tickSeconds;
    return {
      note: target.note,
      positions: target.positions,
      start: start,
      end: end,
      judge: end - start >= MIN_JUDGE_SECONDS, // 短すぎる音は判定しない
    };
  });

  // 拍の頭の時刻（秒）
  const clicks = result.clicks.map((click) => ({ time: click.startTick * tickSeconds, strong: click.strong }));

  return { items: items, clicks: clicks, beatSeconds: beatSecondsAt(score, items, tickSeconds) };
}

/**
 * 最初の音のあたりの、1拍の長さ（秒）を求める関数（このファイルの中だけで使う）
 * カウント（前打ち）の間に使う。拍子の拍の長さ（6/8 なら付点4分音符）と、その小節のテンポから決める。
 * （rit. の途中から始めるときなどは、少しずれることがあるが、カウントには十分）
 * @param {object} score - テンポを変えた楽譜データ
 * @param {object[]} items - 時刻表の音の並び
 * @param {number} tickSeconds - 1ティックが何秒か
 * @returns {number} 1拍の長さ（秒）
 */
function beatSecondsAt(score, items, tickSeconds) {
  const measure = items.length > 0 ? items[0].positions[0].measure : 0;
  const beat = beatTicks(timeAt(score, measure)); // 1拍の長さ（ティック。その小節のテンポで数えたもの）
  const rate = score.tempo / tempoAt(score, measure).tempo; // その小節のテンポが、1小節目の何分の1か
  return beat * tickSeconds * rate;
}

/**
 * 時刻表から、区間の部分だけを取り出す関数（ステップC-1）
 * 時刻は、区間の最初の音の、直前の拍の頭が 0 になるようにずらす
 * （カウントのあと、拍の頭から始まるように。アウフタクトや、拍の途中から始まる区間のため）。
 * 楽譜の全体を練習するときも、最初から最後までを区間として、この関数を通す。
 * @param {object} timeline - 時刻表（buildTimeline で作ったもの）
 * @param {number} startIndex - 区間の最初の音の番号（0から）
 * @param {number} endIndex - 区間の最後の音の番号（0から。この音も入れる）
 * @returns {object} 区間の部分だけの時刻表（同じ形）
 */
export function sliceTimeline(timeline, startIndex, endIndex) {
  const items = timeline.items.slice(startIndex, endIndex + 1);
  const firstStart = items[0].start;
  const lastEnd = items[items.length - 1].end;

  // 区間の最初の音の、直前（同じ時刻も含む）の拍の頭。なければ、最初の音の始まり
  const before = timeline.clicks.filter((click) => click.time <= firstStart + 1e-6);
  const anchor = before.length > 0 ? before[before.length - 1].time : firstStart;

  // 区間の頭の1拍の長さ（秒）：anchor とその次の拍の頭の間（次の拍がなければ、曲の頭の1拍の長さ）
  const next = timeline.clicks.find((click) => click.time > anchor + 1e-6);
  const beatSeconds = next !== undefined ? next.time - anchor : timeline.beatSeconds;

  return {
    // 時刻を、anchor が 0 になるようにずらす
    items: items.map((item) => ({ ...item, start: item.start - anchor, end: item.end - anchor })),
    // 区間の中の拍の頭だけを残して、同じようにずらす
    clicks: timeline.clicks.filter((click) => click.time >= anchor - 1e-6 && click.time < lastEnd - 1e-6).map((click) => ({ ...click, time: click.time - anchor })),
    beatSeconds: beatSeconds,
  };
}
