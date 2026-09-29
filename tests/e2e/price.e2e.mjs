// 0118: καμία τιμή από την πλατφόρμα. Το πεδίο τιμής είναι κενό μέχρι να το
// γράψει ο επαγγελματίας, δεν λέει «ελάχιστη τιμή», και δέχεται όποια τιμή.
import { as, go, text, check, finish, sql, num } from "./lib.mjs";

const PETROS = "6900002007"; // επαγγελματίας του σεναρίου
const uid = sql(`select id from users where phone_number = '+30${PETROS}'`);
const before = sql(`select price_per_day from skipper_profiles where user_id = '${uid}'`);

// Το προφίλ να είναι κατά τα άλλα πλήρες (γλώσσες, τύπος σκάφους, εθνικότητα).
sql(`insert into user_languages (user_id, language_id) select '${uid}', id from languages limit 1 on conflict do nothing;
     update users set nationality_id = (select id from nationalities limit 1) where id = '${uid}' and nationality_id is null;`);
const photo0 = sql(`select coalesce(photo_url, '') from users where id = '${uid}'`);
sql(`select set_config('platform.trusted', 'true', false); update users set photo_url = 'https://proj.supabase.co/storage/v1/object/public/crew-photos/${uid}/1.jpg' where id = '${uid}'`);
const gender0 = sql(`select coalesce(gender, '') from skipper_profiles where user_id = '${uid}'`);
sql(`update skipper_profiles set gender = 'Άνδρας' where user_id = '${uid}'`);
// Ξεκινά χωρίς τιμή, όπως ένας νέος επαγγελματίας.
sql(`select set_config('platform.trusted', 'true', false); update skipper_profiles set price_per_day = null where user_id = '${uid}'`);

await as(PETROS, async (page) => {
  await go(page, "/platform/profile");
  const t = await text(page);
  check("καμία αναφορά σε ελάχιστη τιμή", !/ελάχιστη|τουλάχιστον 2|210/i.test(t), t.slice(0, 400));
  const price = page.locator("#p-price");
  check("το πεδίο τιμής είναι κενό", (await price.inputValue()) === "");
  await price.fill("100");
  await page.getByRole("button", { name: "Αποθήκευση προφίλ" }).click();
  await page.waitForTimeout(1500);
  globalThis.__after = await page.evaluate(() => [...document.querySelectorAll("p,div,span")].filter((e) => getComputedStyle(e).color === "rgb(166, 58, 46)" && e.children.length === 0).map((e) => e.textContent).join(" | ") || "καμία κόκκινη ένδειξη");
});
check("οι 100 € αποθηκεύτηκαν", num(`select coalesce(price_per_day, 0) from skipper_profiles where user_id = '${uid}'`) === 100, (globalThis.__after || "").match(/(Επίλεξε|Συμπλήρωσε|Γράψε)[^.]*\./)?.[0] || (globalThis.__after || "").slice(0, 300));

// Επαναφορά για τα επόμενα σενάρια.
sql(`select set_config('platform.trusted', 'true', false); update users set photo_url = ${photo0 ? `'${photo0}'` : 'null'} where id = '${uid}'`);
sql(`update skipper_profiles set gender = ${gender0 ? `'${gender0}'` : 'null'} where user_id = '${uid}'`);
sql(`select set_config('platform.trusted', 'true', false); update skipper_profiles set price_per_day = ${before === "" ? "null" : before} where user_id = '${uid}'`);

finish();
