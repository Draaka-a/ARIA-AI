'use strict';

/* Small shared text utilities: tokenizing, stop words, language guess.
   Deliberately dependency-free. */

const STOP_EN = ('a an the and or but if of to in on at by for with from as is are was were be been am do does did ' +
  'it its this that these those i me my we our you your he she they them his her their what which who whom how why ' +
  'when where can could would should will shall may might not no yes so than then there here about into over under ' +
  'tell please aria remember').split(' ');
const STOP_ID = ('yang dan di ke dari untuk dengan pada ini itu saya aku kamu anda dia mereka kami kita adalah ' +
  'apa siapa kapan dimana mana bagaimana gimana kenapa mengapa bisa akan sudah udah belum tidak nggak ga bukan ' +
  'atau juga lagi mau tolong dong sih ya nya punya ada jadi karena kalau jika agar oleh sebuah suatu tentang ' +
  'ingat bahwa').split(' ');
const STOP = new Set(STOP_EN.concat(STOP_ID));

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

const ID_HINT = /\b(yang|dan|ini|itu|saya|aku|kamu|anda|tidak|nggak|gak|akan|sudah|udah|bisa|dengan|untuk|adalah|apa|kenapa|bagaimana|gimana|tolong|kalau|karena|juga|lagi|mau|ingat|lupakan|bahwa|nama|proyek|buka|nyalakan|matikan|jam|berapa)\b/gi;
const EN_HINT = /\b(the|and|is|are|you|this|that|not|will|can|with|for|what|why|how|please|because|my|remember|forget|open|time|name|called)\b/gi;

/* 'id' or 'en' — whichever has more hint words; ties/no signal -> 'en'. */
function detectLanguage(text) {
  const id = (String(text).match(ID_HINT) || []).length;
  const en = (String(text).match(EN_HINT) || []).length;
  return id > en ? 'id' : 'en';
}

module.exports = { tokenize, detectLanguage, STOP };
