/** 자동완성 목록 키보드 처리 (순수 함수, 테스트용으로 분리) */
export type KeyEventLike = Pick<KeyboardEvent, 'key' | 'preventDefault'>;

/**
 * 자동완성 키 처리. 목록이 열려 있을 때 Esc는 목록만 닫는다.
 * preventDefault가 없으면 type=search 입력의 기본 동작으로 입력한 글자까지 지워진다.
 */
export function suggestKeyDown(e: KeyEventLike, showList: boolean, count: number, setActive: (f: (a: number) => number) => void, close: () => void): void {
  if (!showList) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    setActive((a) => Math.min(count - 1, a + 1));
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    setActive((a) => Math.max(-1, a - 1));
  } else if (e.key === 'Escape') {
    e.preventDefault();
    close();
  }
}
