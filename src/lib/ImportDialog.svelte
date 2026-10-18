<script>
  // MusicXML を読み込むときに出す窓の部品（ステップA-1a）
  // 名前・パート・長調か短調かを選んでもらい、知らせること（重音・判定から外す音など）を表示する。
  // ［読み込む］を押すと、保存する楽譜の形を作って、使う側（読み込んだ楽譜の一覧ページ）に渡す。

  // untrack：値を「最初の1回だけ」読むための仕組み（下の name などで使う）
  import { untrack } from "svelte";

  // 調の名前を作る関数を読み込む
  import { getKeyLabel } from "#lib/key.js";

  // パートの一覧・調の候補・最初の名前・知らせることを作る関数と、保存する形を作る関数を読み込む
  import { getPartChoices, getKeyChoices, getDefaultName, analyzePart, buildImportedScore } from "#lib/imported.js";

  // この部品を使う側から受け取る値
  // score    ：楽譜作成アプリの形の楽譜データ（musicXMLToScore で読み込んだもの）
  // warnings ：読み込みのときに分かった、知らせることの文の配列（musicXMLToScore が返したもの）
  // onconfirm：［読み込む］を押したときに呼ぶ関数。保存する楽譜の形を渡す
  // oncancel ：［やめる］を押したときに呼ぶ関数
  let { score, warnings, onconfirm, oncancel } = $props();

  // ===== 選ぶもの（$state を付けると、値が変わったとき画面も自動で更新される） =====

  // パートの一覧（パートの番号と名前）
  // untrack で囲むのは、「窓を開いたときの楽譜で1回だけ作る」ことをSvelteにはっきり伝えるため
  const partChoices = untrack(() => getPartChoices(score));

  // 調の候補（[長調, 長調と同じ調号の短調]）
  const keyChoices = untrack(() => getKeyChoices(score));

  // 選んだパートの番号（最初は1つ目のパート）
  let partIndex = $state(0);

  // 選んだ調の id（最初は長調）
  let keyId = $state(untrack(() => keyChoices[0].id));

  // 名前（最初は「タイトル（1つ目のパート名）」）
  let name = $state(untrack(() => getDefaultName(score, 0)));

  // 名前を自分で書き換えたかどうか（true：書き換えた）
  // 書き換えていなければ、パートを選び直したときに、名前も「タイトル（そのパート名）」に変える
  let isNameEdited = $state(false);

  // 選んだパートを調べた結果（知らせる文と、判定できる音の数）
  // $derived を付けると、partIndex が変わるたびに自動で計算し直される
  let analysis = $derived(analyzePart(score, partIndex));

  // 窓に出す、知らせる文の全部（読み込みのときに分かったこと ＋ 選んだパートを調べて分かったこと）
  let allNotices = $derived([...warnings, ...analysis.notices]);

  // ［読み込む］を押せるかどうか（名前が空でなく、判定できる音が1つ以上あるとき）
  // trim() は、前後の空白を取りのぞく命令
  let canConfirm = $derived(name.trim() !== "" && analysis.judgeableCount > 0);

  /**
   * パートを選び直したときに呼ばれる関数
   * 名前を自分で書き換えていなければ、名前も「タイトル（そのパート名）」に変える。
   */
  function handlePartChange() {
    if (!isNameEdited) {
      name = getDefaultName(score, partIndex);
    }
  }

  /**
   * 名前の欄に文字を入力したときに呼ばれる関数
   * 自分で書き換えた印を付ける（パートを選び直しても、名前を変えないようにするため）。
   */
  function handleNameInput() {
    isNameEdited = true;
  }

  /**
   * ［読み込む］を押したときに呼ばれる関数
   * 保存する楽譜の形を作って、使う側に渡す。
   */
  function confirmImport() {
    onconfirm(buildImportedScore(score, partIndex, keyId, name.trim()));
  }
</script>

<!-- 窓の後ろの、画面全体をうすく暗くする部分 -->
<div class="backdrop">
  <!-- 窓 -->
  <!-- role="dialog" と aria-modal は、読み上げで操作する人に「窓が開いている」と伝えるための印 -->
  <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="import-dialog-title">
    <h2 id="import-dialog-title">MusicXMLの読み込み</h2>

    <!-- 名前 -->
    <label class="field">
      <span class="field-label">名前</span>
      <!-- bind:value を付けると、入力した文字が name に自動で入る -->
      <input class="text-input" type="text" bind:value={name} oninput={handleNameInput} />
    </label>

    <!-- パート：パートが2つ以上あるときだけ選ばせる -->
    {#if partChoices.length > 1}
      <label class="field">
        <span class="field-label">練習するパート</span>
        <select class="select" bind:value={partIndex} onchange={handlePartChange}>
          {#each partChoices as choice (choice.index)}
            <option value={choice.index}>{choice.name}</option>
          {/each}
        </select>
      </label>
    {:else}
      <!-- パートが1つのとき：名前だけ表示する -->
      <p class="field">
        <span class="field-label">パート</span>
        <span>{partChoices[0].name}</span>
      </p>
    {/if}

    <!-- 長調か短調か：同じ調号の2つから選ぶ -->
    <fieldset class="field">
      <legend class="field-label">調（純正律の計算に使います）</legend>
      <div class="key-choices">
        {#each keyChoices as key (key.id)}
          <!-- bind:group を付けると、選んだほうの value（調の id）が keyId に自動で入る -->
          <label class="key-choice">
            <input type="radio" name="import-key" value={key.id} bind:group={keyId} />
            {getKeyLabel(key)}
          </label>
        {/each}
      </div>
    </fieldset>

    <!-- 知らせること：1つ以上あるときだけ表示する -->
    {#if allNotices.length > 0}
      <ul class="notices">
        {#each allNotices as notice}
          <li>{notice}</li>
        {/each}
      </ul>
    {/if}

    <!-- 判定できる音が1つもないときの注意 -->
    {#if analysis.judgeableCount === 0}
      <p class="error">このパートには、判定できる音がありません。ほかのパートを選んでください。</p>
    {/if}

    <!-- やめる・読み込むのボタン -->
    <div class="button-row">
      <button class="cancel-button" onclick={oncancel}>やめる</button>
      <button class="confirm-button" disabled={!canConfirm} onclick={confirmImport}>読み込む</button>
    </div>
  </div>
</div>

<style>
  /* 窓の後ろ：画面全体をおおって、うすく暗くする */
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    background-color: rgba(0, 0, 0, 0.4);
  }

  /* 窓：白い角丸の四角。中身が多いときは窓の中でスクロールする */
  .dialog {
    width: 100%;
    max-width: 440px;
    max-height: 100%;
    overflow-y: auto;
    padding: 16px;
    background-color: white;
    border-radius: 12px;
    box-sizing: border-box;
    font-family: sans-serif;
  }

  /* 窓のタイトル */
  h2 {
    margin: 0 0 12px 0;
    font-size: 1.1rem;
  }

  /* 項目1つぶん（名前・パート・調）：縦に並べる */
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 0 0 12px 0;
    padding: 0;
    border: none;
  }

  /* 項目の名前：小さくグレーで表示する */
  .field-label {
    padding: 0;
    font-size: 0.85rem;
    color: #616161;
  }

  /* 名前の入力欄・パートのメニュー：指で押しやすい大きさにする */
  /* font-size を 16px 以上にしておくと、iPhone で入力欄を押したときに画面が勝手に拡大されない */
  .text-input,
  .select {
    padding: 8px;
    font-size: 16px;
    border: 1px solid #bdbdbd;
    border-radius: 8px;
    background-color: white;
  }

  /* 調の2つの選択肢：縦に並べる */
  .key-choices {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  /* 調の選択肢1つぶん */
  .key-choice {
    font-size: 0.95rem;
  }

  /* 知らせることの一覧：うすい黄色の地に表示する */
  .notices {
    margin: 0 0 12px 0;
    padding: 8px 10px 8px 1.6em;
    font-size: 0.8rem;
    line-height: 1.6;
    background-color: #fff8e1;
    border-radius: 8px;
  }

  /* 判定できる音がないときの注意：赤い字 */
  .error {
    margin: 0 0 12px 0;
    font-size: 0.85rem;
    color: #c62828;
  }

  /* やめる・読み込むのボタンを右寄せで横に並べる */
  .button-row {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  /* ボタン共通 */
  button {
    padding: 10px 18px;
    font-size: 1rem;
    border-radius: 8px;
    cursor: pointer;
  }

  /* 押せない状態のボタン：薄く表示する */
  button:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  /* 「やめる」ボタン：白地に灰色の枠 */
  .cancel-button {
    color: #424242;
    background-color: white;
    border: 1px solid #bdbdbd;
  }

  /* 「読み込む」ボタン：青 */
  .confirm-button {
    color: white;
    background-color: #1976d2;
    border: 2px solid #1976d2;
  }
</style>
