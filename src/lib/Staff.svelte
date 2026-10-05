<script>
  // 五線譜の設定値と、位置を計算する関数を読み込む
  import {
    STAFF_WIDTH,
    ROW_HEIGHT,
    LINE_POSITIONS,
    G_LINE_POSITION,
    CLEF_X,
    NOTES_PER_ROW,
    STEM_WIDTH,
    GLYPH_FONT_SIZE,
    GLYPHS,
    positionToY,
    splitIntoRows,
    layoutKeySignature,
    layoutNote,
  } from "#lib/staff.js";

  // この部品を使う側から受け取る値
  // notes         ：表示する音の並び（音のデータの配列）
  // signature     ：調号の数（プラスは♯の数、マイナスは♭の数、0 は調号なし）
  // selectedIndex ：選択中の音が何番目か（0から始まる）。選択していないときは null
  // onselect      ：音符がタップされたときに呼ぶ関数。何番目の音かを渡す
  // selectedIndex と onselect は、渡されなかったときのための初期値を決めておく
  let { notes, signature, selectedIndex = null, onselect = () => {} } = $props();

  // 音の並びを、1段ぶん（8音）ずつに分けたもの
  // $derived を付けると、notes が変わるたびに自動で分け直される
  let rows = $derived(splitIntoRows(notes));

  // 調号の記号それぞれの、文字と位置
  // 調号はどの段でも同じなので、段ごとではなくここで1回だけ計算する
  let keySignatureSymbols = $derived(layoutKeySignature(signature));

  /**
   * 音符の上でキーが押されたときの処理をする関数
   * キーボードで操作する人のために、Enter キーかスペースキーでも音符を選べるようにする。
   * @param {KeyboardEvent} event - キーが押されたときの情報
   * @param {number} noteIndex - 何番目の音か（0から始まる）
   */
  function handleKeydown(event, noteIndex) {
    if (event.key === "Enter" || event.key === " ") {
      // スペースキーで画面がスクロールしてしまうのを防ぐ
      event.preventDefault();

      // タップされたときと同じように、選ばれたことを伝える
      onselect(noteIndex);
    }
  }
</script>

<!-- 段を1つずつ取り出して、段ごとに1つのSVGを描く -->
{#each rows as row, rowIndex (rowIndex)}
  <!-- viewBox で「中の座標の範囲」を決めておくと、画面の幅に合わせて全体が拡大・縮小される -->
  <svg class="staff" viewBox="0 0 {STAFF_WIDTH} {ROW_HEIGHT}">
    <!-- 五線：5本の線を、通し番号から縦の位置を計算して引く -->
    {#each LINE_POSITIONS as position (position)}
      <line class="staff-line" x1="0" y1={positionToY(position)} x2={STAFF_WIDTH} y2={positionToY(position)} />
    {/each}

    <!-- ト音記号：楽譜用フォントの文字として表示する -->
    <!-- 文字の基準の位置（y）をソの線に合わせると、渦の中心がソの線に重なる -->
    <text class="glyph" x={CLEF_X} y={positionToY(G_LINE_POSITION)} font-size={GLYPH_FONT_SIZE}>
      {GLYPHS.gClef}
    </text>

    <!-- 調号：ト音記号の右に、♯か♭を決まった順番と高さで並べる -->
    {#each keySignatureSymbols as symbol, symbolIndex (symbolIndex)}
      <text class="glyph" x={symbol.x} y={symbol.y} font-size={GLYPH_FONT_SIZE}>
        {symbol.glyph}
      </text>
    {/each}

    <!-- 音符：段の中の音を1つずつ取り出して描く -->
    {#each row as note, indexInRow (indexInRow)}
      <!-- この音符の玉・棒・加線・変化記号の位置をまとめて計算する -->
      <!-- 調号の数によって音符の横の位置が変わるので、signature も渡す -->
      {@const layout = layoutNote(note, indexInRow, signature)}

      <!-- 楽譜全体の中で何番目の音か（段の番号 × 1段の音符の数 ＋ 段の中での順番） -->
      {@const noteIndex = rowIndex * NOTES_PER_ROW + indexInRow}

      <!-- 音符1つぶんのグループ。g は、SVGの中で複数の図形をまとめるための入れ物 -->
      <!-- このグループのどこをタップしても、この音が選ばれる -->
      <!-- role・tabindex・aria-label・onkeydown は、キーボードや読み上げで操作する人のための設定 -->
      <g
        class="note"
        class:selected={noteIndex === selectedIndex}
        role="button"
        tabindex="0"
        aria-label="{noteIndex + 1}番目の音"
        onclick={() => onselect(noteIndex)}
        onkeydown={(event) => handleKeydown(event, noteIndex)}
      >
        <!-- タップできる範囲：音符が入っている縦の帯の全体 -->
        <!-- ふだんは透明で、選択中だけ薄い青になる。玉が小さくても押しやすくするためのもの -->
        <rect class="hit-area" x={layout.hitX} y="0" width={layout.hitWidth} height={ROW_HEIGHT} />

        <!-- 加線：五線からはみ出した音にだけ、必要な本数ぶん引く -->
        {#each layout.ledgerYs as ledgerY (ledgerY)}
          <line class="ledger-line" x1={layout.ledgerX1} y1={ledgerY} x2={layout.ledgerX2} y2={ledgerY} />
        {/each}

        <!-- 棒：付け根から先端まで、まっすぐな線を引く -->
        <line class="stem" x1={layout.stemX} y1={layout.stemY1} x2={layout.stemX} y2={layout.stemY2} stroke-width={STEM_WIDTH} />

        <!-- 玉：楽譜用フォントの文字として表示する -->
        <!-- text-anchor="middle" を付けると、x の位置が文字の横の中心になる -->
        <text class="glyph" x={layout.x} y={layout.y} font-size={GLYPH_FONT_SIZE} text-anchor="middle">
          {GLYPHS.notehead}
        </text>

        <!-- 変化記号：調号と違う音にだけ、♯・♭・♮を玉の左に表示する -->
        <!-- text-anchor="end" を付けると、x の位置が文字の右端になる -->
        {#if layout.accidentalGlyph !== ""}
          <text class="glyph" x={layout.accidentalX} y={layout.y} font-size={GLYPH_FONT_SIZE} text-anchor="end">
            {layout.accidentalGlyph}
          </text>
        {/if}
      </g>
    {/each}
  </svg>
{/each}

<style>
  /* 楽譜用フォント（Bravura）を読み込む */
  /* static フォルダの中のファイルは、「/fonts/〜」のように先頭に / を付けて指定する */
  @font-face {
    font-family: "Bravura";
    src: url("/fonts/bravura.woff2") format("woff2");
    /* フォントが読み込まれるまでは、文字を表示しない（別のフォントで変な記号が出るのを防ぐ） */
    font-display: block;
  }

  /* 五線譜1段ぶん：横幅いっぱいに表示する（高さは横幅に合わせて自動で決まる） */
  .staff {
    display: block;
    width: 100%;
    height: auto;
    /* 記号は文字として表示しているが、文章ではないので、選択できないようにする */
    /* （タップしたときに、ブラウザが文字入力用のカーソルを出すのを防ぐ） */
    user-select: none;
    -webkit-user-select: none;
  }

  /* 五線の線 */
  .staff-line {
    stroke: #212121;
    stroke-width: 1;
  }

  /* 加線（五線より少し太くして、見やすくする） */
  .ledger-line {
    stroke: #212121;
    stroke-width: 1.2;
  }

  /* 音符の棒（太さは staff.js の設定値を使うので、ここでは色だけ決める） */
  .stem {
    stroke: #212121;
  }

  /* 楽譜用フォントで表示する記号（ト音記号・調号・玉・変化記号） */
  .glyph {
    font-family: "Bravura";
    fill: #212121;
  }

  /* 音符1つぶんのグループ：押せることが分かるように、マウスの形を指にする */
  .note {
    cursor: pointer;
    /* タップしたときにブラウザが付ける枠や色を消す（選択中の表示は自分で付けるため） */
    outline: none;
    -webkit-tap-highlight-color: transparent;
    /* 文字入力用のカーソルが出てしまった場合でも、見えないようにする */
    caret-color: transparent;
  }

  /* タップできる範囲：ふだんは透明 */
  /* fill を none にするとタップに反応しなくなるので、「透明な色で塗る」指定にしている */
  .hit-area {
    fill: transparent;
  }

  /* 選択中の音符：帯を薄い青にする */
  .note.selected .hit-area {
    fill: #bbdefb;
  }

  /* 選択中の音符：玉と変化記号を青にする */
  .note.selected .glyph {
    fill: #0d47a1;
  }

  /* 選択中の音符：棒と加線を青にする */
  .note.selected .stem,
  .note.selected .ledger-line {
    stroke: #0d47a1;
  }

  /* キーボードで音符に移動したとき：どの音符にいるか分かるように、帯に枠を付ける */
  .note:focus-visible .hit-area {
    stroke: #1976d2;
    stroke-width: 2;
  }
</style>
