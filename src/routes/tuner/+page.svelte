<script>
  // onDestroy：このページが画面から消えるときに後片付けをするための仕組み
  import { onDestroy } from "svelte";

  // マイクの音の高さを調べはじめる関数と、やめる関数を読み込む
  // （このバージョンのSvelteKitでは、src/lib フォルダを「#lib」と書いて指す）
  import { startMicrophone, stopMicrophone } from "#lib/microphone.js";

  // 周波数から音名とズレを計算する関数と、ズレを表示用の文字列にする関数を読み込む
  import { frequencyToNote, formatCents } from "#lib/note.js";

  // 開放弦の周波数を返す関数を読み込む（合わせる高さを決めるために使う）
  import { getOpenStringFrequency } from "#lib/tuning.js";

  // 弦の一覧（G線・D線・A線・E線）を読み込む
  import { STRINGS } from "#lib/fingerboard.js";

  // 音のデータを表示用の文字にする関数を読み込む（合わせる音を「レ4」のように表示するために使う）
  import { noteToText } from "#lib/score.js";

  // ズレを針で表示するメーターの部品を読み込む
  import Meter from "#lib/Meter.svelte";

  // ===== 設定値 =====

  // 「OK」とする範囲（セント）。合わせる高さから ±5 セント以内なら OK
  // （練習モードより厳しくしてある。調弦は、曲を弾く前の土台になるため）
  const TOLERANCE = 5;

  // メーターに表示する範囲（セント）。左の端が −50、右の端が +50
  const METER_RANGE = 50;

  // 弦の選び方が「自動」のときの id
  const AUTO_ID = "auto";

  // 「自動」で、まだ音が鳴っていないときに選んでおく弦の番号（2 は A線。調弦は A線から始めることが多いため）
  const DEFAULT_STRING_INDEX = 2;

  // 4本の弦それぞれの、合わせる高さ（Hz）。STRINGS と同じ順番（G・D・A・E）に並ぶ
  // 開放弦の高さは、基準の音（ラ4）から5度ずつ合わせた高さ。練習モードと同じ関数から求める
  const STRING_FREQUENCIES = STRINGS.map((string) => getOpenStringFrequency(string.openNote));

  // ===== 画面に表示する値（$state を付けると、値が変わったとき画面も自動で更新される） =====

  // マイクが動いているかどうか（true：動作中、false：停止中）
  let isRunning = $state(false);

  // エラーメッセージ（エラーがないときは空文字）
  let errorMessage = $state("");

  // 今鳴っている音の周波数（Hz）。音が出ていないときは null
  let frequency = $state(null);

  // 弦の選び方。"auto"（自動）か、弦の id（"G"・"D"・"A"・"E"）
  let selectedStringId = $state(AUTO_ID);

  // 「自動」のときに、最後に選ばれた弦の番号（0 が G線、3 が E線）
  // 音が止まっても、この番号は残しておく（表示がちらちら変わらないようにするため）
  let autoStringIndex = $state(DEFAULT_STRING_INDEX);

  // ===== 上の値から自動で計算される値（$derived を付けると、元の値が変わるたびに計算し直される） =====

  // 今の音の、音名とズレの情報。音が出ていないときは null
  let note = $derived(frequency !== null ? frequencyToNote(frequency) : null);

  // 合わせる弦の番号（0 が G線、3 が E線）
  // 「自動」のときは最後に選ばれた弦、そうでないときは、ボタンで選んだ弦
  let targetIndex = $derived(selectedStringId === AUTO_ID ? autoStringIndex : STRINGS.findIndex((string) => string.id === selectedStringId));

  // 合わせる高さ（Hz）
  let targetFrequency = $derived(STRING_FREQUENCIES[targetIndex]);

  // 合わせる高さからのズレ（セント）。プラスは高い、マイナスは低い。音が出ていないときは null
  let cents = $derived(frequency !== null ? getCents(frequency, targetFrequency) : null);

  // 判定の結果。"ok"・"low"（低い）・"high"（高い）・"none"（音が出ていない）のどれか
  let status = $derived.by(() => {
    if (cents === null) {
      return "none";
    } else if (cents < -TOLERANCE) {
      return "low";
    } else if (cents > TOLERANCE) {
      return "high";
    } else {
      return "ok";
    }
  });

  // 判定の結果ごとの、画面に表示する文字
  const STATUS_TEXTS = { ok: "OK", low: "低い", high: "高い", none: "---" };

  /**
   * 2つの周波数の差を、セントで求める関数
   * セントは、音の高さの差を表す単位（半音1つ分が 100 セント）。
   * @param {number} measured - 測った周波数（Hz）
   * @param {number} target - 目標の周波数（Hz）
   * @returns {number} ズレ（セント）。プラスは目標より高い、マイナスは低い
   */
  function getCents(measured, target) {
    // 周波数が2倍になると 1200 セント（1オクターブ）上がるので、log2 を使う
    return 1200 * Math.log2(measured / target);
  }

  /**
   * 今の音に一番近い弦の番号を求める関数
   * 4本の弦それぞれとのズレ（セント）を比べて、一番小さいものを選ぶ。
   * @param {number} measured - 測った周波数（Hz）
   * @returns {number} 弦の番号（0 が G線、3 が E線）
   */
  function getNearestStringIndex(measured) {
    let nearestIndex = 0;
    let nearestDistance = Infinity;

    STRING_FREQUENCIES.forEach((stringFrequency, index) => {
      // ズレの大きさ（高い・低いは区別しないので、Math.abs でマイナスを外す）
      const distance = Math.abs(getCents(measured, stringFrequency));

      // 今までで一番近ければ、その弦を覚えておく
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    return nearestIndex;
  }

  /**
   * マイクから音の高さが届くたびに呼ばれる関数
   * 今の音の周波数を覚え、「自動」のときは、一番近い弦を選び直す。
   * @param {number|null} detected - 周波数（Hz）。音が出ていないときは null
   */
  function handlePitch(detected) {
    frequency = detected;

    // 「自動」で、音が出ているときだけ、弦を選び直す
    // （音が出ていないときは、最後に選ばれた弦のままにしておく）
    if (detected !== null && selectedStringId === AUTO_ID) {
      autoStringIndex = getNearestStringIndex(detected);
    }
  }

  /**
   * マイクを開始する関数
   * 「開始」ボタンを押したときに呼ばれる。
   */
  async function start() {
    // 前回のエラーメッセージを消す
    errorMessage = "";

    try {
      // マイクを開始する。音の高さが分かるたびに、handlePitch が呼ばれる
      await startMicrophone(handlePitch);
      isRunning = true;
    } catch (error) {
      // マイクが使えなかったとき
      // どんなエラーかは、microphone.js が日本語のメッセージにしてくれている
      errorMessage = error.message;
      stop();
    }
  }

  /**
   * マイクを停止する関数
   * 「停止」ボタンを押したとき、エラーが起きたとき、ページを離れるときに呼ばれる。
   */
  function stop() {
    stopMicrophone();

    // 表示を初期状態に戻す
    frequency = null;
    isRunning = false;
  }

  // このページが画面から消えるときに、マイクを止める
  onDestroy(() => {
    stop();
  });
</script>

<!-- svelte:head の中に書いたものは、ページの「head」（画面には出ない、ページについての情報を書く場所）に入る -->
<svelte:head>
  <!-- title：ブラウザのタブに出る -->
  <title>チューナー｜バイオリン音程チェック</title>

  <!-- このページは検索結果に載せない（ホームから進んでもらう形にするため） -->
  <meta name="robots" content="noindex" />
</svelte:head>

<main>
  <!-- 画面の上の行：ホームへ戻るリンクと、ページのタイトルを横に並べる -->
  <div class="header-row">
    <a class="back-link" href="/">← ホーム</a>
    <h1>チューナー</h1>
  </div>

  <!-- 動作中は「停止」ボタン、停止中は「開始」ボタンを表示する -->
  {#if isRunning}
    <button class="main-button stop" onclick={stop}>停止</button>
  {:else}
    <button class="main-button start" onclick={start}>開始</button>
  {/if}

  <!-- エラーがあるときだけメッセージを表示する -->
  {#if errorMessage !== ""}
    <p class="error">{errorMessage}</p>
  {/if}

  <!-- ===== 今の音：どんな音でも、音名と周波数を表示する ===== -->
  <section class="panel">
    <h2>今の音</h2>

    <!-- 音名と周波数を横に並べる。音が出ていないときは「---」を表示する -->
    <div class="current-row">
      {#if note !== null}
        <span class="note-name">{note.name}{note.octave}</span>
        <span class="frequency">{frequency.toFixed(1)} Hz</span>
      {:else}
        <span class="note-name">---</span>
        <span class="frequency">--- Hz</span>
      {/if}
    </div>

    <!-- 平均律でのその音からのズレ -->
    <p class="current-cents">
      {#if note !== null}
        平均律の{note.name}{note.octave}より {formatCents(note.cents)} セント
      {:else}
        マイクに向かって音を出してください
      {/if}
    </p>
  </section>

  <!-- ===== 調弦：選んだ弦の高さとのズレを表示する ===== -->
  <section class="panel">
    <h2>調弦</h2>

    <!-- 弦の選び方：「自動」と、4本の弦のボタンを横に並べる -->
    <div class="string-row">
      <!-- 選択中のボタンに selected クラスを付けて色を変える -->
      <button class="choice" class:selected={selectedStringId === AUTO_ID} onclick={() => (selectedStringId = AUTO_ID)}>自動</button>

      {#each STRINGS as string, index (string.id)}
        <!-- 「自動」のときは、今選ばれている弦に picked クラスを付けて、どの弦に合わせているかが分かるようにする -->
        <button class="choice" class:selected={selectedStringId === string.id} class:picked={selectedStringId === AUTO_ID && targetIndex === index} onclick={() => (selectedStringId = string.id)}>
          {string.id}
        </button>
      {/each}
    </div>

    <!-- 合わせる音（その弦の開放弦の音名）と、その高さ -->
    <!-- どの弦かは、上のボタンの色で分かるので、ここには音名を出す -->
    <p class="target">
      <strong>{noteToText(STRINGS[targetIndex].openNote)}</strong>
      {targetFrequency.toFixed(1)} Hz に合わせる
    </p>

    <!-- メーター：合わせる高さからのズレを針で表示する -->
    <Meter {cents} tolerance={TOLERANCE} range={METER_RANGE} />

    <!-- 判定の結果とズレ。結果（ok・low・high・none）をクラスに付けて、色を変える -->
    <p class="result {status}">
      <span class="result-text">{STATUS_TEXTS[status]}</span>
      {#if cents !== null}
        <span class="result-cents">{formatCents(cents)} セント</span>
      {/if}
    </p>
  </section>

  <p class="note">
    合わせる高さは、ラ＝{STRING_FREQUENCIES[2].toFixed(0)}Hz から、となりの弦と5度ずつ合わせた高さです。<br />
    「自動」は、鳴っている音に一番近い弦を選びます。弦のボタンを押すと、その弦に固定できます。<br />
    合わせる高さから ±{TOLERANCE} セント以内で「OK」になります。メーターの左右の端は ±{METER_RANGE} セントです。
  </p>
</main>

<style>
  /* 画面全体：スマホで見やすいように幅を制限して中央に寄せる */
  main {
    max-width: 480px;
    margin: 0 auto;
    padding: 12px 16px 24px 16px;
    font-family: sans-serif;
  }

  /* 画面の上の行：リンクとタイトルを横に並べる */
  .header-row {
    display: flex;
    align-items: baseline;
    gap: 12px;
    margin-bottom: 12px;
  }

  /* ホームへ戻るリンク */
  .back-link {
    flex-shrink: 0;
    color: #1976d2;
    font-size: 0.9rem;
    text-decoration: none;
  }

  /* タイトル */
  h1 {
    font-size: 1.1rem;
    margin: 0;
  }

  /* 「開始」「停止」のボタン共通：指で押しやすい大きさにする */
  button.main-button {
    width: 100%;
    padding: 14px;
    font-size: 1.1rem;
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
  }

  /* 開始ボタン（緑） */
  button.main-button.start {
    background-color: #2e7d32;
  }

  /* 停止ボタン（赤） */
  button.main-button.stop {
    background-color: #c62828;
  }

  /* エラーメッセージ */
  .error {
    color: #c62828;
    margin: 12px 0 0 0;
  }

  /* 「今の音」「調弦」のまとまり：薄い枠で囲む */
  .panel {
    margin-top: 14px;
    padding: 12px;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
  }

  /* まとまりの見出し */
  h2 {
    margin: 0 0 6px 0;
    font-size: 0.85rem;
    color: #616161;
  }

  /* 今の音：音名と周波数を横に並べて、下の端をそろえる */
  .current-row {
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: 16px;
  }

  /* 今の音の音名：大きく表示する */
  .note-name {
    font-size: 2.6rem;
    font-weight: bold;
  }

  /* 今の音の周波数 */
  .frequency {
    font-size: 1.4rem;
    /* 数字の幅をそろえて、値が変わっても表示が左右に揺れないようにする */
    font-variant-numeric: tabular-nums;
  }

  /* 平均律からのズレ：小さくグレーで表示する */
  .current-cents {
    margin: 2px 0 0 0;
    font-size: 0.85rem;
    color: #616161;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  /* 弦を選ぶボタンを横に並べる */
  .string-row {
    display: flex;
    gap: 6px;
  }

  /* 弦を選ぶボタン（選択前）：白地に青い枠。5つのボタンで、横幅を同じ割合で分け合う */
  button.choice {
    flex: 1;
    padding: 10px 0;
    font-size: 1rem;
    font-weight: bold;
    color: #1976d2;
    background-color: white;
    border: 2px solid #1976d2;
    border-radius: 8px;
    cursor: pointer;
  }

  /* 弦を選ぶボタン（選択中）：青く塗る */
  button.choice.selected {
    color: white;
    background-color: #1976d2;
  }

  /* 「自動」で今選ばれている弦のボタン：薄い青で塗って、合わせている弦が分かるようにする */
  button.choice.picked {
    background-color: #bbdefb;
  }

  /* 合わせる弦と、その高さ */
  .target {
    margin: 12px 0 8px 0;
    font-size: 0.95rem;
    color: #424242;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  /* 合わせる弦の名前：大きめの黒い太字 */
  .target strong {
    margin-right: 6px;
    font-size: 1.3rem;
    color: #212121;
  }

  /* 判定の結果とズレ：横に並べて中央に寄せる */
  .result {
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: 12px;
    margin: 8px 0 0 0;
    font-variant-numeric: tabular-nums;
  }

  /* 判定の結果の文字：大きく表示する */
  .result-text {
    font-size: 1.8rem;
    font-weight: bold;
  }

  /* ズレ（セント） */
  .result-cents {
    font-size: 1.2rem;
  }

  /* 判定の結果ごとの色：OK は緑、低いは青、高いは赤、音が出ていないときはグレー */
  /* （メーターの針の色と同じにしてある） */
  .result.ok {
    color: #1b5e20;
  }

  .result.low {
    color: #1565c0;
  }

  .result.high {
    color: #c62828;
  }

  .result.none {
    color: #9e9e9e;
  }

  /* 注意書き：小さくグレーで表示する */
  .note {
    margin: 12px 0 0 0;
    font-size: 0.75rem;
    line-height: 1.6;
    color: #757575;
  }
</style>
