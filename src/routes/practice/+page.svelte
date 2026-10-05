<script>
  // onMount：このページが画面に表示された直後に処理をするための仕組み
  import { onMount } from "svelte";

  // 調のデータに関する設定値と関数を読み込む
  import { DEFAULT_KEY_ID, getKey, getKeyLabel } from "#lib/key.js";

  // 音律の最初の設定と、音律のデータを探す関数を読み込む
  import { DEFAULT_TEMPERAMENT_ID, getTemperament } from "#lib/tuning.js";

  // 保存された音律・作業中の楽譜・判定のレベル・開放弦の設定を、ブラウザから読み込む関数と、
  // 判定のレベル・開放弦の設定をブラウザに保存する関数を読み込む
  import { loadTemperamentId, loadCurrentScore, loadLevelId, saveLevelId, loadOpenStringEnabled, saveOpenStringEnabled } from "#lib/settings.js";

  // 判定のレベルの一覧と、レベルのデータを探す関数を読み込む
  import { LEVELS, DEFAULT_LEVEL_ID, getLevel } from "#lib/level.js";

  // 「じっくり」モードの練習の部品を読み込む
  import StepPractice from "#lib/StepPractice.svelte";

  // 「通し」モードの練習の部品を読み込む
  import RunPractice from "#lib/RunPractice.svelte";

  // ===== 練習のモードに関する設定値 =====

  // 選べる練習のモードの一覧
  //   id          ：モードを区別するための名前
  //   name        ：画面に表示する名前
  //   description ：どんな練習なのかの短い説明
  const MODES = [
    { id: "step", name: "じっくり", description: "合うまで次へ進まない" },
    { id: "run", name: "通し", description: "テンポに合わせて弾く。点数が出る" },
  ];

  // ===== 画面に表示する値（$state を付けると、値が変わったとき画面も自動で更新される） =====

  // 練習する楽譜の音の並び（音のデータの配列）。画面に表示された後で、保存された楽譜を読み込む
  let notes = $state([]);

  // 楽譜の調の id
  let keyId = $state(DEFAULT_KEY_ID);

  // 楽譜のテンポ（1分間の拍の数）。「通し」モードで使う
  let tempo = $state(60);

  // 音律の id
  let temperamentId = $state(DEFAULT_TEMPERAMENT_ID);

  // 保存された楽譜の読み込みが終わったかどうか（true：終わった、false：まだ）
  // 読み込む前に「楽譜がありません」と表示されてしまうのを防ぐための目印
  let isLoaded = $state(false);

  // 選択中の練習のモードの id（'step'：じっくり、'run'：通し）
  let modeId = $state("step");

  // 選択中の判定のレベルの id（'normal'：ノーマル、'easy'：イージー）
  // 最初は決まった設定にしておき、画面に表示された後で、保存された設定に入れ替える
  let levelId = $state(DEFAULT_LEVEL_ID);

  // 「開放弦の高さで弾いた音もOKにする」設定（true：する、false：しない）
  // 最初は「する」にしておき、画面に表示された後で、保存された設定に入れ替える
  let openStringEnabled = $state(true);

  // 開放弦の設定の説明を表示しているかどうか（true：表示している）。「？」ボタンで切り替える
  let showsOpenStringHelp = $state(false);

  // 調のデータ
  // $derived を付けると、keyId が変わるたびに自動で探し直される
  let currentKey = $derived(getKey(keyId));

  // 音律のデータ（名前を表示するために使う）
  let currentTemperament = $derived(getTemperament(temperamentId));

  // 「OK」とする範囲（セント）。目標の音とのズレがこの範囲に入っていれば OK
  // 選択中のレベルによって変わる（ノーマルは 10、イージーは 25）
  let tolerance = $derived(getLevel(levelId).tolerance);

  // 開放弦の設定を、画面に表示するかどうか（純正律のときだけ表示する）
  // ピタゴラス音律は開放弦と同じ高さになり、平均律も差がごく小さいので、設定が必要なのは純正律だけ
  let showsOpenStringSetting = $derived(temperamentId === "just");

  // 開放弦の高さで弾いた音を、実際に OK にするかどうか
  // 設定が画面に出ていて（純正律で）、チェックが入っているときだけ true になる
  let allowOpenString = $derived(showsOpenStringSetting && openStringEnabled);

  // このページが画面に表示された直後に、保存された音律・判定のレベル・楽譜をブラウザから読み込む
  // （ブラウザの保存領域は、画面に表示された後でないと使えないため、ここで読み込む）
  onMount(() => {
    temperamentId = loadTemperamentId();
    levelId = loadLevelId();
    openStringEnabled = loadOpenStringEnabled();

    // 作業中の楽譜を読み込む（保存されていないときは null が入り、何もしない）
    const savedScore = loadCurrentScore();
    if (savedScore !== null) {
      // 調（一覧にない id が保存されていた場合は、getKey がハ長調にしてくれる）
      keyId = getKey(savedScore.keyId).id;

      // テンポ
      tempo = savedScore.tempo;

      // 音の並び
      notes = savedScore.notes;
    }

    // 読み込みが終わった
    isLoaded = true;
  });

  /**
   * 判定のレベルを切り替える関数
   * 「ノーマル」「イージー」のボタンを押したときに呼ばれる。
   * 選んだレベルに切り替えて、次に開いたときのためにブラウザに保存する。
   * @param {string} id - 選んだレベルの id（'normal'・'easy'）
   */
  function changeLevel(id) {
    // 選んだレベルに切り替える（これで、OK の範囲も自動で計算し直される）
    levelId = id;

    // ブラウザに保存する
    saveLevelId(id);
  }

  /**
   * 「開放弦の高さで弾いた音もOKにする」設定を切り替える関数
   * チェックボックスを押したときに呼ばれる。
   * 設定を切り替えて、次に開いたときのためにブラウザに保存する。
   * @param {boolean} enabled - チェックが入っているかどうか（true：入っている）
   */
  function changeOpenStringEnabled(enabled) {
    openStringEnabled = enabled;

    // ブラウザに保存する
    saveOpenStringEnabled(enabled);
  }
</script>

<main>
  <!-- 画面の上の行：ホームへ戻るリンクと、ページのタイトルを横に並べる -->
  <div class="header-row">
    <a class="back-link" href="/">← ホーム</a>
    <h1>練習</h1>
  </div>

  {#if !isLoaded}
    <!-- 楽譜を読み込むまでの、ごく短い間の表示 -->
    <p class="message">読み込み中…</p>
  {:else if notes.length === 0}
    <!-- 楽譜に音が1つもないとき：編集ページへ案内する -->
    <p class="message">楽譜に音がありません。先に音を入れてください。</p>
    <a class="link-button" href="/score">楽譜の編集へ</a>
  {:else}
    <!-- 楽譜の調と音律（編集ページで決めたものを表示するだけで、ここでは変えられない） -->
    <p class="score-info">{getKeyLabel(currentKey)}・{currentTemperament.name}</p>

    <!-- 練習のモードの切り替え：名前と短い説明を付けたボタンを横に並べる -->
    <div class="mode-row">
      {#each MODES as mode (mode.id)}
        <!-- 選択中のモードには selected クラスを付けて色を変える -->
        <button class="mode-button" class:selected={modeId === mode.id} onclick={() => (modeId = mode.id)}>
          <span class="mode-name">{mode.name}</span>
          <span class="mode-description">{mode.description}</span>
        </button>
      {/each}
    </div>

    <!-- 判定のレベルの切り替え（ノーマル・イージー） -->
    <div class="level-row">
      <span class="level-caption">判定</span>

      {#each LEVELS as level (level.id)}
        <!-- 選択中のレベルには selected クラスを付けて色を変える -->
        <!-- ボタンには、レベルの名前と、OK の範囲（±10 など）を表示する -->
        <button class="level-button" class:selected={levelId === level.id} onclick={() => changeLevel(level.id)}>
          {level.name}（±{level.tolerance}）
        </button>
      {/each}
    </div>

    <!-- 開放弦の設定：純正律のときだけ表示する -->
    {#if showsOpenStringSetting}
      <!-- チェックボックスと「？」ボタンを横に並べる -->
      <div class="open-string-row">
        <!-- label で囲むと、文字の部分を押してもチェックを切り替えられる -->
        <label class="open-string-label">
          <!-- event.currentTarget.checked は、押したあとにチェックが入っているかどうか -->
          <input type="checkbox" checked={openStringEnabled} onchange={(event) => changeOpenStringEnabled(event.currentTarget.checked)} />
          開放弦の高さで弾いた音もOKにする（ソ3・レ4・ラ4・ミ5）
        </label>

        <!-- 「？」ボタン：押すたびに、説明を表示する・隠すを切り替える -->
        <!-- label の外に置いているのは、中に置くと、押したときにチェックまで切り替わってしまうため -->
        <!-- aria-label と aria-expanded は、読み上げで操作する人のための設定（ボタンの説明と、開いているかどうか） -->
        <button class="help-button" aria-label="開放弦の設定の説明" aria-expanded={showsOpenStringHelp} onclick={() => (showsOpenStringHelp = !showsOpenStringHelp)}> ？ </button>
      </div>

      <!-- 説明：「？」ボタンを押して、表示にしているときだけ出す -->
      {#if showsOpenStringHelp}
        <p class="help-text">
          開放弦（指で押さえない弦）は、調弦で高さが決まっていて、弾きながら変えられません。<br />
          純正律では、調によって、ソ3・レ4・ラ4・ミ5 の「正しい高さ」が開放弦の高さと少し違うことがあります（最大で約22セント）。<br />
          チェックを入れると、この4つの音は、開放弦の高さで弾いても正解になります。隣の弦で純正律の高さで弾いても、もちろん正解です。
        </p>
      {/if}
    {/if}

    <!-- 選択中のモードの練習の部品を表示する -->
    <!-- モードを切り替えると、前のモードの部品は画面から消え、マイクも自動で止まる -->
    {#if modeId === "step"}
      <!-- 「じっくり」モード：楽譜・調・音律・OK の範囲を渡す -->
      <StepPractice {notes} {currentKey} {temperamentId} {tolerance} />
    {:else}
      <!-- 「通し」モード：楽譜・調・最初のテンポ・音律・OK の範囲・開放弦を OK にするかどうかを渡す -->
      <RunPractice {notes} {currentKey} initialTempo={tempo} {temperamentId} {tolerance} {allowOpenString} />
    {/if}

    <!-- 編集ページへのリンク -->
    <a class="edit-link" href="/score">楽譜を編集する</a>
  {/if}
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
    color: #1976d2;
    font-size: 0.9rem;
    text-decoration: none;
  }

  /* タイトル */
  h1 {
    font-size: 1.1rem;
    margin: 0;
  }

  /* 「読み込み中」「楽譜に音がありません」などのメッセージ */
  .message {
    margin: 24px 0 12px 0;
    color: #616161;
  }

  /* 編集ページへ案内するリンク（ボタンのような見た目にする） */
  .link-button {
    display: block;
    padding: 12px;
    color: white;
    background-color: #1976d2;
    border-radius: 8px;
    text-align: center;
    text-decoration: none;
  }

  /* 楽譜の調と音律：小さくグレーで表示する */
  .score-info {
    margin: 0;
    font-size: 0.85rem;
    color: #616161;
  }

  /* 練習のモードの切り替え：2つのボタンを横に並べる */
  .mode-row {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }

  /* ボタン共通 */
  button {
    border-radius: 8px;
    cursor: pointer;
  }

  /* モードのボタン（選択前）：白地に青い枠。名前と説明を縦に並べる */
  button.mode-button {
    /* 2つのボタンで横幅を半分ずつ使う。flex: 1 だけだと中の文字の長さで幅が変わるので、基準の幅を 0 にする */
    flex: 1 1 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 8px 4px;
    color: #1976d2;
    background-color: white;
    border: 2px solid #1976d2;
  }

  /* モードのボタン（選択中）：青く塗る */
  button.mode-button.selected {
    color: white;
    background-color: #1976d2;
  }

  /* モードの名前：大きめの太字 */
  .mode-name {
    font-size: 1.1rem;
    font-weight: bold;
  }

  /* モードの説明：小さい字 */
  .mode-description {
    font-size: 0.75rem;
  }

  /* 判定のレベルの切り替え：「判定」の文字と、2つのボタンを横に並べる */
  .level-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
  }

  /* 「判定」の文字 */
  .level-caption {
    font-size: 0.85rem;
    color: #616161;
    flex-shrink: 0;
  }

  /* レベルのボタン（選択前）：白地に青い枠。小さめにする */
  button.level-button {
    flex: 1;
    padding: 6px 0;
    font-size: 0.9rem;
    color: #1976d2;
    background-color: white;
    border: 2px solid #1976d2;
  }

  /* レベルのボタン（選択中）：青く塗る */
  button.level-button.selected {
    color: white;
    background-color: #1976d2;
  }

  /* 開放弦の設定の行：チェックボックスの部分と「？」ボタンを横に並べる */
  .open-string-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
  }

  /* チェックボックスと文字：横に並べ、小さくグレーで表示する */
  .open-string-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.85rem;
    color: #616161;
    cursor: pointer;
  }

  /* 「？」ボタン：小さな丸いボタンにする */
  button.help-button {
    /* 横幅が足りないときも、つぶれて楕円にならないようにする */
    flex-shrink: 0;
    width: 26px;
    height: 26px;
    padding: 0;
    font-size: 0.85rem;
    font-weight: bold;
    line-height: 1;
    color: #1976d2;
    background-color: white;
    border: 2px solid #1976d2;
    /* 50% にすると、正方形が丸になる */
    border-radius: 50%;
  }

  /* 説明の文章：薄い青の地に、小さめの文字で表示する */
  .help-text {
    margin: 6px 0 0 0;
    padding: 8px 10px;
    font-size: 0.8rem;
    line-height: 1.6;
    color: #424242;
    background-color: #e3f2fd;
    border-radius: 8px;
  }

  /* 編集ページへのリンク：小さく、右に寄せて表示する */
  .edit-link {
    display: block;
    margin-top: 16px;
    color: #1976d2;
    font-size: 0.9rem;
    text-align: right;
    text-decoration: none;
  }
</style>
