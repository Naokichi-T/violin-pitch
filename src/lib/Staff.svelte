<script>
  // 五線譜の設定値と、位置を計算する関数を読み込む
  import { STAFF_WIDTH, ROW_HEIGHT, LINE_POSITIONS, G_LINE_POSITION, CLEF_X, STEM_WIDTH, GLYPH_FONT_SIZE, GLYPHS, positionToY, splitIntoRows, layoutNote } from "#lib/staff.js";

  // この部品を使う側から受け取る値
  // notes：表示する音の並び（音のデータの配列）
  let { notes } = $props();

  // 音の並びを、1段ぶん（8音）ずつに分けたもの
  // $derived を付けると、notes が変わるたびに自動で分け直される
  let rows = $derived(splitIntoRows(notes));
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

    <!-- 音符：段の中の音を1つずつ取り出して描く -->
    {#each row as note, indexInRow (indexInRow)}
      <!-- この音符の玉・棒・加線・変化記号の位置をまとめて計算する -->
      {@const layout = layoutNote(note, indexInRow)}

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

      <!-- 変化記号：♯か♭が付いている音にだけ、玉の左に表示する -->
      <!-- text-anchor="end" を付けると、x の位置が文字の右端になる -->
      {#if layout.accidentalGlyph !== ""}
        <text class="glyph" x={layout.accidentalX} y={layout.y} font-size={GLYPH_FONT_SIZE} text-anchor="end">
          {layout.accidentalGlyph}
        </text>
      {/if}
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

  /* 楽譜用フォントで表示する記号（ト音記号・玉・変化記号） */
  .glyph {
    font-family: "Bravura";
    fill: #212121;
  }
</style>
