<script>
  // 五線譜の設定値と、位置を計算する関数を読み込む
  import { STAFF_WIDTH, ROW_HEIGHT, LINE_POSITIONS, G_LINE_POSITION, CLEF_X, GLYPH_FONT_SIZE, GLYPHS, positionToY } from "#lib/staff.js";
</script>

<!-- 五線譜1段ぶんのSVG -->
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
</svg>

<style>
  /* 楽譜用フォント（Bravura）を読み込む */
  /* static フォルダの中のファイルは、「/fonts/〜」のように先頭に / を付けて指定する */
  @font-face {
    font-family: "Bravura";
    src: url("/fonts/bravura.woff2") format("woff2");
    /* フォントが読み込まれるまでは、文字を表示しない（別のフォントで変な記号が出るのを防ぐ） */
    font-display: block;
  }

  /* 五線譜全体：横幅いっぱいに表示する（高さは横幅に合わせて自動で決まる） */
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

  /* 楽譜用フォントで表示する記号 */
  .glyph {
    font-family: "Bravura";
    fill: #212121;
  }
</style>
