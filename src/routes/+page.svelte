<script>
  // onDestroy：このページが画面から消えるときに後片付けをするための仕組み
  import { onDestroy } from "svelte";

  // 音の大きさの計算と、周波数の検出をする関数を読み込む
  // （このバージョンのSvelteKitでは、src/lib フォルダを「#lib」と書いて指す）
  import { calculateRms, detectPitch } from "#lib/pitch.js";

  // ===== 設定値 =====

  // 直近の検出値を何回分ためておくか（1秒に約60回検出するので、30回分は約0.5秒分）
  const HISTORY_SIZE = 30;

  // ===== 画面に表示する値（$state を付けると、値が変わったとき画面も自動で更新される） =====

  // マイクが動いているかどうか（true：動作中、false：停止中）
  let isRunning = $state(false);

  // 音の大きさ（0〜100）。バーの長さに使う
  let volume = $state(0);

  // 表示する周波数（Hz）。直近の検出値の中央値。検出できていないときは null
  let frequency = $state(null);

  // 【確認用】直近の検出値の中での最小値（Hz）。検出できていないときは null
  let frequencyMin = $state(null);

  // 【確認用】直近の検出値の中での最大値（Hz）。検出できていないときは null
  let frequencyMax = $state(null);

  // エラーメッセージ（エラーがないときは空文字）
  let errorMessage = $state("");

  // ===== 音声処理で使う部品（画面には表示しないので $state は付けない） =====

  // AudioContext：ブラウザで音を扱うための土台になる部品
  let audioContext = null;

  // AnalyserNode：音の波形データを取り出すための部品
  let analyser = null;

  // MediaStream：マイクから流れてくる音そのもの
  let mediaStream = null;

  // マイクの音を AudioContext の中に取り込むための部品
  let sourceNode = null;

  // 繰り返し処理の番号（停止するときに使う）
  let animationId = null;

  // 波形データを入れておく入れ物（配列）
  let waveform = null;

  // 直近の検出値（Hz）をためておく配列。古いものから順に並ぶ
  let history = [];

  /**
   * マイクを開始する関数
   * 「開始」ボタンを押したときに呼ばれる。
   * マイクの使用許可を取り、音の解析を始める。
   */
  async function start() {
    // 前回のエラーメッセージを消す
    errorMessage = "";

    // マイクが使えない環境（HTTPSではないページなど）かどうかを確認する
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      errorMessage = "このブラウザ（またはこのページ）ではマイクが使えません。";
      return;
    }

    try {
      // マイクの使用許可を求める（ここでブラウザの許可ダイアログが出る）
      // 楽器の音をそのまま取り込みたいので、通話用の自動補正はすべてオフにする
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false, // エコー除去をオフ
          noiseSuppression: false, // 雑音除去をオフ
          autoGainControl: false, // 音量の自動調整をオフ
        },
      });

      // 音を扱う土台を作る
      audioContext = new AudioContext();

      // マイクの音を土台の中に取り込む
      sourceNode = audioContext.createMediaStreamSource(mediaStream);

      // 波形を取り出す部品を作る
      analyser = audioContext.createAnalyser();

      // 一度に取り出す波形データの個数（4096個）
      // 低い音でも周期を正確に測れるように、多めに取り出す
      analyser.fftSize = 4096;

      // マイクの音を解析用の部品につなぐ
      sourceNode.connect(analyser);

      // 波形データを入れる入れ物を、データの個数ぶん用意する
      waveform = new Float32Array(analyser.fftSize);

      // 動作中にする
      isRunning = true;

      // 繰り返し処理を始める
      update();
    } catch (error) {
      // 許可を拒否された場合や、マイクが見つからない場合はここに来る
      if (error.name === "NotAllowedError") {
        errorMessage = "マイクの使用が許可されませんでした。ブラウザの設定を確認してください。";
      } else if (error.name === "NotFoundError") {
        errorMessage = "マイクが見つかりませんでした。";
      } else {
        errorMessage = "マイクの開始に失敗しました：" + error.message;
      }

      // 途中まで作った部品を片付ける
      stop();
    }
  }

  /**
   * 繰り返し処理をする関数
   * 画面の描画に合わせて（1秒に約60回）呼ばれ続ける。
   * 波形データを取り出して、音の大きさと周波数を求める。
   */
  function update() {
    // 最新の波形データを入れ物に取り出す（値は -1 〜 1 の範囲）
    analyser.getFloatTimeDomainData(waveform);

    // 波形から音の大きさを計算する
    const rms = calculateRms(waveform);

    // バーの長さ（0〜100）に変換する
    // rms はとても小さい値なので 300 倍し、100 を超えないようにする
    volume = Math.min(100, rms * 300);

    // 波形から周波数を検出する（検出できなかったときは null が入る）
    // audioContext.sampleRate は、1秒あたりのデータ数（例：48000）
    const detected = detectPitch(waveform, audioContext.sampleRate);

    if (detected === null) {
      // 検出できなかったとき：ためた値を消して、表示を「---」に戻す
      history = [];
      frequency = null;
      frequencyMin = null;
      frequencyMax = null;
    } else {
      // 検出できたとき：検出値を配列の最後に追加する
      history.push(detected);

      // ためる個数の上限を超えたら、一番古い値（先頭）を捨てる
      if (history.length > HISTORY_SIZE) {
        history.shift();
      }

      // ためた値の中央値を、表示する周波数にする
      frequency = calculateMedian(history);

      // 【確認用】ためた値の中の最小値と最大値を求める
      frequencyMin = Math.min(...history);
      frequencyMax = Math.max(...history);
    }

    // 次の描画のタイミングで、もう一度この関数を呼ぶ
    animationId = requestAnimationFrame(update);
  }

  /**
   * 中央値を計算する関数
   * 中央値は、値を小さい順に並べたときに真ん中に来る値のこと。
   * たまに大きく外れた値が混ざっても、平均と違って影響を受けにくい。
   * @param {number[]} values - 数値の配列（1個以上入っていること）
   * @returns {number} 中央値
   */
  function calculateMedian(values) {
    // 元の配列の順番を変えないように、コピーを作ってから小さい順に並べる
    const sorted = [...values].sort((a, b) => a - b);

    // 真ん中の位置を求める
    const middle = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 1) {
      // 個数が奇数のとき：真ん中の1個がそのまま中央値
      return sorted[middle];
    } else {
      // 個数が偶数のとき：真ん中の2個の平均が中央値
      return (sorted[middle - 1] + sorted[middle]) / 2;
    }
  }

  /**
   * マイクを停止する関数
   * 「停止」ボタンを押したとき、エラーが起きたとき、ページを離れるときに呼ばれる。
   * 使っていた部品をすべて片付ける。
   */
  function stop() {
    // 繰り返し処理を止める
    if (animationId !== null) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }

    // マイクと解析用の部品の接続を外す
    if (sourceNode !== null) {
      sourceNode.disconnect();
      sourceNode = null;
    }

    // マイクを止める（ブラウザの「マイク使用中」の表示が消える）
    if (mediaStream !== null) {
      mediaStream.getTracks().forEach((track) => track.stop());
      mediaStream = null;
    }

    // 音を扱う土台を閉じる
    if (audioContext !== null) {
      audioContext.close();
      audioContext = null;
    }

    // 残りの部品と表示を初期状態に戻す
    analyser = null;
    waveform = null;
    history = [];
    volume = 0;
    frequency = null;
    frequencyMin = null;
    frequencyMax = null;
    isRunning = false;
  }

  // このページが画面から消えるときに、マイクを止める
  onDestroy(() => {
    stop();
  });
</script>

<main>
  <h1>バイオリン音程チェック</h1>

  <!-- 動作中は「停止」ボタン、停止中は「開始」ボタンを表示する -->
  {#if isRunning}
    <button class="stop" onclick={stop}>停止</button>
  {:else}
    <button class="start" onclick={start}>開始</button>
  {/if}

  <!-- エラーがあるときだけメッセージを表示する -->
  {#if errorMessage !== ""}
    <p class="error">{errorMessage}</p>
  {/if}

  <!-- 音量バー -->
  <div class="volume-area">
    <span class="volume-label">音量</span>
    <div class="volume-track">
      <!-- volume（0〜100）をそのままバーの幅（％）にする -->
      <div class="volume-bar" style="width: {volume}%"></div>
    </div>
  </div>

  <!-- 周波数の表示 -->
  <p class="frequency">
    <!-- 検出できているときは小数第1位まで表示し、できていないときは「---」を表示する -->
    {#if frequency !== null}
      {frequency.toFixed(1)} Hz
    {:else}
      --- Hz
    {/if}
  </p>

  <!-- 【確認用】直近の検出値の最小値と最大値。精度の確認が終わったら消す -->
  {#if frequencyMin !== null && frequencyMax !== null}
    <p class="frequency-range">
      （最小 {frequencyMin.toFixed(1)} ／ 最大 {frequencyMax.toFixed(1)}）
    </p>
  {/if}
</main>

<style>
  /* 画面全体：スマホで見やすいように幅を制限して中央に寄せる */
  main {
    max-width: 480px;
    margin: 0 auto;
    padding: 24px 16px;
    font-family: sans-serif;
  }

  /* タイトル */
  h1 {
    font-size: 1.4rem;
    margin: 0 0 24px 0;
  }

  /* ボタン共通：指で押しやすい大きさにする */
  button {
    width: 100%;
    padding: 16px;
    font-size: 1.2rem;
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
  }

  /* 開始ボタン（緑） */
  button.start {
    background-color: #2e7d32;
  }

  /* 停止ボタン（赤） */
  button.stop {
    background-color: #c62828;
  }

  /* エラーメッセージ */
  .error {
    color: #c62828;
    margin: 16px 0 0 0;
  }

  /* 音量バーのエリア：ラベルとバーを横に並べる */
  .volume-area {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 24px;
  }

  /* 「音量」のラベル */
  .volume-label {
    font-size: 0.9rem;
    flex-shrink: 0;
  }

  /* バーの背景（グレーの枠） */
  .volume-track {
    flex-grow: 1;
    height: 16px;
    background-color: #e0e0e0;
    border-radius: 8px;
    overflow: hidden;
  }

  /* バー本体（音量に応じて幅が変わる） */
  .volume-bar {
    height: 100%;
    background-color: #1976d2;
  }

  /* 周波数の表示：大きく中央に表示する */
  .frequency {
    margin: 32px 0 0 0;
    font-size: 2.4rem;
    text-align: center;
    /* 数字の幅をそろえて、値が変わっても表示が左右に揺れないようにする */
    font-variant-numeric: tabular-nums;
  }

  /* 【確認用】最小値と最大値の表示：小さくグレーで表示する */
  .frequency-range {
    margin: 4px 0 0 0;
    font-size: 0.9rem;
    color: #757575;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
</style>
