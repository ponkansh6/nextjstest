import { CONSUMPTION_NOMINAL_KEYS, keyPairs } from "../src/lib/chartConstants";

function debug() {
  const key = "その他の消費支出（名目）";
  const pair = keyPairs.find((p) => p.nominal === key || p.real === key);
  console.log("Found pair:", pair);

  // CONSUMPTION_NOMINAL_KEYSに含まれているか
  console.log("In CONSUMPTION_NOMINAL_KEYS:", CONSUMPTION_NOMINAL_KEYS.includes(key));
}
debug();
