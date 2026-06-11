const demoSummary = [
  { name: "李白", count: 6 },
  { name: "武则天", count: 9 },
  { name: "诸葛亮", count: 12 }
];

export default function HomePage() {
  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">猜历史人物 · 计划中</p>
        <h1>问一问，猜一猜</h1>
        <p className="lead">这是项目骨架。接下来会补入场、主页、问答页和实时同步。</p>
      </section>

      <section className="mysteryCard" aria-label="当前谜题">
        <span className="mysteryMark">?</span>
        <span className="mysteryMeta">已提问 0 次</span>
      </section>

      <section className="panel">
        <h2>已猜出人物</h2>
        <ul className="list">
          {demoSummary.map((item) => (
            <li key={item.name} className="listRow">
              <span>{item.name}</span>
              <span>{item.count} 次</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
