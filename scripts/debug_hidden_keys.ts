import { nominalKeys, keyPairs } from "../src/lib/chartConstants";

function debug() {
  const key = "その他の消費支出（名目）";
  const pair = keyPairs.find((p) => p.nominal === key || p.real === key);
  console.log("Found pair:", pair);

  // nominalKeysに含まれているか
  console.log("In nominalKeys:", nominalKeys.includes(key));
}
debug();
