import { loadCpiData } from "../server/lib/dataLoader";

async function inspect() {
  const data = await loadCpiData();
  const sample = data[data.length - 1];
  console.log("Sample keys:", Object.keys(sample));
  console.log("Has '諸雑費・CPI外支出等（名目）':", "諸雑費・CPI外支出等（名目）" in sample);
  console.log("Has 'その他の消費支出（名目）':", "その他の消費支出（名目）" in sample);
}

inspect();
