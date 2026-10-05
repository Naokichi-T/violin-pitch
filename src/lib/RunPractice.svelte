<script>
  // 「通し」モードの練習の部品
  // メトロノームのテンポに合わせて、目標の音が1拍ごとに次へ進む。
  // （今はまだ、目標の音が進むだけ。音程の判定と点数は、このあと追加する）

  // onMount：この部品が画面に表示されたときに1回だけ処理をするための仕組み
  // onDestroy：この部品が画面から消えるときに後片付けをするための仕組み
  // untrack：値を「最初の1回だけ」読むための仕組み（下の tempo で使う）
  import { onMount, onDestroy, untrack } from "svelte";

  // 音のデータを表示用の文字にする関数を読み込む
  import { noteToText } from "#lib/score.js";

  // メトロノームの音を鳴らす関数を読み込む
  import { playClick } from "#lib/audio.js";

  // カウントの拍の数を、ブラウザに保存する関数と読み込む関数を読み込む
  import { loadCountInBeats, saveCountInBeats } from "#lib/settings.js";

  // 五線譜を描く部品を読み込む
  import Staff from "#lib/Staff.svelte";

  // この部品を使う側（練習ページ）から受け取る値
  // notes        ：練習する楽譜の音の並び（音のデータの配列。1つ以上入っていること）
  // currentKey   ：楽譜の調のデータ
  // initialTempo ：最初のテンポ（編集ページで決めたテンポ）
  let { notes, currentKey, initialTempo } = $props();

  // ===== テンポとカウントに関する設定値 =====

  // テンポ（1分間の拍の数）の最小・最大と、ボタン1回で変わる量
  const TEMPO_MIN = 40;
  const TEMPO_MAX = 200;
  const TEMPO_STEP = 5;

  // 弾きはじめる前に、メトロノームだけを鳴らす拍の数（カウント）の最小・最大と、最初の値
  // （弓を構える時間がほしいので、少し長めにしてある）
  const COUNT_IN_MIN = 5;
  const COUNT_IN_MAX = 30;
  const COUNT_IN_DEFAULT = 10;

  // ===== 画面に表示する値（$state を付けると、値が変わったとき画面も自動で更新される） =====

  // テンポ（1分間の拍の数）。四分音符1つが1拍
  // 最初は、編集ページで決めたテンポにする。そのあとは、このページの「−」「＋」で変えられる
  // untrack で囲むのは、「最初の値として1回だけ読む」ことをSvelteにはっきり伝えるため
  let tempo = $state(untrack(() => clampTempo(initialTempo)));

  // カウントの拍の数。設定の「−」「＋」で変えられる
  // 最初は決めておいた値にしておき、保存した値があれば、下の onMount で入れ直す
  let countInBeats = $state(COUNT_IN_DEFAULT);

  // 今の状態。次の4つのどれかが入る
  //   'idle'     ：始める前（または、途中でやめたあと）
  //   'countIn'  ：カウント中（メトロノームだけが鳴っている）
  //   'playing'  ：演奏中（目標の音が1拍ごとに進んでいる）
  //   'finished' ：最後まで進んだ
  let phase = $state("idle");

  // カウントの残りの拍の数（10 → 9 → … → 1）。カウント中だけ使う
  let countInRemaining = $state(0);

  // 今の目標の音が何番目か（0から始まる）。演奏中だけ入り、それ以外は null
  let currentIndex = $state(null);

  // ===== 進行のために覚えておく値（画面には表示しないので $state は付けない） =====

  // 次の拍のための予約の番号（やめるときに、予約を取り消すために使う）
  let timer = null;

  // 始めた時刻（ページを開いてからのミリ秒）
  let startTime = 0;

  // 動いている最中かどうか（カウント中か演奏中なら true）
  // $derived を付けると、phase が変わるたびに自動で計算し直される
  let isRunning = $derived(phase === "countIn" || phase === "playing");

  // この部品が画面に表示されたときに、前回保存したカウントの拍の数を読み込む
  // （ブラウザの保存場所は、画面が表示されたあとでないと使えないため、ここで読み込む）
  onMount(() => {
    const savedCountInBeats = loadCountInBeats();

    // 保存した値があるときだけ使う（念のため、最小と最大の間に収める）
    if (savedCountInBeats !== null) {
      countInBeats = clampCountIn(savedCountInBeats);
    }
  });

  // この部品が画面から消えるとき（別のモードに切り替えたときや、ページを離れたとき）に、進行を止める
  onDestroy(() => {
    stop();
  });

  /**
   * テンポを、最小と最大の間に収める関数
   * @param {number} value - テンポ
   * @returns {number} 最小と最大の間に収めたテンポ
   */
  function clampTempo(value) {
    return Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, value));
  }

  /**
   * テンポを変える関数
   * テンポの「−」「＋」ボタンを押したときに呼ばれる。
   * @param {number} amount - 変える量（遅くするときはマイナス、速くするときはプラス）
   */
  function changeTempo(amount) {
    tempo = clampTempo(tempo + amount);
  }

  /**
   * カウントの拍の数を、最小と最大の間に収める関数
   * @param {number} value - カウントの拍の数
   * @returns {number} 最小と最大の間に収めたカウントの拍の数
   */
  function clampCountIn(value) {
    return Math.min(COUNT_IN_MAX, Math.max(COUNT_IN_MIN, value));
  }

  /**
   * カウントの拍の数を変える関数
   * 設定の「−」「＋」ボタンを押したときに呼ばれる。変えた値はブラウザに保存する。
   * @param {number} amount - 変える量（減らすときはマイナス、増やすときはプラス）
   */
  function changeCountIn(amount) {
    countInBeats = clampCountIn(countInBeats + amount);

    // 次に開いたときも同じ値で始められるように、ブラウザに保存する
    saveCountInBeats(countInBeats);
  }

  /**
   * 「通し」の練習を始める関数
   * 「始める」ボタンを押したときに呼ばれる。
   * まずカウントを鳴らし、そのあと1拍ごとに目標の音を進める。
   */
  function start() {
    // 始めた時刻を覚えておく（それぞれの拍の時刻を計算するために使う）
    // performance.now() は、ページを開いてからの時間をミリ秒で返す
    startTime = performance.now();

    // 最初の拍（カウントの1拍目）から始める
    runBeat(0);
  }

  /**
   * 1拍ぶんの処理をして、次の拍を予約する関数
   * 1拍ごとに呼ばれる。カウント → 楽譜の音を順に → 終わり、と進む。
   * @param {number} beat - 始めてから何拍目か（0から始まる。カウントの拍も含めて数える）
   */
  function runBeat(beat) {
    // 楽譜の何番目の音にあたるか（カウントの間はマイナスになる）
    const noteIndex = beat - countInBeats;

    if (noteIndex < 0) {
      // カウント中：残りの拍の数を表示して、メトロノームを鳴らす
      phase = "countIn";
      countInRemaining = countInBeats - beat;
      currentIndex = null;
      playClick();
    } else if (noteIndex < notes.length) {
      // 演奏中：この拍の音を目標にして、メトロノームを鳴らす
      phase = "playing";
      currentIndex = noteIndex;
      playClick();
    } else {
      // 最後の音の拍が終わった：終わりにする
      timer = null;
      phase = "finished";
      currentIndex = null;
      return;
    }

    // 1拍の長さ（ミリ秒）。テンポ60なら1000、テンポ120なら500
    const beatMilliseconds = 60000 / tempo;

    // 次の拍の時刻を、始めた時刻から計算する
    // （「今から1拍後」と数えていくと、少しずつ遅れが積み重なるため）
    const nextTime = startTime + (beat + 1) * beatMilliseconds;

    // 次の拍までの待ち時間（ミリ秒）。すでに過ぎていたら、すぐに進める
    const delay = Math.max(0, nextTime - performance.now());

    // 待ち時間のあとに、次の拍でこの関数をもう一度呼ぶように予約する
    timer = setTimeout(() => runBeat(beat + 1), delay);
  }

  /**
   * 「通し」の練習を途中でやめる関数
   * 「やめる」ボタンを押したときと、この部品が画面から消えるときに呼ばれる。
   */
  function stop() {
    // 次の拍の予約を取り消す
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }

    // 始める前の状態に戻す
    phase = "idle";
    currentIndex = null;
  }
</script>

<!-- 五線譜（今の目標の音を、編集ページの「再生中」と同じオレンジで表示する） -->
<Staff {notes} signature={currentKey.signature} playingIndex={currentIndex} />

<!-- 今の状態の表示：状態によって、表示する内容を切り替える -->
<div class="status-area">
  {#if phase === "countIn"}
    <!-- カウント中：残りの拍の数を大きく表示する -->
    <p class="status-caption">カウント</p>
    <p class="status-main count">{countInRemaining}</p>
  {:else if phase === "playing"}
    <!-- 演奏中：今の目標の音を大きく表示する -->
    <p class="status-caption">目標の音（{currentIndex + 1} / {notes.length}）</p>
    <p class="status-main">{noteToText(notes[currentIndex])}</p>
  {:else if phase === "finished"}
    <!-- 最後まで進んだ -->
    <p class="status-caption">　</p>
    <p class="status-main finished">おわり</p>
  {:else}
    <!-- 始める前：やり方を案内する -->
    <p class="status-caption">「始める」を押すと、カウントが{countInBeats}拍鳴ります</p>
    <p class="status-main idle">♩＝{tempo}</p>
  {/if}
</div>

<!-- テンポの指定と、始める・やめるのボタン -->
<div class="control-row">
  <!-- 今のテンポ。♩＝60 は「四分音符を1分間に60回」という意味 -->
  <span class="tempo-text">♩＝{tempo}</span>

  <!-- テンポを遅くするボタン（動いている最中と、これ以上遅くできないときは押せない） -->
  <!-- aria-label は、読み上げで操作する人のための、ボタンの説明 -->
  <button class="tempo-button" aria-label="テンポを遅くする" disabled={isRunning || tempo <= TEMPO_MIN} onclick={() => changeTempo(-TEMPO_STEP)}> − </button>

  <!-- テンポを速くするボタン（動いている最中と、これ以上速くできないときは押せない） -->
  <button class="tempo-button" aria-label="テンポを速くする" disabled={isRunning || tempo >= TEMPO_MAX} onclick={() => changeTempo(TEMPO_STEP)}> ＋ </button>

  <!-- 動いている最中は「やめる」ボタン、それ以外は「始める」ボタンを表示する -->
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

  <!-- カウントの拍の数（動いている最中は変えられない） -->
  <div class="setting-row">
    <span class="setting-label">カウントの拍の数</span>
    <span class="setting-value">{countInBeats}</span>

    <!-- 減らすボタン（動いている最中と、これ以上減らせないときは押せない） -->
    <button class="tempo-button" aria-label="カウントの拍の数を減らす" disabled={isRunning || countInBeats <= COUNT_IN_MIN} onclick={() => changeCountIn(-1)}> − </button>

    <!-- 増やすボタン（動いている最中と、これ以上増やせないときは押せない） -->
    <button class="tempo-button" aria-label="カウントの拍の数を増やす" disabled={isRunning || countInBeats >= COUNT_IN_MAX} onclick={() => changeCountIn(1)}> ＋ </button>
  </div>
</details>

<style>
  /* 今の状態の表示のエリア：中央に寄せる */
  .status-area {
    margin-top: 4px;
    text-align: center;
  }

  /* 小さな見出し（「カウント」「目標の音（3 / 8）」など） */
  .status-caption {
    margin: 0;
    font-size: 0.85rem;
    color: #616161;
  }

  /* 大きく表示する文字（目標の音名。五線譜の目標の音と同じオレンジにする） */
  .status-main {
    margin: 0;
    font-size: 3rem;
    font-weight: bold;
    color: #e65100;
    /* 数字の幅をそろえて、値が変わっても表示が左右に揺れないようにする */
    font-variant-numeric: tabular-nums;
  }

  /* カウントの数字：グレー */
  .status-main.count {
    color: #616161;
  }

  /* 「おわり」の文字：緑 */
  .status-main.finished {
    color: #2e7d32;
  }

  /* 始める前のテンポの表示：薄いグレー */
  .status-main.idle {
    color: #9e9e9e;
  }

  /* テンポの表示・テンポのボタン・始めるボタンを横に並べる */
  .control-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
  }

  /* テンポの表示（♩＝60） */
  .tempo-text {
    /* テンポが3けたになっても横幅が変わらないように、幅を決めておく */
    min-width: 4.5em;
    font-size: 1rem;
    /* 数字の幅をそろえて、値が変わっても表示が左右に揺れないようにする */
    font-variant-numeric: tabular-nums;
  }

  /* ボタン共通：高さを数値で決めて、ボタンの高さをそろえる */
  button {
    height: 44px;
    padding: 0;
    font-size: 1rem;
    line-height: 1;
    border-radius: 8px;
    cursor: pointer;
  }

  /* 押せない状態のボタン：薄く表示する */
  button:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  /* テンポの「−」「＋」ボタン：正方形にする */
  button.tempo-button {
    width: 44px;
    flex-shrink: 0;
    color: #1976d2;
    background-color: white;
    border: 2px solid #1976d2;
  }

  /* 始める・やめるボタン：残りの横幅いっぱいに広げる */
  button.main-button {
    flex: 1;
    color: white;
    border: none;
  }

  /* 設定のエリア */
  .settings {
    margin-top: 16px;
    font-size: 0.9rem;
    color: #616161;
  }

  /* 「設定」の文字：押せることが分かるように、カーソルを指の形にする */
  .settings summary {
    cursor: pointer;
  }

  /* 設定の1行：名前・値・ボタンを横に並べる */
  .setting-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
  }

  /* 設定の名前：残りの横幅を使って、値とボタンを右に寄せる */
  .setting-label {
    flex: 1;
  }

  /* 設定の値（拍の数）：けた数が変わっても横幅が変わらないようにする */
  .setting-value {
    min-width: 2em;
    text-align: right;
    font-size: 1rem;
    color: #212121;
    font-variant-numeric: tabular-nums;
  }

  /* 「始める」ボタン（青） */
  button.main-button.start {
    background-color: #1976d2;
  }

  /* 「やめる」ボタン（赤） */
  button.main-button.stop {
    background-color: #c62828;
  }
</style>
