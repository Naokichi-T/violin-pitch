<script>
  // onMount：このページが画面に表示された直後に処理をするための仕組み
  // onDestroy：このページが画面から消えるときに後片付けをするための仕組み
  import { onMount, onDestroy } from "svelte";

  // 調のデータに関する設定値と関数を読み込む
  import { KEYS, DEFAULT_KEY_ID, getKey, getKeyLabel, getScaleNames } from "#lib/key.js";

  // 作業中の楽譜を読み込む関数（最初に表示する調を決めるために使う）と、保存された音律を読み込む関数を読み込む
  import { loadCurrentScore, loadTemperamentId } from "#lib/settings.js";

  // 音律の一覧と最初の設定、周波数を計算する関数、開放弦の周波数を返す関数を読み込む
  import { TEMPERAMENTS, DEFAULT_TEMPERAMENT_ID, getFrequency, getOpenStringFrequency } from "#lib/tuning.js";

  // 指定した周波数の音を鳴らす関数と、鳴っている音を止める関数を読み込む
  import { playTone, stopTone } from "#lib/audio.js";

  // 音のデータを表示用の文字にする関数を読み込む
  import { noteToText } from "#lib/score.js";

  // 弦の一覧（どの弦の音かを表示するために使う）、ポジションの一覧と最初の設定、印の id を作る関数を読み込む
  import { STRINGS, POSITIONS, DEFAULT_POSITION_ID, getMarkerId } from "#lib/fingerboard.js";

  // 指板の図を描く部品を読み込む
  import Fingerboard from "#lib/Fingerboard.svelte";

  // ===== メニューに並べる調の一覧（長調と短調に分けておく） =====

  // 長調だけを取り出した一覧
  const majorKeys = KEYS.filter((key) => key.mode === "major");

  // 短調だけを取り出した一覧
  const minorKeys = KEYS.filter((key) => key.mode === "minor");

  // ===== 印の中に書くものの選択肢 =====

  //   id   ：選択肢を区別するための名前
  //   name ：画面に表示する名前
  const LABEL_MODES = [
    { id: "name", name: "音名" },
    { id: "finger", name: "指番号" },
  ];

  // ===== 画面に表示する値（$state を付けると、値が変わったとき画面も自動で更新される） =====

  // 選択中の調の id（最初はハ長調）
  let keyId = $state(DEFAULT_KEY_ID);

  // 選択中のポジションの番号（最初は第1ポジション）
  let positionId = $state(DEFAULT_POSITION_ID);

  // 印の中に書くもの（"name"：音名、"finger"：指番号）
  let labelMode = $state("name");

  // 選択中の音律の id。印を押したときに鳴らす音の高さを決めるために使う
  // 最初は決まった設定にしておき、画面に表示された後で、保存された設定に入れ替える
  // （このページで変えても保存はしない。楽譜の編集ページの音律には影響しない）
  let temperamentId = $state(DEFAULT_TEMPERAMENT_ID);

  // 最後に押した印のデータ。まだ押していないときは null
  let selectedMarker = $state(null);

  // 最後に鳴らした音の周波数（Hz）。まだ鳴らしていないときは null
  let playedFrequency = $state(null);

  // ===== 指で押している間、音を鳴らし続けるための設定値と覚えておく値 =====

  // 指で押し続けたときに、鳴らし続ける長さの上限（秒）
  // 指が離れたことをスマホが伝えそこねたときに、鳴りっぱなしになるのを防ぐ
  const HOLD_MAX_SECONDS = 30;

  // 軽くタップしただけのときでも、最低これだけは鳴らす長さ（ミリ秒）
  // ピチカート（弦を指ではじく弾き方）のような、短い音になる
  const HOLD_MIN_MILLISECONDS = 300;

  // 指で押して鳴らしはじめた時刻（ミリ秒）
  let holdStartTime = 0;

  // 「少し待ってから音を止める」予約の番号（予約していないときは null）
  let stopTimerId = null;

  // 選択中の印の id（押していないときは null）。図の中で、その印を目立たせるために渡す
  let selectedId = $derived(selectedMarker === null ? null : getMarkerId(selectedMarker));

  // 選択中の調のデータ
  // $derived を付けると、keyId が変わるたびに自動で探し直される
  let currentKey = $derived(getKey(keyId));

  // 選択中の調の音階（文字の配列）。例：['ラ', 'シ', 'ド♯', 'レ', 'ミ', 'ファ♯', 'ソ♯', 'ラ']
  let scaleNames = $derived(getScaleNames(currentKey));

  // このページが画面に表示された直後に、最初に表示する調を決める
  // 1. アドレスの最後に「?key=A-dur」のように調が付いていれば、その調にする（ほかのページから来たとき）
  // 2. 付いていなければ、作業中の楽譜の調にする
  // 3. どちらもなければ、ハ長調のまま
  onMount(() => {
    // 保存された音律を読み込む
    temperamentId = loadTemperamentId();

    // アドレスの「?」より後ろの部分から、key の値を取り出す（付いていないときは null）
    const keyFromAddress = new URLSearchParams(location.search).get("key");

    // その id の調が、調の一覧にあるかどうかを確かめる（でたらめな値が付いていたときに備える）
    const isValidKey = KEYS.some((key) => key.id === keyFromAddress);
    if (isValidKey) {
      keyId = keyFromAddress;
      return;
    }

    // 作業中の楽譜があれば、その調にする（一覧にない id のときは、getKey がハ長調にしてくれる）
    const currentScore = loadCurrentScore();
    if (currentScore !== null) {
      keyId = getKey(currentScore.keyId).id;
    }
  });

  // このページが画面から消えるときに、鳴っている音を止める
  // （止めないと、別のページに移っても音が鳴り続けてしまうため）
  onDestroy(() => {
    cancelStopTimer();
    stopTone();
  });

  // 調かポジションが変わったら、印の選択を解除する
  // （前に押した印が、変えたあとでは別の音になっていたり、無くなっていたりするため）
  // $effect の中で使っている値（keyId と positionId）が変わるたびに、自動で実行される
  $effect(() => {
    // keyId と positionId を読んでおくことで、変わったときに実行されるようにする（値そのものは使わない）
    keyId;
    positionId;

    selectedMarker = null;
    playedFrequency = null;
  });

  /**
   * 印の音の周波数を求める関数
   * 開放弦の印は、開放弦の高さ（ラ4＝442Hz から5度ずつ合わせた高さ）にする。
   * それ以外の印（音階にない場所の点も含む）は、選択中の調と音律での高さにする。
   * @param {object} marker - 印のデータ
   * @returns {number} 周波数（Hz）
   */
  function getMarkerFrequency(marker) {
    if (marker.semitones === 0) {
      // 開放弦：調弦で決まっている高さ（音律に関係なく、いつも同じ）
      // 弦の一覧に入っている、開放弦の音のデータから求める
      return getOpenStringFrequency(STRINGS[marker.stringIndex].openNote);
    }

    // 指で押さえる音：選択中の調と音律での高さ
    return getFrequency(marker.note, currentKey, temperamentId);
  }

  /**
   * 「少し待ってから音を止める」予約を取り消す関数
   * 予約が残ったままだと、次に鳴らした音が、途中で止められてしまうため。
   * 予約していないときは、何もしない。
   */
  function cancelStopTimer() {
    if (stopTimerId !== null) {
      clearTimeout(stopTimerId);
      stopTimerId = null;
    }
  }

  /**
   * 印の音を、決めた長さで鳴らしはじめる関数
   * どの印を押したかと、鳴らした周波数も覚えておく（図の印を目立たせて、下に周波数を表示する）。
   * @param {object} marker - 印のデータ
   * @param {number|undefined} duration - 鳴らす長さ（秒）。undefined のときは、playTone の決まった長さ（0.8秒）
   */
  function startMarkerTone(marker, duration) {
    // 前の音を止める予約が残っていれば、取り消す
    cancelStopTimer();

    // 音を鳴らす
    const frequency = getMarkerFrequency(marker);
    playTone(frequency, duration);

    // どの印を押したかと、鳴らした周波数を覚えておく
    selectedMarker = marker;
    playedFrequency = frequency;
  }

  /**
   * 印がマウスでクリックされたとき（またはキーボードで選ばれたとき）に、その音を短く鳴らす関数
   * @param {object} marker - 押された印のデータ
   */
  function playMarker(marker) {
    // 長さを渡さないので、決まった長さ（0.8秒）で鳴る
    startMarkerTone(marker, undefined);
  }

  /**
   * 印が指で押されたとき（スマホなど）に、その音を鳴らしはじめる関数
   * 指が離れるまで鳴らし続ける（離れたときの処理は stopHold）。
   * @param {object} marker - 押された印のデータ
   */
  function startHold(marker) {
    // 上限の長さで鳴らしはじめる（指が離れたら、stopHold で途中で止める）
    startMarkerTone(marker, HOLD_MAX_SECONDS);

    // 鳴らしはじめた時刻を覚えておく
    holdStartTime = performance.now();
  }

  /**
   * 印を押していた指が離れたときに、音を止める関数
   * 鳴らしはじめてからの時間が短すぎるときは、最低の長さになるまで待ってから止める。
   */
  function stopHold() {
    // 鳴らしはじめてから、どれだけたったか（ミリ秒）
    const elapsed = performance.now() - holdStartTime;

    // 最低の長さまで、あとどれだけ残っているか（ミリ秒）
    const remaining = HOLD_MIN_MILLISECONDS - elapsed;

    if (remaining <= 0) {
      // もう十分に鳴らしたので、すぐに止める
      stopTone();
      return;
    }

    // まだ短いので、残りの時間だけ待ってから止める
    cancelStopTimer();
    stopTimerId = setTimeout(() => {
      stopTimerId = null;
      stopTone();
    }, remaining);
  }
</script>

<!-- svelte:head の中に書いたものは、ページの「head」（画面には出ない、ページについての情報を書く場所）に入る -->
<svelte:head>
  <!-- title：ブラウザのタブと、検索結果の見出しに出る -->
  <title>指板の図（ポジションごとの音の場所）｜バイオリン音程チェック</title>

  <!-- description：検索結果で、見出しの下に出る説明文 -->
  <meta name="description" content="バイオリンの第1〜第7ポジションで、調ごとの音階の音が指板のどこにあるかを図で表示します。音名と指番号を切り替えられ、印を押すと、その音が鳴ります。" />
</svelte:head>

<main>
  <!-- 画面の上の行：ホームへ戻るリンクと、ページのタイトルを横に並べる -->
  <div class="header-row">
    <a class="back-link" href="/">← ホーム</a>
    <h1>指板の図</h1>
  </div>

  <!-- 調のメニューと、印の中に書くものの切り替えを横に並べる -->
  <div class="control-row">
    <!-- 調のメニュー。aria-label は、読み上げで操作する人のための、メニューの説明 -->
    <!-- bind:value を付けると、選んだ調の id が keyId に自動で入る -->
    <select class="key-select" aria-label="調" bind:value={keyId}>
      <!-- optgroup は、メニューの中の見出し付きのグループ -->
      <optgroup label="長調">
        {#each majorKeys as key (key.id)}
          <option value={key.id}>{getKeyLabel(key)}</option>
        {/each}
      </optgroup>
      <optgroup label="短調">
        {#each minorKeys as key (key.id)}
          <option value={key.id}>{getKeyLabel(key)}</option>
        {/each}
      </optgroup>
    </select>

    <!-- 印の中に書くものの切り替え（音名・指番号） -->
    {#each LABEL_MODES as mode (mode.id)}
      <!-- 選択中のほうに selected クラスを付けて色を変える -->
      <button class="choice" class:selected={labelMode === mode.id} onclick={() => (labelMode = mode.id)}>
        {mode.name}
      </button>
    {/each}
  </div>

  <!-- 選択中の調の音階 -->
  <p class="scale">{scaleNames.join(" ")}</p>

  <!-- ポジションのメニューと、音律のメニューを横に並べる -->
  <div class="menu-row">
    <!-- ポジションのメニュー。bind:value で、選んだポジションの番号が positionId に入る -->
    <select class="position-select" aria-label="ポジション" bind:value={positionId}>
      {#each POSITIONS as position (position.id)}
        <option value={position.id}>{position.name}</option>
      {/each}
    </select>

    <!-- 音律のメニュー（印を押したときの、音の高さを決める）。bind:value で、選んだ音律の id が temperamentId に入る -->
    <select class="temperament-select" aria-label="音律" bind:value={temperamentId}>
      {#each TEMPERAMENTS as temperament (temperament.id)}
        <option value={temperament.id}>{temperament.name}</option>
      {/each}
    </select>
  </div>

  <!-- 押した音の表示：まだ押していないときは、押せることを案内する -->
  <p class="played-info">
    {#if selectedMarker === null}
      印や点を押すと、音が鳴ります
    {:else}
      <!-- どの弦の、何の音か -->
      <strong>{STRINGS[selectedMarker.stringIndex].id}線 {noteToText(selectedMarker.note)}</strong>

      <!-- 開放弦か、何の指で押さえるか -->
      {selectedMarker.semitones === 0 ? "開放弦" : selectedMarker.finger + "の指"}

      <!-- 鳴らした周波数（小数第1位まで） -->
      {playedFrequency.toFixed(1)} Hz
    {/if}
  </p>

  <!-- 指板の図（調・ポジション・印の中に書くもの・選択中の印を渡す） -->
  <!-- マウスでクリックされたら playMarker（短く鳴らす）を呼んでもらう -->
  <!-- 指で押されたら startHold（鳴らしはじめる）、指が離れたら stopHold（止める）を呼んでもらう -->
  <Fingerboard key={currentKey} position={positionId} {labelMode} {selectedId} onselect={playMarker} onpress={startHold} onrelease={stopHold} />

  <!-- 図の見方 -->
  <ul class="legend">
    <li><span class="sample tonic"></span>主音（音階の最初の音）</li>
    <li><span class="sample"></span>音階の音</li>
    <li><span class="sample open"></span>開放弦（指で押さえない）</li>
    <li><span class="sample outside"></span>音階にない音（押すと鳴る）</li>
  </ul>

  <p class="note">
    印の位置は、半音ごとの目安です（実際の指の間隔は、高い音ほど少しずつ狭くなります）。<br />
    第2ポジションより上では、ナットと最初の行の間を省略しています（ギザギザの切れ目）。開放弦は、どのポジションでも一番上に出します。<br />
    それぞれのポジションの一番上の行は、1の指をナットのほうへ引いて押さえる場所です。<br />
    開放弦は、調弦の高さ（ラ＝442Hz から5度ずつ）で鳴ります。それ以外は、選んだ調と音律での高さで鳴ります。<br />
    音階にない音は、♯ の付く調と調号のない調では ♯ の音として、♭ の付く調では ♭ の音として扱います。<br />
    指番号の 0 は開放弦です。♯や♭の多い調では、指番号は目安として見てください。<br />
    短調は、調号どおりの音（自然短音階）を表示しています。
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
    margin-bottom: 8px;
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

  /* 調のメニューと、切り替えのボタンを横に並べる */
  .control-row {
    display: flex;
    gap: 6px;
  }

  /* 調のメニュー：残りの横幅を使う。指で押しやすい大きさにする */
  .key-select {
    flex: 1;
    /* min-width: 0 を付けると、中の文字が長くても、ボタンを押し出さずに縮む */
    min-width: 0;
    padding: 8px 4px;
    font-size: 0.95rem;
    border: 1px solid #bdbdbd;
    border-radius: 8px;
    background-color: white;
  }

  /* 切り替えのボタン（選択前）：白地に青い枠 */
  button.choice {
    flex-shrink: 0;
    padding: 8px 12px;
    font-size: 0.9rem;
    color: #1976d2;
    background-color: white;
    border: 2px solid #1976d2;
    border-radius: 8px;
    cursor: pointer;
  }

  /* 切り替えのボタン（選択中）：青く塗る */
  button.choice.selected {
    color: white;
    background-color: #1976d2;
  }

  /* 選択中の調の音階：小さくグレーで表示する */
  .scale {
    margin: 6px 0 10px 0;
    font-size: 0.85rem;
    color: #616161;
  }

  /* ポジションのメニューと、音律のメニューを横に並べる */
  .menu-row {
    display: flex;
    gap: 6px;
  }

  /* ポジションと音律のメニュー共通：指で押しやすい大きさにする */
  .position-select,
  .temperament-select {
    /* min-width: 0 を付けると、中の文字が長くても、決めた割合より広がらない */
    min-width: 0;
    padding: 8px 4px;
    font-size: 0.9rem;
    border: 1px solid #bdbdbd;
    border-radius: 8px;
    background-color: white;
  }

  /* ポジションのメニュー：名前が長いので、音律のメニューより広くする（横幅を 3：2 に分ける） */
  .position-select {
    flex: 3;
  }

  /* 音律のメニュー */
  .temperament-select {
    flex: 2;
  }

  /* 押した音の表示 */
  .played-info {
    margin: 8px 0;
    font-size: 0.85rem;
    color: #616161;
    /* 数字の幅をそろえて、値が変わっても表示が左右に揺れないようにする */
    font-variant-numeric: tabular-nums;
  }

  /* 押した音の、弦と音名：黒い太字 */
  .played-info strong {
    color: #212121;
  }

  /* 図の見方：横に並べて、入りきらないときは折り返す */
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
    margin: 12px 0 0 0;
    padding: 0;
    font-size: 0.8rem;
    color: #424242;
    /* リストの先頭の「・」を消す */
    list-style: none;
  }

  /* 図の見方の1つぶん：見本の丸と文字を横に並べる */
  .legend li {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  /* 見本の丸（音階の音）：青 */
  .sample {
    display: inline-block;
    width: 14px;
    height: 14px;
    background-color: #1976d2;
    border: 2px solid #1976d2;
    border-radius: 50%;
    /* 枠の太さを、幅と高さの中に含める（丸の大きさが変わらないようにする） */
    box-sizing: border-box;
  }

  /* 見本の丸（主音）：オレンジ */
  .sample.tonic {
    background-color: #ef6c00;
    border-color: #ef6c00;
  }

  /* 見本の丸（開放弦）：白地に青い枠 */
  .sample.open {
    background-color: white;
  }

  /* 見本の点（音階にない音）：小さなグレーの丸 */
  .sample.outside {
    width: 9px;
    height: 9px;
    background-color: #9e9e9e;
    border-color: #9e9e9e;
  }

  /* 注意書き：小さくグレーで表示する */
  .note {
    margin: 10px 0 0 0;
    font-size: 0.75rem;
    line-height: 1.6;
    color: #757575;
  }
</style>
