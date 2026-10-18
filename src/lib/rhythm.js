// リズムの判定のために、マイクの記録から「音の出だし」の時刻を見つけるファイル（ステップD）
// 読み込んだ楽譜の「通し」（ImportedRunPractice.svelte）で使う。
//
// 【マイクの記録の形】（演奏中に、1秒に約60回ためていくもの）
// { time: 2.31, frequency: 441.2, rms: 0.03 }
//   time      ：時刻表と同じ数え方の時刻（秒）
//   frequency ：その回に調べた高さ（Hz。なめらかにする前の値。音が出ていないときは null）
//   rms       ：その回の音量（0 に近いほど静か）
//
// 【見つけ方】
// ・前の音と高さが違うとき・前が休符のとき：「目標の高さになった最初の時刻」（2回続けて目標の高さなら、その1回目）
//   ただし、その少し前（0.15秒以内）に「音量が下がってまた上がった」所があれば、そちらを出だしにする
//   （高さは、前の音と新しい音が混ざっている間は目標の高さにならず、音量よりおそく変わるため。弓を返したときなど）
// ・前の音と同じ高さで、つながっているとき：「音量がいったん下がって、また上がった時刻」（弓を返して弾き直したところ）
// どちらも、お手本の始まりの少し前から、音の長さの7割（0.35秒まで）の間で探す。見つからなければ null。
// （ステップD-2：メトロノームのクリックの直後に、クリックの高さ（1000Hz・1500Hz）を拾った記録は、高さを「なし」として扱う。
//   1拍目のクリックは高い音なので、高さで見つけるときにも、クリックの音を拾ってしまうことがあったため。
//   クリックの直後でも、バイオリンの高さを拾えている記録は使う（拍の頭で弾き始めた出だしを見のがさないため））

// ===== 見つけ方の設定値 =====

// マイクの記録の時刻から差し引く「遅れ」（秒）
// 高さも音量も、少し前の音の波から計算するので、新しい音が半分くらい入ったところで変わる（0.085秒の波の半分 ≒ 0.04秒）。
// それに、マイクから音が届くまでの遅れを少し足した値
export const ONSET_LATENCY = 0.05;

// お手本の始まりの、何秒前から探すか（前の音が短いときは、前の音の長さの半分まで）
const SEARCH_BEFORE = 0.25;

// お手本の始まりの、何秒後まで探すか（その音の長さの7割まで）
const SEARCH_AFTER = 0.35;
const SEARCH_AFTER_RATIO = 0.7;

// 「目標の高さ」とみなす範囲（セント）。音程が少しずれていても、出だしは見つけたいので、広めにする
const PITCH_MATCH_CENTS = 70;

// 「目標の高さになった時刻」から、さかのぼって音量の上がり目を探す長さ（秒）
const LOOK_BACK = 0.15;

// 音量の上がり目が見つからないとき（スラーで高さが変わったときなど）に、「目標の高さになった時刻」から、さらに差し引く時間（秒）
// 高さは、前の音と新しい音が混ざっている間（約0.05秒）は目標の高さにならないため、そのぶん早めにする
const PITCH_EXTRA_LATENCY = 0.03;

// 音量が「いったん下がった」とみなす割合（下がる前の音量の 7割より小さくなったら）
const DIP_RATIO = 0.7;

// 音量が「また上がった」とみなす割合（下がった所から、そのあとのいちばん大きい音量までの、半分まで戻ったら）
const RISE_RATIO = 0.5;

// メトロノームのクリックの直後、音量の変化を数えない時間（秒）（クリックの音をマイクが拾うため）
const CLICK_IGNORE = 0.05;

// メトロノームのクリックの直後、クリックの高さを拾っていないか調べる時間（秒）（ステップD-2）
// クリックは 0.05秒鳴り、高さは 0.085秒ぶんの波から調べるので、鳴り終わっても少しの間はクリックの高さが出る。
// それに、スピーカーから音が出るまでの遅れを足して、長めにしてある
const CLICK_PITCH_WINDOW = 0.2;

// クリックの高さ（Hz）（audio.js の CLICK_FREQUENCY・ACCENT_CLICK_FREQUENCY と同じ値）（ステップD-2）
const CLICK_FREQUENCIES = [1000, 1500];

// クリックの高さとみなす範囲（セント）（ステップD-2）
const CLICK_MATCH_CENTS = 50;

/**
 * 2つの周波数が、何セント離れているかを返す関数（このファイルの中だけで使う）
 * @param {number} a - 周波数（Hz）
 * @param {number} b - 周波数（Hz）
 * @returns {number} 離れているセントの大きさ（プラスの数）
 */
function centsBetween(a, b) {
  return Math.abs(1200 * Math.log2(a / b));
}

/**
 * 1つの音の、出だしの時刻を見つける関数（ステップD）
 * @param {{time: number, frequency: number|null, rms: number}[]} frames - マイクの記録（時刻の順）
 * @param {object} item - 時刻表の音（start・end と、method（"pitch" か "volume"）が入っているもの）
 * @param {object|null} previous - 時刻表の1つ前の音（最初の音なら null）。探す範囲を決めるのに使う
 * @param {number} targetFrequency - 目標の高さ（Hz）
 * @param {number[]} clickTimes - メトロノームのクリックを鳴らした時刻（秒）の並び（鳴らしていなければ空）
 * @returns {number|null} 出だしの時刻（秒。時刻表と同じ数え方）。見つからないときは null
 */
export function findOnset(frames, item, previous, targetFrequency, clickTimes) {
  // 探す範囲
  const before = previous !== null ? Math.min(SEARCH_BEFORE, (previous.end - previous.start) * 0.5) : SEARCH_BEFORE;
  const after = Math.min(SEARCH_AFTER, (item.end - item.start) * SEARCH_AFTER_RATIO);
  const from = item.start - before;
  const to = item.start + after;

  // 範囲の中の記録（遅れのぶんを差し引いた時刻で見る）
  // （ステップD-2：クリックの高さを拾った記録は、高さを null（音なし）にしておく。
  //   クリックの直後かどうかは、遅れを差し引く前の時刻（frame.time）とクリックの時刻をそのまま比べる）
  const inRange = [];
  frames.forEach((frame) => {
    const time = frame.time - ONSET_LATENCY;
    if (time >= from && time <= to) {
      const frequency = isClickNoise(frame.time, frame.frequency, clickTimes) ? null : frame.frequency;
      inRange.push({ time: time, frequency: frequency, rms: frame.rms });
    }
  });
  if (inRange.length < 3) {
    return null;
  }

  if (item.method === "volume") {
    return findVolumeOnset(inRange, clickTimes);
  }
  return findPitchOnset(inRange, targetFrequency);
}

/**
 * マイクで拾った高さが、メトロノームのクリックの音かどうかを調べる関数（ステップD-2）
 * 「クリックを鳴らした直後（CLICK_PITCH_WINDOW 秒以内）」で、「高さがクリックの高さ（1000Hz・1500Hz）に近い」ときに true。
 * クリックの直後でも、バイオリンの高さを拾えているときは false（使ってよい）。
 * 音程の判定（ImportedRunPractice.svelte）でも使うので、ほかのファイルから使えるようにしてある（export）。
 * @param {number} time - マイクの記録の時刻（秒。時刻表と同じ数え方。遅れを差し引く前）
 * @param {number|null} frequency - 拾った高さ（Hz）。音が出ていないときは null
 * @param {number[]} clickTimes - クリックを鳴らした時刻（秒）の並び
 * @returns {boolean} クリックの音なら true
 */
export function isClickNoise(time, frequency, clickTimes) {
  if (frequency === null) {
    return false;
  }
  const afterClick = clickTimes.some((click) => time >= click && time < click + CLICK_PITCH_WINDOW);
  if (!afterClick) {
    return false;
  }
  return CLICK_FREQUENCIES.some((click) => centsBetween(frequency, click) <= CLICK_MATCH_CENTS);
}

/**
 * 「目標の高さになった最初の時刻」を見つける関数（このファイルの中だけで使う）（ステップD）
 * 2回続けて目標の高さだったとき、その1回目の時刻を出だしにする（たまたま1回だけ近い値が出たのを拾わないため）。
 * 範囲のいちばん最初から、もう目標の高さだったときは、範囲の最初の時刻（＝とても早く弾き始めた）にする。
 * @param {{time: number, frequency: number|null}[]} records - 範囲の中の記録
 * @param {number} targetFrequency - 目標の高さ（Hz）
 * @returns {number|null} 出だしの時刻（秒）
 */
function findPitchOnset(records, targetFrequency) {
  const matches = records.map((record) => record.frequency !== null && centsBetween(record.frequency, targetFrequency) <= PITCH_MATCH_CENTS);
  for (let k = 0; k + 1 < records.length; k++) {
    if (matches[k] && matches[k + 1]) {
      // 範囲のいちばん最初から目標の高さ：とても早く弾き始めた（範囲の最初の時刻）
      if (k === 0) {
        return records[0].time;
      }

      // 目標の高さになった時刻の少し前に、音量の上がり目があれば、そちらを出だしにする
      const matchTime = records[k].time;
      const nearby = records.filter((record) => record.time >= matchTime - LOOK_BACK && record.time <= matchTime);
      const rise = nearby.length >= 3 ? findVolumeOnset(nearby, []) : null;
      if (rise !== null && rise <= matchTime) {
        return rise;
      }

      // 上がり目がない（スラーで高さだけが変わったなど）：高さが混ざっていたぶん、少し早めにする
      return matchTime - PITCH_EXTRA_LATENCY;
    }
  }
  return null;
}

/**
 * 「音量がいったん下がって、また上がった時刻」を見つける関数（このファイルの中だけで使う）（ステップD）
 * 範囲の中で音量がいちばん小さい所を探し、その前より十分に下がっていれば、そのあと半分まで戻った時刻を出だしにする。
 * メトロノームのクリックの直後の記録は、音量の変化に使わない。
 * @param {{time: number, rms: number}[]} records - 範囲の中の記録
 * @param {number[]} clickTimes - メトロノームのクリックを鳴らした時刻（秒）
 * @returns {number|null} 出だしの時刻（秒）
 */
function findVolumeOnset(records, clickTimes) {
  // クリックの直後の記録を除く（記録の時刻は遅れを差し引いてあるので、クリックの時刻とそのまま比べる）
  const usable = records.filter((record) => !clickTimes.some((click) => record.time >= click && record.time < click + CLICK_IGNORE + ONSET_LATENCY));
  if (usable.length < 3) {
    return null;
  }

  // 音量がいちばん小さい所
  let lowest = 0;
  usable.forEach((record, k) => {
    if (record.rms < usable[lowest].rms) {
      lowest = k;
    }
  });

  // その前のいちばん大きい音量（下がる前の音量）と、そのあとのいちばん大きい音量
  const beforePeak = Math.max(...usable.slice(0, lowest + 1).map((record) => record.rms));
  const afterRecords = usable.slice(lowest);
  const afterPeak = Math.max(...afterRecords.map((record) => record.rms));

  // 十分に下がっていなければ、弾き直していない（見つからない）
  if (usable[lowest].rms > beforePeak * DIP_RATIO) {
    return null;
  }

  // 下がった所から、そのあとのいちばん大きい音量の半分まで戻った最初の時刻
  const threshold = usable[lowest].rms + (afterPeak - usable[lowest].rms) * RISE_RATIO;
  const rise = afterRecords.find((record) => record.rms >= threshold && record.rms > usable[lowest].rms);
  return rise !== undefined ? rise.time : null;
}
