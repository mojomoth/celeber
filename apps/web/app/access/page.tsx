import { Header, Screen } from '@/ui';
import s from './access.module.css';

export default async function Page({ searchParams }: { searchParams: Promise<{ failed?: string }> }) {
  const { failed } = await searchParams;
  return (
    <Screen>
      <Header title="CELEBER" />
      <form className={s.form} action="/api/access" method="post">
        <h1 className="t-h2">접속 코드를 입력해 주세요</h1>
        <label htmlFor="access-code">접속 코드</label>
        <input type="password" id="access-code" name="code" autoComplete="current-password" maxLength={192} required />
        {failed && <p className={s.error} role="alert">접속 코드가 맞지 않아요.</p>}
        <button type="submit" className={s.submit}>열기</button>
      </form>
    </Screen>
  );
}
