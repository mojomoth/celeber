/**
 * 한국어 조사 선택 (받침 유무). 색·아이템 이름이 데이터로 바뀌므로 '이(가)' 같은 병기를 피한다.
 * 한글로 끝나지 않으면(영문·숫자) 병기 형태로 돌려준다.
 */
type Pair = '이/가' | '은/는' | '을/를' | '와/과' | '로/으로' | '이에요/예요';

function lastJong(word: string): number | null {
  const ch = word.trim().replace(/[)\]'"’”\s]+$/, '').slice(-1);
  if (!ch) return null;
  const code = ch.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return null;
  return (code - 0xac00) % 28;
}

export function josa(word: string, pair: Pair): string {
  const j = lastJong(word);
  const [a, b] = pair.split('/') as [string, string];
  if (j === null) {
    if (pair === '로/으로') return '(으)로';
    return `${a}(${b})`;
  }
  const has = j !== 0;
  switch (pair) {
    case '이/가':
      return has ? '이' : '가';
    case '은/는':
      return has ? '은' : '는';
    case '을/를':
      return has ? '을' : '를';
    case '와/과':
      return has ? '과' : '와';
    case '로/으로':
      return has && j !== 8 ? '으로' : '로';
    case '이에요/예요':
      return has ? '이에요' : '예요';
  }
}

/** 단어 + 조사 */
export const wj = (word: string, pair: Pair) => `${word}${josa(word, pair)}`;
