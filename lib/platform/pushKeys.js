import crypto from "node:crypto";

// Τα κλειδιά VAPID των ειδοποιήσεων (αυτά που αποδεικνύουν στις υπηρεσίες των
// browsers ότι τα push έρχονται από την εφαρμογή). Δεν μπαίνουν ως δύο
// μεταβλητές στο Vercel: βγαίνουν πάντα ίδια από ένα μυστικό του διακομιστή,
// οπότε δεν υπάρχει τίποτα παραπάνω να ρυθμιστεί ή να χαθεί.
//
//   PLATFORM_PUSH_SEED   προαιρετικό, δικό του μυστικό (προτεραιότητα)
//   αλλιώς               το PLATFORM_SUPABASE_SERVICE_ROLE_KEY
//
// Προσοχή: αν αλλάξει το μυστικό, αλλάζουν και τα κλειδιά και κάθε συσκευή
// χρειάζεται να ενεργοποιήσει ξανά τις ειδοποιήσεις. Γι' αυτό το
// PLATFORM_PUSH_SEED είναι ο σταθερός τρόπος αν θα αλλάξει ποτέ το service key.
const b64url = (buf) => Buffer.from(buf).toString("base64url");

export function pushSeed(env = process.env) {
  return env.PLATFORM_PUSH_SEED || env.PLATFORM_SUPABASE_SERVICE_ROLE_KEY || "";
}

export function vapidKeys(seed = pushSeed()) {
  if (!seed || String(seed).length < 16) return null;
  for (let i = 0; i < 16; i++) {
    const raw = crypto.hkdfSync("sha256", Buffer.from(String(seed)), Buffer.from("skipperfinder-push"), Buffer.from(`vapid-v1-${i}`), 32);
    const ecdh = crypto.createECDH("prime256v1");
    try {
      ecdh.setPrivateKey(Buffer.from(raw));
    } catch {
      continue; // τιμή εκτός πεδίου (πρακτικά ποτέ)· δοκιμάζεται η επόμενη
    }
    return { privateKey: b64url(raw), publicKey: b64url(ecdh.getPublicKey(null, "uncompressed")) };
  }
  return null;
}
