/**
 * MediaPipe wasm은 INFO·W(경고) 로그를 console.error로 찍는다(emscripten 기본 err 출력).
 * dev에서는 Next 오버레이가 이를 'Issues'로 세어 배지를 띄우고, 그 배지가 촬영 화면 왼쪽 아래 버튼을 가린다.
 * wasm 로더는 모듈을 만들 때 console.error를 bind하므로, 모델을 만들기 전에 한 번 감싸 두면 된다.
 * 오류(E…/F…) 줄과 그 밖의 console.error는 그대로 통과한다. 걸러 낸 줄은 console.info로 남긴다.
 */
const INFO_LINE = /^(INFO: |[IW]\d{4} \d\d:\d\d:\d\d)/;

export function isMediapipeInfoLog(args: readonly unknown[]): boolean {
  return typeof args[0] === 'string' && INFO_LINE.test(args[0]);
}

const patched = new WeakSet<object>();

/** 한 번만 감싼다(같은 콘솔 객체에 다시 불러도 그대로). */
export function quietMediapipeInfoLogs(con: Pick<Console, 'error' | 'info'> = console): void {
  if (patched.has(con)) return;
  patched.add(con);
  const original = con.error.bind(con);
  const info = con.info.bind(con);
  con.error = (...args: unknown[]) => (isMediapipeInfoLog(args) ? info(...args) : original(...args));
}
