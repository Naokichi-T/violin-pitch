<script>
  // 楽譜のデータに関する設定値と関数を読み込む
  import { STEP_NAMES, OCTAVES, isInRange, noteToText } from "#lib/score.js";

  // 調のデータに関する設定値と関数を読み込む
  import { KEYS, DEFAULT_KEY_ID, getKey, getKeyLabel, getScaleNames } from "#lib/key.js";

  // 五線譜を描く部品を読み込む
  import Staff from "#lib/Staff.svelte";

  // ===== メニューに並べる調の一覧（長調と短調に分けておく） =====

  // 長調だけを取り出した一覧
  const majorKeys = KEYS.filter((key) => key.mode === "major");

  // 短調だけを取り出した一覧
  const minorKeys = KEYS.filter((key) => key.mode === "minor");

  // ===== 画面に表示する値（$state を付けると、値が変わったとき画面も自動で更新される） =====

  // 登録した音の並び（音のデータの配列）。最初は空
  let notes = $state([]);

  // 選択中の調の id（最初はハ長調）
  let keyId = $state(DEFAULT_KEY_ID);

  // 選択中の調のデータ
  // $derived を付けると、keyId が変わるたびに自動で探し直される
  let currentKey = $derived(getKey(keyId));

  // 選択中の調の音階（文字の配列）。例：['ラ', 'シ', 'ド♯', 'レ', 'ミ', 'ファ♯', 'ソ♯', 'ラ']
  let scaleNames = $derived(getScaleNames(currentKey));

  // 選択中のオクターブ（最初は4）
  let selectedOctave = $state(4);

  // 選択中の変化記号（1 が♯、-1 が♭、0 がなし）。最初はなし
  let selectedAccidental = $state(0);

  /**
   * 今選んでいるオクターブと変化記号で、音のデータを作る関数
   * 実際に追加するときと、ボタンを押せるかどうかを調べるときの両方で使う。
   * @param {number} step - 音名の番号（0〜6。0 がド、6 がシ）
   * @returns {{step: number, accidental: number, octave: number}} 音のデータ
   */
  function createNote(step) {
    return {
      step: step,
      accidental: selectedAccidental,
      octave: selectedOctave,
    };
  }

  /**
   * 音を追加する関数
   * 音名ボタンを押したときに呼ばれる。
   * 今選んでいるオクターブと変化記号で音を作り、並びの最後に追加する。
   * @param {number} step - 音名の番号（0〜6。0 がド、6 がシ）
   */
  function addNote(step) {
    // 音のデータを作る
    const note = createNote(step);

    // 音域の外の音は追加しない（ボタンも押せなくしているが、念のためここでも確認する）
    if (!isInRange(note)) {
      return;
    }

    // 並びの最後に追加する
    notes.push(note);

    // 変化記号の選択を解除する（♯・♭は次の1音にだけ付けるため）
    selectedAccidental = 0;
  }

  /**
   * 変化記号の選択を切り替える関数
   * ♯ボタン・♭ボタンを押したときに呼ばれる。
   * すでに選ばれているものをもう一度押すと、解除される。
   * @param {number} value - 押したボタンの変化記号（1 が♯、-1 が♭）
   */
  function toggleAccidental(value) {
    if (selectedAccidental === value) {
      // 同じものをもう一度押したとき：解除する
      selectedAccidental = 0;
    } else {
      // 選ばれていないものを押したとき：それを選ぶ
      selectedAccidental = value;
    }
  }

  /**
   * 最後の1音を消す関数
   * 「1つ消す」ボタンを押したときに呼ばれる。
   */
  function removeLastNote() {
    // 並びの最後の1つを取り除く
    notes.pop();
  }
</script>

<main>
  <!-- ホームへ戻るリンク -->
  <a class="back-link" href="/">← ホーム</a>

  <h1>楽譜の編集</h1>

  <!-- 調の選択 -->
  <div class="key-area">
    <label class="key-label" for="key-select">調</label>

    <!-- bind:value を付けると、選んだ調の id が keyId に自動で入る -->
    <select id="key-select" class="key-select" bind:value={keyId}>
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
  </div>

  <!-- 選択中の調の音階（どの音に♯・♭が付くかを確認するための表示） -->
  <p class="scale">{scaleNames.join(" ")}</p>

  <!-- 五線譜（登録した音の並びと、調号の数を渡して表示する） -->
  <Staff {notes} signature={currentKey.signature} />

  <!-- 登録した音の一覧（確認用として、五線譜の下に文字でも表示する） -->
  <div class="note-list">
    {#if notes.length === 0}
      <span class="empty">まだ音がありません</span>
    {:else}
      <!-- 音を1つずつ取り出して、文字にして並べる -->
      {#each notes as note, index (index)}
        <span class="note-item">{noteToText(note)}</span>
      {/each}
    {/if}
  </div>

  <!-- 登録した音の数 -->
  <p class="note-count">（{notes.length}音）</p>

  <!-- オクターブの選択 -->
  <p class="label">オクターブ</p>
  <div class="button-row">
    {#each OCTAVES as octave (octave)}
      <!-- 選択中のオクターブには selected クラスを付けて色を変える -->
      <button class="choice" class:selected={selectedOctave === octave} onclick={() => (selectedOctave = octave)}>
        {octave}
      </button>
    {/each}
  </div>

  <!-- 変化記号の選択（押すと次の1音にだけ付く。もう一度押すと解除） -->
  <p class="label">変化記号（次の1音にだけ付きます）</p>
  <div class="button-row">
    <button class="choice" class:selected={selectedAccidental === 1} onclick={() => toggleAccidental(1)}> ♯ </button>
    <button class="choice" class:selected={selectedAccidental === -1} onclick={() => toggleAccidental(-1)}> ♭ </button>
  </div>

  <!-- 音名ボタン（押すと音が追加される） -->
  <p class="label">音名</p>
  <div class="step-row">
    {#each STEP_NAMES as stepName, step (step)}
      <!-- 今の選択で音域の外になる音は、ボタンを押せなくする -->
      <button class="step" disabled={!isInRange(createNote(step))} onclick={() => addNote(step)}>
        {stepName}
      </button>
    {/each}
  </div>

  <!-- 最後の1音を消すボタン（音が1つもないときは押せない） -->
  <button class="remove" disabled={notes.length === 0} onclick={removeLastNote}>1つ消す</button>
</main>

<style>
  /* 画面全体：スマホで見やすいように幅を制限して中央に寄せる */
  main {
    max-width: 480px;
    margin: 0 auto;
    padding: 24px 16px;
    font-family: sans-serif;
  }

  /* ホームへ戻るリンク */
  .back-link {
    display: inline-block;
    margin-bottom: 16px;
    color: #1976d2;
    text-decoration: none;
  }

  /* タイトル */
  h1 {
    font-size: 1.4rem;
    margin: 0 0 24px 0;
  }

  /* 調の選択のエリア：「調」の文字とメニューを横に並べる */
  .key-area {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  /* 「調」の文字 */
  .key-label {
    font-size: 0.9rem;
    color: #424242;
    flex-shrink: 0;
  }

  /* 調を選ぶメニュー：残りの横幅いっぱいに広げ、指で押しやすい大きさにする */
  .key-select {
    flex-grow: 1;
    padding: 10px 8px;
    font-size: 1rem;
    border: 1px solid #bdbdbd;
    border-radius: 8px;
    background-color: white;
  }

  /* 選択中の調の音階：小さくグレーで表示する */
  .scale {
    margin: 8px 0 0 0;
    font-size: 0.9rem;
    color: #616161;
  }

  /* 登録した音の一覧：枠で囲み、音を横に並べて端で折り返す */
  .note-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    min-height: 48px;
    padding: 12px;
    border: 1px solid #bdbdbd;
    border-radius: 8px;
  }

  /* 音が1つもないときのメッセージ */
  .empty {
    color: #757575;
  }

  /* 一覧の中の1音 */
  .note-item {
    padding: 4px 8px;
    font-size: 1.1rem;
    background-color: #e3f2fd;
    border-radius: 4px;
  }

  /* 登録した音の数 */
  .note-count {
    margin: 4px 0 0 0;
    font-size: 0.9rem;
    color: #757575;
    text-align: right;
  }

  /* 各ボタンの上に付ける見出し */
  .label {
    margin: 20px 0 8px 0;
    font-size: 0.9rem;
    color: #424242;
  }

  /* オクターブと変化記号のボタンを横に並べる */
  .button-row {
    display: flex;
    gap: 8px;
  }

  /* 音名ボタンを7つ、同じ幅で横に並べる */
  .step-row {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 4px;
  }

  /* ボタン共通：指で押しやすい大きさにする */
  button {
    padding: 14px 0;
    font-size: 1.1rem;
    border-radius: 8px;
    cursor: pointer;
  }

  /* 押せない状態のボタン：薄く表示する */
  button:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  /* オクターブと変化記号のボタン（選択前）：白地に青い枠 */
  button.choice {
    flex: 1;
    color: #1976d2;
    background-color: white;
    border: 2px solid #1976d2;
  }

  /* オクターブと変化記号のボタン（選択中）：青く塗る */
  button.choice.selected {
    color: white;
    background-color: #1976d2;
  }

  /* 音名ボタン：緑 */
  button.step {
    color: white;
    background-color: #2e7d32;
    border: none;
    /* 「ファ」が2文字なので、狭い画面でも収まるように少し小さくする */
    font-size: 1rem;
  }

  /* 「1つ消す」ボタン：赤。横幅いっぱいに表示する */
  button.remove {
    width: 100%;
    margin-top: 24px;
    color: white;
    background-color: #c62828;
    border: none;
  }
</style>
