<main>
  <h1>バイオリン音程チェック</h1>

  <!-- 各ページへのリンク -->
  <nav>
    <a href="/score">楽譜の編集</a>
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
