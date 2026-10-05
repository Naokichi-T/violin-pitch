<!-- svelte:head の中に書いたものは、ページの「head」（画面には出ない、ページについての情報を書く場所）に入る -->
<svelte:head>
  <!-- title：ブラウザのタブと、検索結果の見出しに出る -->
  <title>バイオリン音程チェック｜音程を判定する練習アプリ</title>

  <!-- description：検索結果で、見出しの下に出る説明文 -->
  <meta
    name="description"
    content="バイオリンの音程を、マイクで聴いて判定する練習アプリ。楽譜を登録して、1音ずつ合わせる練習や、テンポに合わせて弾いて点数を出す練習ができます。基準音は442Hz、純正律・ピタゴラス音律・平均律に対応。"
  />
</svelte:head>

<main>
  <h1>バイオリン音程チェック</h1>

  <!-- 各ページへのリンク -->
  <nav>
    <a href="/score">楽譜の編集</a>
    <a href="/library">保存した楽譜</a>
    <a href="/practice">練習</a>
    <a href="/tuner">チューナー</a>
  </nav>
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

  /* リンクのエリア：リンクを縦に並べる */
  nav {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  /* 各ページへのリンク：指で押しやすいボタンのような見た目にする */
  nav a {
    display: block;
    padding: 16px;
    font-size: 1.2rem;
    color: white;
    background-color: #1976d2;
    border-radius: 8px;
    text-align: center;
    text-decoration: none;
  }
</style>
