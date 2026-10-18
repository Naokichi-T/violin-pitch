<script>
  // 読み込んだ楽譜の「通し」モードの練習の部品（ステップC-1）
  // 手入力の楽譜の「通し」（RunPractice.svelte）をもとにして、
  // 「1拍ごとに1音」ではなく、「お手本の時刻表（importedTimeline.js）の時間」で目標の音が進むようにしたもの。
  // 音の長さ・テンポの変化・rit.・フェルマータ・くり返しは、楽譜作成アプリの再生と同じ時間で進む。
  // 判定は音程だけ（リズムの判定はステップDで足す）。
  //
  // 【演奏中の五線譜】
  // 色が変わるたびに五線譜を全部描き直すと、速い曲やスマホでは間に合わないので、
  // 演奏中は五線譜の上の「重ねる層」にだけ描く（今の音のオレンジの帯と、判定した音の下の小さな印）。
  // 最後まで弾き終わったら、五線譜を1回だけ描き直して、音符そのものを結果の色にする。

  // onMount：この部品が画面に表示されたときに1回だけ処理をするための仕組み
  // onDestroy：この部品が画面から消えるときに後片付けをするための仕組み
  // untrack：値を「最初の1回だけ」読むための仕組み（下の tempo で使う）
  import { onMount, onDestroy, untrack } from "svelte";

  // 音のデータを表示用の文字にする関数を読み込む
  import { noteToText } from "#lib/score.js";

  // セントの数字を「+3」「−8」のような文字にする関数を読み込む
  import { formatCents } from "#lib/note.js";

  // 選んだ音律での、音の周波数を計算する関数と、開放弦の周波数を返す関数を読み込む
  import { getFrequency, getOpenStringFrequency } from "#lib/tuning.js";

  // 1音ごとの点数と、全体の点数を計算する関数を読み込む（今の「通し」と同じ）
  import { centsToPoints, getTotalScore } from "#lib/scoring.js";

  // マイクで音の高さを調べはじめる関数と、止める関数を読み込む
  import { startMicrophone, stopMicrophone } from "#lib/microphone.js";

  // メトロノームの音を鳴らす関数と、合図の音を鳴らす関数を読み込む
  import { playClick, playChime } from "#lib/audio.js";

  // カウントの拍の数を、ブラウザに保存する関数と読み込む関数を読み込む（今の「通し」と共通の設定）
  import { loadCountInBeats, saveCountInBeats } from "#lib/settings.js";

  // 1つの音の、どこから判定に使いはじめるか（頭の4割をよける）を読み込む
  import { JUDGE_START_RATIO } from "#lib/importedTimeline.js";

  // 小節を「3小節目」などの文字にする関数を読み込む（楽譜作成アプリからコピーしたもの）
  import { measureName } from "#lib/musicxml/model.js";

  // 読み込んだ楽譜の五線譜を描く部品を読み込む
  import ImportedStaff from "#lib/ImportedStaff.svelte";

  // この部品を使う側（読み込んだ楽譜の練習ページ）から受け取る値
  // score         ：五線譜に描く形の楽譜（imported.js の toRenderScore で作ったもの）
  // baseColors    ：判定から外す音を灰色にするための、音符ごとの色の表
  // getTimeline   ：テンポを渡すと、練習する範囲のお手本の時刻表を返す関数（importedTimeline.js の形）
  // currentKey    ：楽譜の調のデータ
  // initialTempo  ：最初のテンポ（♩＝○○）
  // temperamentId ：音律の id
  // tolerance     ：OK とする範囲（セント）
  // allowOpenString：開放弦の高さで弾いた音も OK にするかどうか
  // repeatEnabled ：最後の音まで進んだら、最初の音に戻ってくり返すかどうか
  // staffHeight   ：五線譜の枠の高さの上限（CSS の書き方）
  // ontempochange ：テンポを変えたときに呼ぶ関数（新しいテンポを渡す）
  // onfinish      ：最後まで進んで点数が出たときに呼ぶ関数（その回の音程の点数を渡す）
  let { score, baseColors, getTimeline, currentKey, initialTempo, temperamentId, tolerance, allowOpenString, repeatEnabled, staffHeight, ontempochange = () => {}, onfinish = () => {} } = $props();

  // ===== テンポとカウントに関する設定値 =====

  // テンポ（1分間の拍の数）の最小・最大と、ボタン1回で変わる量
  // （読み込んだ楽譜は、もとのテンポがいろいろなので、今の「通し」（40〜200）より広くしておく）
  const TEMPO_MIN = 30;
  const TEMPO_MAX = 240;
  const TEMPO_STEP = 5;

  // カウントの拍の数の最小・最大と、最初の値（今の「通し」と同じ）
  const COUNT_IN_MIN = 5;
  const COUNT_IN_MAX = 30;
  const COUNT_IN_DEFAULT = 10;

  // くり返しの2回目からの、カウントの拍の数（今の「通し」と同じ）
  const REPEAT_COUNT_IN_BEATS = 4;

  // ===== 判定に関する設定値 =====

  // 判定に必要な、音の高さのデータの数。これより少ないときは「音なし」にする（今の「通し」と同じ）
  const MIN_SAMPLES = 3;

  // マイクの高さの「遅れ」（秒）
  // マイクで調べる高さは、少し前の音の波（4096個ぶん）から求め、さらに直近12回の中央値にしているので、
  // 弾く音を変えてから、調べた高さが変わるまでに 0.2秒くらいかかる（調べてみたら 0.21秒だった）。
  // 短い音（8分音符など）では、判定の時間の頭のほうに、前の音の高さが混ざってしまうので、
  // マイクの高さは「この秒数だけ前に弾いた音の高さ」として扱う（判定も、音が終わってからこの秒数だけ待ってから行う）。
  // 画面の「今の音」は、遅らせずに、時刻表どおりに進む。
  const DETECTION_DELAY = 0.15;

  // 結果の種類ごとの、表示する文字（今の「通し」と同じ。skip は判定しなかった短い音）
  const STATUS_LABELS = {
    ok: "OK",
    high: "高い",
    low: "低い",
    none: "音なし",
    skip: "判定しない（短い音）",
  };

  // 結果の種類ごとの、色と、音符の下に出す印（今の「通し」の五線譜と同じ色）
  const STATUS_STYLES = {
    ok: { color: "#2e7d32", mark: "●" },
    high: { color: "#c62828", mark: "↑" },
    low: { color: "#1565c0", mark: "↓" },
    none: { color: "#9e9e9e", mark: "−" },
  };

  // 判定しない音（短すぎる音）の色（灰色）
  const SKIP_COLOR = "#9e9e9e";

  // 演奏中の今の音の帯の色（今の「通し」の「目標の音」と同じオレンジ）
  const CURRENT_COLOR = "#e65100";

  // 結果を見るためにタップした音の帯の色（青）
  const SELECTED_COLOR = "#1976d2";

  // 最後まで弾けたときに鳴らす、終わりの合図の音（今の「通し」と同じ）
  const FINISH_CHIME_FREQUENCIES = [1768, 2652];

  // ===== 画面に表示する値（$state を付けると、値が変わったとき画面も自動で更新される） =====

  // テンポ（♩＝○○）。最初は、楽譜のテンポ（練習ページで覚えているテンポ）
  let tempo = $state(untrack(() => clampTempo(initialTempo)));

  // カウントの拍の数（設定の「−」「＋」で変えられる）
  let countInBeats = $state(COUNT_IN_DEFAULT);

  // 今の状態（今の「通し」と同じ）：'idle'・'preparing'・'countIn'・'playing'・'finished'
  let phase = $state("idle");

  // カウントの残りの拍の数
  let countInRemaining = $state(0);

  // 今鳴っているはずの音が、時刻表の何番目か（0から）。休符の間や、演奏中でないときは null
  let currentIndex = $state(null);

  // 1音ごとの判定の結果（時刻表と同じ順番。まだ判定していない音は undefined）
  // 1つの結果は { status, cents, openString }（status は 'ok'・'high'・'low'・'none'・'skip'）
  let results = $state([]);

  // くり返しの、回ごとの点数
  let roundScores = $state([]);

  // 結果を見るためにタップした音が、時刻表の何番目か。選んでいないときは null
  let selectedIndex = $state(null);

  // エラーメッセージ（マイクが使えなかったときなど）
  let errorMessage = $state("");

  // 練習する範囲のお手本の時刻表（テンポが変わるたびに作り直す）
  // $derived を付けると、tempo が変わるたびに自動で計算し直される
  let timeline = $derived(getTimeline(tempo));

  // ===== 進行のために覚えておく値（画面には表示しないので $state は付けない） =====

  // 次の画面の書き換えのための予約の番号（requestAnimationFrame の番号。やめるときに取り消すため）
  let frameId = null;

  // 今の回を始めた時刻（ページを開いてからのミリ秒）
  let startTime = 0;

  // 今の回の、カウントの拍の数と、カウントの長さ（秒）
  let roundCountInBeats = 0;
  let countInSeconds = 0;

  // 今の回で、カウントのクリックをいくつ鳴らしたか
  let clickedCount = 0;

  // 演奏を始めたときの時刻表（演奏中にテンポは変えられないが、念のため、始めたときのものを使い続ける）
  let runTimeline = null;

  // 次に判定する音の番号
  let nextJudgeIndex = 0;

  // 今の音を探すときの、手がかりの番号（前から順に進むので、毎回最初から探さなくてよいように）
  let cursor = 0;

  // 音ごとに集めた、マイクの音の高さ（Hz）の配列の配列
  let samples = [];

  // 今の回で、最初の音が始まったか（くり返しの2回目からは、最初の音が始まったときに前の回の結果を消す）
  let roundStarted = false;

  // ===== 計算で決まる値 =====

  // 動いている最中かどうか
  let isRunning = $derived(phase === "preparing" || phase === "countIn" || phase === "playing");

  // 判定した結果（判定しない短い音を除く）のずれ（セント）の並び
  let judgedCents = $derived(results.filter((result) => result !== undefined && result.status !== "skip").map((result) => result.cents));

  // 全体の点数（判定した音の点数の平均）
  let totalScore = $derived(getTotalScore(judgedCents));

  // 結果の種類ごとの数
  let statusCounts = $derived.by(() => {
    const counts = { ok: 0, high: 0, low: 0, none: 0, skip: 0 };
    for (const result of results) {
      if (result !== undefined) {
        counts[result.status] += 1;
      }
    }
    return counts;
  });

  // 判定しない短い音の数（今のテンポの時刻表で）
  let skipCount = $derived(timeline.items.filter((item) => !item.judge).length);

  // 五線譜の音符の色（演奏中は変えない。描き直しを避けるため）
  //   ・終わったあと：判定の結果の色（OK 緑・高い 赤・低い 青・音なし 灰色・判定しない 灰色）
  //   ・それ以外：灰色の音（判定から外す音）＋ 今のテンポで短すぎる音
  let staffColors = $derived.by(() => {
    const colors = new Map(baseColors);
    timeline.items.forEach((item, index) => {
      let color = null;
      if (phase === "finished" && results[index] !== undefined) {
        color = results[index].status === "skip" ? SKIP_COLOR : STATUS_STYLES[results[index].status].color;
      } else if (!item.judge) {
        color = SKIP_COLOR;
      }
      if (color !== null) {
        item.positions.forEach((p) => colors.set("0-" + p.measure + "-" + p.note, color));
      }
    });
    return colors;
  });

  // 重ねる層の帯：演奏中は今の音（オレンジ）、結果を見るために音をタップしたときはその音（青）
  let overlayBands = $derived.by(() => {
    if (currentIndex !== null && (phase === "playing" || phase === "countIn")) {
      return [{ positions: timeline.items[currentIndex].positions, color: CURRENT_COLOR }];
    }
    if (selectedIndex !== null && !isRunning) {
      return [{ positions: timeline.items[selectedIndex].positions, color: SELECTED_COLOR }];
    }
    return [];
  });

  // 重ねる層の印：判定した音の下に、結果の印（●・↑・↓・−）を出す（判定しない短い音には出さない）
  let overlayMarks = $derived.by(() => {
    const marks = [];
    results.forEach((result, index) => {
      if (result === undefined || result.status === "skip") {
        return;
      }
      const style = STATUS_STYLES[result.status];
      marks.push({ position: timeline.items[index].positions[0], color: style.color, text: style.mark });
    });
    return marks;
  });

  // 次に判定する音の番号（自動スクロールのために、画面に伝える用。休符の間に次の音の段を見せるため）
  let nextJudgeIndexState = $state(0);

  // 自動スクロールで見せる音符：演奏中は今の音（休符の間は、次の音）
  let focusPosition = $derived.by(() => {
    if (!isRunning) {
      return null;
    }
    const index = currentIndex ?? Math.min(nextJudgeIndexState, timeline.items.length - 1);
    return timeline.items[index]?.positions[0] ?? null;
  });

  // この部品が画面に表示されたときに、前回保存したカウントの拍の数を読み込む
  onMount(() => {
    const saved = loadCountInBeats();
    if (saved !== null) {
      countInBeats = clampCountIn(saved);
    }
  });

  // この部品が画面から消えるときに、進行を止める
  onDestroy(() => {
    stop();
  });

  /**
   * テンポを、最小と最大の間に収める関数
   * @param {number} value - テンポ
   * @returns {number} 最小と最大の間に収めたテンポ（整数）
   */
  function clampTempo(value) {
    return Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, Math.round(value)));
  }

  /**
   * テンポを変える関数（「−」「＋」ボタン）
   * @param {number} amount - 変える量
   */
  function changeTempo(amount) {
    tempo = clampTempo(tempo + amount);
    // 結果を見るために選んでいた音は、時刻表が変わるので選ぶのをやめる
    selectedIndex = null;
    ontempochange(tempo);
  }

  /**
   * カウントの拍の数を、最小と最大の間に収める関数
   * @param {number} value - カウントの拍の数
   * @returns {number} 最小と最大の間に収めた値
   */
  function clampCountIn(value) {
    return Math.min(COUNT_IN_MAX, Math.max(COUNT_IN_MIN, value));
  }

  /**
   * カウントの拍の数を変える関数（設定の「−」「＋」ボタン）。変えた値はブラウザに保存する（今の「通し」と共通）
   * @param {number} amount - 変える量
   */
  function changeCountIn(amount) {
    countInBeats = clampCountIn(countInBeats + amount);
    saveCountInBeats(countInBeats);
  }

  /**
   * 五線譜の音符がタップされたときに、その音の結果を見られるようにする関数
   * 演奏中は何もしない。まだ判定していない音・判定しない音符は選べない。同じ音をもう一度タップすると、選ぶのをやめる。
   * @param {{measure: number, note: number}} position - タップした音符の場所
   */
  function selectNote(position) {
    if (isRunning) {
      return;
    }
    // タップした音符を含む音のうち、結果があるもの（くり返しで2回あるときは、選んでいる音より後ろのもの → なければ最初のもの）
    const indexes = [];
    timeline.items.forEach((item, index) => {
      const hit = item.positions.some((p) => p.measure === position.measure && p.note === position.note);
      if (hit && results[index] !== undefined) {
        indexes.push(index);
      }
    });
    if (indexes.length === 0) {
      return;
    }
    const after = indexes.find((index) => selectedIndex !== null && index > selectedIndex);
    const next = after ?? indexes[0];
    selectedIndex = next === selectedIndex ? null : next;
  }

  /**
   * 「通し」の練習を始める関数（「始める」ボタン）
   * マイクを開始してからカウントを鳴らし、そのあと時刻表どおりに目標の音を進める。
   */
  async function start() {
    errorMessage = "";
    results = [];
    roundScores = [];
    selectedIndex = null;
    phase = "preparing";

    try {
      // マイクを開始する。音の高さが分かるたびに、handlePitch が呼ばれる
      await startMicrophone(handlePitch);
    } catch (error) {
      errorMessage = error.message;
      phase = "idle";
      return;
    }

    // マイクの準備を待っている間に「やめる」が押されていたら、マイクを止めて終わる
    if (phase !== "preparing") {
      stopMicrophone();
      return;
    }

    // 演奏に使う時刻表を決めて、1回目を始める（1回目のカウントは、設定の拍の数）
    runTimeline = timeline;
    startRound(countInBeats);
  }

  /**
   * 1回分（くり返しのときは、その回）を始める関数
   * @param {number} beats - この回のカウントの拍の数
   */
  function startRound(beats) {
    roundCountInBeats = beats;
    countInSeconds = beats * runTimeline.beatSeconds;
    clickedCount = 0;
    nextJudgeIndex = 0;
    nextJudgeIndexState = 0;
    cursor = 0;
    samples = runTimeline.items.map(() => []);
    roundStarted = false;
    currentIndex = null;
    startTime = performance.now();
    phase = "countIn";
    countInRemaining = beats;

    // 画面の書き換えのたびに進み具合を調べる（1秒に約60回）
    frameId = requestAnimationFrame(update);
  }

  /**
   * 今が、時刻表の何秒目かを返す関数（カウントの間はマイナス）
   * @returns {number} 秒
   */
  function musicTime() {
    return (performance.now() - startTime) / 1000 - countInSeconds;
  }

  /**
   * 画面の書き換えのたびに呼ばれて、カウント・今の音・判定・終わりを進める関数
   */
  function update() {
    const items = runTimeline.items;
    const t = musicTime();

    if (t < 0) {
      // ----- カウント中：拍の頭ごとにクリックを鳴らす -----
      const elapsed = t + countInSeconds; // 回を始めてからの秒
      const beat = Math.floor(elapsed / runTimeline.beatSeconds); // 今、何拍目か（0から）
      if (beat >= clickedCount && beat < roundCountInBeats) {
        playClick();
        clickedCount = beat + 1;
      }
      countInRemaining = roundCountInBeats - beat;
    } else {
      // ----- 演奏中 -----
      if (!roundStarted) {
        // この回の最初の音が始まった：前の回の結果を消す（くり返しの2回目から。前の回の結果は、カウントの間に見直せる）
        roundStarted = true;
        results = [];
        selectedIndex = null;
        phase = "playing";
      }

      // 終わった音を、順に判定する（マイクの高さの遅れのぶん、音が終わってから少し待つ）
      while (nextJudgeIndex < items.length && t >= items[nextJudgeIndex].end + DETECTION_DELAY) {
        judgeNote(nextJudgeIndex);
        nextJudgeIndex += 1;
      }
      nextJudgeIndexState = nextJudgeIndex;

      // 今鳴っているはずの音を探す（終わった音を飛ばして、始まっていれば今の音。始まっていなければ休符の間）
      while (cursor < items.length && t >= items[cursor].end) {
        cursor += 1;
      }
      const nowIndex = cursor < items.length && t >= items[cursor].start ? cursor : null;
      if (nowIndex !== currentIndex) {
        currentIndex = nowIndex;
      }

      // 最後の音が終わった
      if (nextJudgeIndex >= items.length) {
        finishRound();
        return;
      }
    }

    // 次の画面の書き換えで、もう一度調べる
    frameId = requestAnimationFrame(update);
  }

  /**
   * 最後の音が終わったときの処理をする関数
   * 点数を出して、くり返すときは短いカウントから次の回を始める。
   */
  function finishRound() {
    playChime(FINISH_CHIME_FREQUENCIES);
    currentIndex = null;

    // この回の点数を、練習ページに伝える（最高点を記録するため）
    onfinish(totalScore);

    // くり返しているとき（または、途中でくり返しをやめたとき）は、この回の点数を記録する
    if (repeatEnabled || roundScores.length > 0) {
      roundScores.push(totalScore);
    }

    if (repeatEnabled) {
      // くり返すとき：短いカウントから次の回を始める
      startRound(REPEAT_COUNT_IN_BEATS);
      return;
    }

    // くり返さないとき：マイクを止めて終わりにする
    stopMicrophone();
    frameId = null;
    phase = "finished";
  }

  /**
   * マイクが音の高さを調べるたびに呼ばれる関数
   * 演奏中に、それぞれの音の「後ろ6割」の時間に入っていれば、その音の高さとして集めておく。
   * マイクの高さは遅れて届くので、DETECTION_DELAY だけ前の時刻の高さとして扱う。
   * @param {number|null} frequency - 検出した周波数（Hz）。音が出ていないときは null
   */
  function handlePitch(frequency) {
    if (phase !== "playing" || frequency === null || runTimeline === null) {
      return;
    }
    const items = runTimeline.items;
    const t = musicTime() - DETECTION_DELAY; // この高さを弾いていた時刻（遅れのぶん前）

    // まだ判定していない音のうち、もう始まっている音を見る（ふつうは今の音の1つだけ）
    for (let index = nextJudgeIndex; index < items.length && items[index].start <= t; index++) {
      const item = items[index];
      const judgeFrom = item.start + (item.end - item.start) * JUDGE_START_RATIO;
      if (t >= judgeFrom && t < item.end) {
        samples[index].push(frequency);
      }
    }
  }

  /**
   * 数字の並びの「真ん中の値」（中央値）を求める関数（今の「通し」と同じ）
   * @param {number[]} values - 数字の配列（1つ以上入っていること）
   * @returns {number} 真ん中の値
   */
  function getMedian(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 1) {
      return sorted[middle];
    }
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  /**
   * 1つの音の判定をして、結果を記録する関数（今の「通し」の judgeNote と同じ決め方）
   * @param {number} index - 時刻表の何番目の音か
   */
  function judgeNote(index) {
    const item = runTimeline.items[index];

    // 短すぎる音は判定しない
    if (!item.judge) {
      results[index] = { status: "skip", cents: null };
      return;
    }

    // 集めた音の高さが少なすぎるときは「音なし」
    if (samples[index].length < MIN_SAMPLES) {
      results[index] = { status: "none", cents: null };
      return;
    }

    // 目標の音の周波数（選んだ音律で計算する）と、弾いた音の高さ（集めた値の真ん中の値）
    const targetFrequency = getFrequency(item.note, currentKey, temperamentId);
    const playedFrequency = getMedian(samples[index]);

    // 目標の音とのずれ（セント）。プラスなら高い、マイナスなら低い
    let cents = 1200 * Math.log2(playedFrequency / targetFrequency);
    let usedOpenString = false;

    // 「開放弦の高さで弾いた音もOKにする」とき：開放弦の高さとも比べて、近いほうを使う
    if (allowOpenString) {
      const openFrequency = getOpenStringFrequency(item.note);
      if (openFrequency !== null) {
        const openCents = 1200 * Math.log2(playedFrequency / openFrequency);
        if (Math.abs(openCents) < Math.abs(cents)) {
          cents = openCents;
          usedOpenString = true;
        }
      }
    }

    // ずれが範囲内なら OK、範囲より上なら「高い」、下なら「低い」
    let status = "ok";
    if (cents > tolerance) {
      status = "high";
    } else if (cents < -tolerance) {
      status = "low";
    }

    results[index] = { status: status, cents: cents, openString: usedOpenString };
  }

  /**
   * 「通し」の練習を途中でやめる関数（「やめる」ボタンと、部品が消えるとき）
   * そこまでの結果は画面に残す（次に始めるときに消える）。
   */
  function stop() {
    if (frameId !== null) {
      cancelAnimationFrame(frameId);
      frameId = null;
    }
    stopMicrophone();
    phase = "idle";
    currentIndex = null;
  }
</script>

<!-- 五線譜：演奏中は、重ねる層に今の音の帯と結果の印を描く。終わったら、音符そのものを結果の色にする -->
<ImportedStaff {score} noteColors={staffColors} {overlayBands} {overlayMarks} focus={focusPosition} maxHeight={staffHeight} onselect={selectNote} />

<!-- 今の状態の表示 -->
<div class="status-area">
  {#if phase === "preparing"}
    <p class="status-caption">　</p>
    <p class="status-main idle">マイクの準備中</p>
  {:else if phase === "countIn"}
    <p class="status-caption">カウント</p>
    <p class="status-main count">{countInRemaining}</p>
  {:else if phase === "playing"}
    <p class="status-caption">
      {#if currentIndex !== null}
        目標の音（{currentIndex + 1} / {timeline.items.length}）
      {:else}
        休み
      {/if}
      {#if repeatEnabled}
        ・くり返し {roundScores.length + 1}回目
      {/if}
    </p>
    <!-- 休符の間は「−」を出す -->
    <p class="status-main">{currentIndex !== null ? noteToText(timeline.items[currentIndex].note) : "−"}</p>
  {:else if phase === "finished"}
    <p class="status-caption">点数（音程）</p>
    <p class="status-main finished">{totalScore} 点</p>
    <p class="status-caption">
      OK {statusCounts.ok}　高い {statusCounts.high}　低い {statusCounts.low}　音なし {statusCounts.none}
      {#if statusCounts.skip > 0}
        　判定しない {statusCounts.skip}
      {/if}
    </p>
  {:else}
    <p class="status-caption">「始める」を押すと、カウントが{countInBeats}拍鳴ります</p>
    <p class="status-main idle">♩＝{tempo}</p>
    <!-- 今のテンポで短すぎて判定しない音があるときは、その数を知らせる -->
    {#if skipCount > 0}
      <p class="status-caption">このテンポでは、短い音 {skipCount}音は判定しません（灰色）</p>
    {/if}
  {/if}
</div>

<!-- タップして選んだ音の結果（演奏していないときだけ） -->
{#if selectedIndex !== null && results[selectedIndex] !== undefined && !isRunning}
  {@const item = timeline.items[selectedIndex]}
  {@const result = results[selectedIndex]}
  <p class="selected-result {result.status}">
    {measureName(score, item.positions[0].measure)}・{noteToText(item.note)}：{STATUS_LABELS[result.status]}
    {#if result.cents !== null}
      {formatCents(result.cents)}セント・{centsToPoints(result.cents)}点
    {/if}
    {#if result.openString === true}
      （開放弦）
    {/if}
  </p>
{:else if phase === "finished"}
  <p class="hint">音符をタップすると、その音の結果が見られます</p>
{/if}

<!-- くり返しの、回ごとの点数 -->
{#if roundScores.length > 0}
  <ul class="round-list">
    {#each roundScores as roundScore, index}
      <li class="round">{index + 1}回目 <strong>{roundScore}点</strong></li>
    {/each}
  </ul>
{/if}

<!-- エラーメッセージ -->
{#if errorMessage !== ""}
  <p class="error">{errorMessage}</p>
{/if}

<!-- テンポの指定と、始める・やめるのボタン -->
<div class="control-row">
  <span class="tempo-text">♩＝{tempo}</span>
  <button class="tempo-button" aria-label="テンポを遅くする" disabled={isRunning || tempo <= TEMPO_MIN} onclick={() => changeTempo(-TEMPO_STEP)}> − </button>
  <button class="tempo-button" aria-label="テンポを速くする" disabled={isRunning || tempo >= TEMPO_MAX} onclick={() => changeTempo(TEMPO_STEP)}> ＋ </button>
  {#if isRunning}
    <button class="main-button stop" onclick={stop}>■ やめる</button>
  {:else}
    <button class="main-button start" onclick={start}>
      {phase === "finished" ? "▶ もう一度" : "▶ 始める"}
    </button>
  {/if}
</div>

<!-- 設定：ふだんは閉じておき、「設定」を押すと開く -->
<details class="settings">
  <summary>設定</summary>
  <div class="setting-row">
    <span class="setting-label">カウントの拍の数</span>
    <span class="setting-value">{countInBeats}</span>
    <button class="tempo-button" aria-label="カウントの拍の数を減らす" disabled={isRunning || countInBeats <= COUNT_IN_MIN} onclick={() => changeCountIn(-1)}> − </button>
    <button class="tempo-button" aria-label="カウントの拍の数を増やす" disabled={isRunning || countInBeats >= COUNT_IN_MAX} onclick={() => changeCountIn(1)}> ＋ </button>
  </div>
</details>

<style>
  /* 今の状態の表示のエリア：中央に寄せる */
  .status-area {
    margin-top: 4px;
    text-align: center;
  }

  /* 小さな見出し */
  .status-caption {
    margin: 0;
    font-size: 0.85rem;
    color: #616161;
  }

  /* 大きく表示する文字（目標の音名。今の音の帯と同じオレンジ） */
  .status-main {
    margin: 0;
    font-size: 3rem;
    font-weight: bold;
    color: #e65100;
    font-variant-numeric: tabular-nums;
  }

  /* カウントの数字：グレー */
  .status-main.count {
    color: #616161;
  }

  /* 点数の文字：緑 */
  .status-main.finished {
    color: #2e7d32;
  }

  /* 始める前のテンポの表示：薄いグレー */
  .status-main.idle {
    color: #9e9e9e;
  }

  /* タップして選んだ音の結果：結果の色の枠で囲む */
  .selected-result {
    margin: 8px 0 0 0;
    padding: 6px 10px;
    font-size: 0.9rem;
    text-align: center;
    border: 1px solid currentColor;
    border-radius: 12px;
    font-variant-numeric: tabular-nums;
  }
  .selected-result.ok {
    color: #2e7d32;
  }
  .selected-result.high {
    color: #c62828;
  }
  .selected-result.low {
    color: #1565c0;
  }
  .selected-result.none,
  .selected-result.skip {
    color: #757575;
  }

  /* 「音符をタップすると…」の案内 */
  .hint {
    margin: 8px 0 0 0;
    font-size: 0.8rem;
    color: #757575;
    text-align: center;
  }

  /* くり返しの、回ごとの点数の一覧 */
  .round-list {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    margin: 8px 0 0 0;
    padding: 0;
    list-style: none;
  }
  .round {
    font-size: 0.9rem;
    color: #616161;
    font-variant-numeric: tabular-nums;
  }
  .round strong {
    color: #2e7d32;
  }

  /* エラーメッセージ */
  .error {
    margin: 12px 0 0 0;
    color: #c62828;
  }

  /* テンポの表示・テンポのボタン・始めるボタンを横に並べる */
  .control-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
  }

  /* テンポの表示 */
  .tempo-text {
    min-width: 4.5em;
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
  }

  /* ボタン共通 */
  button {
    height: 44px;
    padding: 0;
    font-size: 1rem;
    line-height: 1;
    border-radius: 8px;
    cursor: pointer;
  }

  /* 押せない状態のボタン */
  button:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  /* テンポの「−」「＋」ボタン */
  button.tempo-button {
    width: 44px;
    flex-shrink: 0;
    color: #1976d2;
    background-color: white;
    border: 2px solid #1976d2;
  }

  /* 始める・やめるボタン */
  button.main-button {
    flex: 1;
    color: white;
    border: none;
  }
  button.main-button.start {
    background-color: #1976d2;
  }
  button.main-button.stop {
    background-color: #c62828;
  }

  /* 設定のエリア */
  .settings {
    margin-top: 16px;
    font-size: 0.9rem;
    color: #616161;
  }
  .settings summary {
    cursor: pointer;
  }
  .setting-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
  }
  .setting-label {
    flex: 1;
  }
  .setting-value {
    min-width: 2em;
    text-align: right;
    font-size: 1rem;
    color: #212121;
    font-variant-numeric: tabular-nums;
  }
</style>
